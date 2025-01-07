const electron = require('electron');
const { BrowserWindow, ipcMain, dialog, shell } = electron;
const app = electron.app;
const path = require('path');
const Store = require('electron-store');
const fs = require('fs').promises;
const http = require('http');
const ollamaManager = require('./ollama');
const configWindow = require('./config-window');
const stylesManager = require('./styles-manager');
const stylesWindow = require('./styles-window');
const settingsManager = require('./settings-manager');
const settingsWindow = require('./settings-window');
const themeManager = require('./theme-manager');
const styleSettingsWindow = require('./style-settings-window');
const { exec } = require('child_process');
const net = require('net');
const visionWindow = require('./vision-window');
const modelInstallWindow = require('./model-install-window');
const startupWindow = require('./startup-window');
const configManager = require('./config-manager');
const styleEditWindow = require('./style-edit-window');
const fsSync = require('fs');
const modelImportWindow = require('./model-import-window');
const styleSelectionWindow = require('./style-selection-window');
const sharp = require('sharp');
const { PythonShell } = require('python-shell');
const ort = require('onnxruntime-node');
const { spawn } = require('child_process');
const https = require('https');
const dependenciesWindow = require('./dependencies-window');
const creditsWindow = require('./credits-window');
const fetch = require('node-fetch');

// Initialize electron store with schema
const store = new Store({
    schema: {
        settings: {
            type: 'object',
            properties: {
                theme: {
                    type: 'string',
                    default: 'purple'
                },
                firstLaunch: {
                    type: 'boolean',
                    default: true
                },
                windowSize: {
                    type: 'object',
                    properties: {
                        width: {
                            type: 'number',
                            default: 1200
                        },
                        height: {
                            type: 'number',
                            default: 800
                        }
                    }
                }
            }
        }
    }
});

// Global variables
let mainWindow = null;
let ollamaConfigWindow = null;

// Constants
const APP_VERSION = 'v1.0';
const DRAW_THINGS_PATH = '/Applications/Draw Things.app';
const DRAW_THINGS_PORT = 3333;
let SAFETENSORS_MODELS_PATH;
let CUSTOM_MODELS_PATH;

// Get default models from config
const config = configManager.getConfig();
const DEFAULT_TEXT_MODEL = config.currentModel || 'llama2';
const DEFAULT_VISION_MODEL = config.visionModel || 'llava';

// Initialize paths that require app to be ready
function initializePaths() {
    SAFETENSORS_MODELS_PATH = path.join(app.getPath('userData'), 'models');
    CUSTOM_MODELS_PATH = path.join(app.getPath('userData'), 'custom-models');
}

class AppStartupManager {
    constructor() {
        this.startup = null;
        this.mainWindow = null;
        this.retryAttempts = 0;
        this.maxRetries = 3;
        this.retryTimeout = null;
        this.isStartupComplete = false;
    }

    async initializeApp() {
        try {
            this.isStartupComplete = false;
            
            // Create startup window if it doesn't exist
            if (!this.startup) {
                this.startup = startupWindow.create();
            }

            this.updateStartupProgress('Checking system resources...', 10);
            await this.checkSystemResources();

            this.updateStartupProgress('Initializing configuration...', 30);
            await this.initializeConfiguration();

            // Initialize Ollama Manager
            this.updateStartupProgress('Initializing Ollama Manager...', 40);
            const ollamaInitialized = await ollamaManager.initialize((progress, status, message) => {
                if (this.startup) {
                    this.startup.webContents.send('startup-progress', { progress, status, message });
                }
            });
            if (!ollamaInitialized) {
                // Show a dialog with instructions
                const { response } = await dialog.showMessageBox(this.startup, {
                    type: 'error',
                    title: 'Ollama Not Available',
                    message: 'Could not connect to Ollama service',
                    detail: 'Please ensure that:\n\n1. Ollama is installed on your system\n2. You can run "ollama serve" from the terminal\n\nWould you like to visit the Ollama installation page?',
                    buttons: ['Visit Ollama Website', 'Cancel'],
                    defaultId: 0,
                    cancelId: 1
                });

                if (response === 0) {
                    shell.openExternal('https://ollama.ai/download');
                }
                
                throw new Error('Failed to initialize Ollama Manager. Please install Ollama and try again.');
            }

            // Set up IPC handlers for model import
            modelImportWindow.setupIpcHandlers();

            this.updateStartupProgress('Setting up models...', 50);
            await setupDefaultModels();

            this.updateStartupProgress('Creating main window...', 90);
            try {
                // Create main window but don't show it yet
                this.mainWindow = await createWindow();
                
                // Signal initialization complete
                if (this.startup) {
                    this.startup.webContents.send('initialization-complete');
                }

                this.updateStartupProgress('Finalizing startup...', 95);
                this.isStartupComplete = true;
                this.updateStartupProgress('Startup complete', 100);

                // Close startup window and show main window after a short delay
                setTimeout(() => {
                    if (this.startup && !this.startup.isDestroyed()) {
                        this.startup.close();
                    }
                    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                        this.mainWindow.show();
                        this.mainWindow.focus();
                    }
                }, 500);
                
            } catch (error) {
                console.error('Error creating main window:', error);
                throw error;
            }
        } catch (error) {
            console.error('Startup error:', error);
            const detailedError = this.getDetailedErrorMessage(error);
            if (this.startup && !this.startup.isDestroyed()) {
                this.startup.webContents.send('startup-error', detailedError);
            }
            throw error;
        }
    }

    getDetailedErrorMessage(error) {
        let message = error.message || 'Unknown error occurred';
        
        if (error.code === 'ENOENT') {
            message = 'Required file or directory not found: ' + message;
        } else if (error.code === 'EACCES') {
            message = 'Permission denied: ' + message;
        } else if (error.code === 'ECONNREFUSED') {
            message = 'Connection failed: ' + message;
        }
        
        return message;
    }

    updateStartupProgress(status, progress) {
        if (this.startup && !this.startup.isDestroyed()) {
            this.startup.webContents.send('startup-progress', {
                status,
                progress: Math.min(100, Math.max(0, progress))
            });
        }
    }

    async retry() {
        if (this.retryAttempts >= this.maxRetries) {
            const error = new Error('Maximum retry attempts reached. Please restart the application.');
            if (this.startup && !this.startup.isDestroyed()) {
                this.startup.webContents.send('startup-error', error.message);
            }
            return;
        }

        this.retryAttempts++;
        clearTimeout(this.retryTimeout);
        
        try {
            await this.initializeApp();
        } catch (error) {
            console.error('Retry attempt failed:', error);
            this.retryTimeout = setTimeout(() => this.retry(), 3000);
        }
    }

    async checkSystemResources() {
        const minMemoryMB = 512;
        
        // Get system memory info using OS module
        const os = require('os');
        const totalMemoryMB = Math.floor(os.totalmem() / (1024 * 1024));
        
        // On macOS, we'll consider both free memory and cached memory as available
        const exec = require('child_process').exec;
        
        return new Promise((resolve, reject) => {
            // Use vm_stat command on macOS to get more accurate memory information
            exec('vm_stat', (error, stdout, stderr) => {
                if (error) {
                    // Fallback to os.freemem() if vm_stat fails
                    const freeMemoryMB = Math.floor(os.freemem() / (1024 * 1024));
                    console.log(`System Memory (fallback) - Total: ${totalMemoryMB}MB, Free: ${freeMemoryMB}MB`);
                    
                    if (freeMemoryMB < minMemoryMB) {
                        reject(new Error(`Insufficient system memory. Available: ${freeMemoryMB}MB, Required: ${minMemoryMB}MB`));
                    }
                    resolve();
                } else {
                    // Parse vm_stat output
                    const lines = stdout.split('\n');
                    const stats = {};
                    
                    lines.forEach(line => {
                        const matches = line.match(/"(.+)":\s+(\d+)/);
                        if (matches) {
                            stats[matches[1]] = parseInt(matches[2], 10) * 4096; // Convert pages to bytes
                        }
                    });
                    
                    // Calculate available memory (free + inactive + cached)
                    const availableMemoryMB = Math.floor(
                        (stats['Pages free'] + 
                         stats['Pages inactive'] + 
                         stats['Pages purgeable']) / (1024 * 1024)
                    );
                    
                    console.log(`System Memory - Total: ${totalMemoryMB}MB, Available: ${availableMemoryMB}MB`);
                    
                    if (availableMemoryMB < minMemoryMB) {
                        reject(new Error(`Insufficient system memory. Available: ${availableMemoryMB}MB, Required: ${minMemoryMB}MB`));
                    }
                    resolve();
                }
            });
        });
        
        // Log Node.js process memory for debugging purposes
        const processMemory = process.memoryUsage();
        const heapUsedMB = Math.floor(processMemory.heapUsed / (1024 * 1024));
        const heapTotalMB = Math.floor(processMemory.heapTotal / (1024 * 1024));
        
        console.log(`Process Memory - Heap Used: ${heapUsedMB}MB, Heap Total: ${heapTotalMB}MB`);
    }

    async initializeConfiguration() {
        try {
            console.log('Initializing configuration...');
            // Ensure user data directory exists
            const userDataPath = app.getPath('userData');
            try {
                await fs.mkdir(userDataPath, { recursive: true });
            } catch (mkdirError) {
                // Ignore if directory already exists
                if (mkdirError.code !== 'EEXIST') {
                    console.error('Error creating user data directory:', mkdirError);
                }
            }
            
            // Initialize managers
            await settingsManager.loadSettings();
            const styles = await initializeStyles();
            await stylesManager.loadStyles(styles);
            
            console.log('Configuration initialized successfully');
        } catch (error) {
            console.error('Error initializing configuration:', error);
            throw new Error('Failed to initialize application configuration: ' + error.message);
        }
    }

    async createMainWindow() {
        if (!this.mainWindow) {
            console.log('Creating main window through AppStartupManager...');
            this.mainWindow = await createWindow();
        }
        return this.mainWindow;
    }

    handleStartupError(error) {
        console.error('Startup error:', error);
        const detailedError = this.getDetailedErrorMessage(error);
        if (this.startup && !this.startup.isDestroyed()) {
            this.startup.webContents.send('startup-error', detailedError);
        }
        // Add retry mechanism
        setTimeout(() => this.retry(), 3000);
    }
}

// Create instance of AppStartupManager
const appStartupManager = new AppStartupManager();

// Initialize styles
async function initializeStyles() {
    try {
        console.log('Initializing styles...');
        await stylesManager.initialize();  // Make sure to initialize first
        const styles = await stylesManager.getAllStyles();
        console.log('Loaded styles:', styles);
        return styles;
    } catch (error) {
        console.error('Error initializing styles:', error);
        throw error;
    }
};

// Setup default models for the application
async function setupDefaultModels() {
    try {
        console.log('Setting up default models...');
        const installedModels = await ollamaManager.listModels();
        console.log('Installed models:', installedModels);

        if (!installedModels || !installedModels.models || installedModels.models.length === 0) {
            console.log('No models installed');
            return;
        }

        // Get current config
        const configPath = path.join(app.getPath('userData'), 'config.json');
        let config;
        try {
            const configData = await fs.readFile(configPath, 'utf8');
            config = JSON.parse(configData);
        } catch (error) {
            config = {};
        }

        const isVisionModel = (model) => {
            const name = model.name.toLowerCase();
            return name.includes('llava') || 
                   name.includes('vision') || 
                   name.includes('bakllava');
        };

        // Set default text model if none is set
        let currentModel = config.currentModel;
        if (!currentModel) {
            const defaultTextModel = installedModels.models.find(model => 
                !isVisionModel(model)
            );
            if (defaultTextModel) {
                currentModel = defaultTextModel.name;
                config.currentModel = currentModel;
                console.log('Set default text model:', defaultTextModel.name);
            }
        }

        // Validate that the current model exists in installed models
        const modelExists = installedModels.models.some(model => model.name === currentModel);
        if (!modelExists) {
            console.log('Current model not found in installed models, selecting first available text model');
            const defaultTextModel = installedModels.models.find(model => !isVisionModel(model));
            if (defaultTextModel) {
                currentModel = defaultTextModel.name;
                config.currentModel = currentModel;
                console.log('Set default text model:', defaultTextModel.name);
            }
        }

        // Set the default model in OllamaManager
        if (currentModel) {
            ollamaManager.setDefaultModel(currentModel);
            console.log('Set OllamaManager default model to:', currentModel);
        } else {
            console.error('No suitable text model found');
            throw new Error('No suitable text model found');
        }

        // Set default vision model if none is set
        if (!config.visionModel) {
            const defaultVisionModel = installedModels.models.find(model => 
                isVisionModel(model)
            );
            if (defaultVisionModel) {
                config.visionModel = defaultVisionModel.name;
                console.log('Set default vision model:', defaultVisionModel.name);
            }
        }

        // Save config if changes were made
        if (config.currentModel || config.visionModel) {
            await fs.writeFile(configPath, JSON.stringify(config, null, 2));
            console.log('Saved default models config:', config);
        }
    } catch (error) {
        console.error('Error setting up default models:', error);
        throw error;
    }
}

// Create main application window
async function createWindow() {
    // Get saved window size
    const windowSize = store.get('settings.windowSize', { width: 1200, height: 800 });
    console.log('Loading saved window size:', windowSize);

    mainWindow = new BrowserWindow({
        width: windowSize.width,
        height: windowSize.height,
        minWidth: 800,
        minHeight: 600,
        show: false,
        frame: false,
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: -100, y: -100 }, // Hide traffic lights
        titleBarOverlay: false,
        backgroundColor: '#1e1b2e',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
            spellcheck: false,
            backgroundThrottling: false
        }
    });

    // Enable hardware acceleration
    app.commandLine.appendSwitch('enable-accelerated-compositing');
    app.commandLine.appendSwitch('enable-gpu-rasterization');
    app.commandLine.appendSwitch('enable-zero-copy');
    app.commandLine.appendSwitch('ignore-gpu-blacklist');

    await mainWindow.loadFile('index.html');

    // Optimize rendering
    mainWindow.webContents.setZoomFactor(1.0);
    mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
    mainWindow.webContents.setBackgroundThrottling(false);

    // Save window size when it's resized
    mainWindow.on('resize', () => {
        const [width, height] = mainWindow.getSize();
        console.log('Saving new window size:', { width, height });
        store.set('settings.windowSize', { width, height });
    });

    // Save window size when it's closed
    mainWindow.on('close', () => {
        const [width, height] = mainWindow.getSize();
        console.log('Saving window size before close:', { width, height });
        store.set('settings.windowSize', { width, height });
    });

    return mainWindow;
}

// Create startup window
function createStartupWindow() {
    const startup = new BrowserWindow({
        width: 450,
        height: 550,
        frame: false,
        resizable: false,
        show: false,
        center: true,
        useContentSize: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        backgroundColor: '#1e1b2e'
    });

    startup.loadFile('startup.html');
    startup.once('ready-to-show', () => {
        startup.show();
        startup.focus();
    });

    return startup;
}

// Ollama configuration window
function createOllamaConfigWindow() {
    if (ollamaConfigWindow) {
        ollamaConfigWindow.focus();
        return;
    }

    ollamaConfigWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: false,
        parent: mainWindow,
        modal: true,
        show: false
    });

    ollamaConfigWindow.loadFile('config.html');

    ollamaConfigWindow.once('ready-to-show', () => {
        ollamaConfigWindow.show();
    });

    ollamaConfigWindow.on('closed', () => {
        ollamaConfigWindow = null;
    });
}

// Helper function to format model name
function formatModelName(name) {
    // Remove any existing tags first
    const baseName = name.split(':')[0];
    
    // Map our display names to Ollama model names
    const modelMap = {
        'llama3.2': 'llama2',
        'llama3.1': 'llama2',
        'llama3': 'llama2',
        'llama2': 'llama2',
        'dolphin-mistral': 'dolphin-mixtral',
        'dolphin-llama3': 'dolphin-phi',
        'mistral': 'mistral',
        'gemma': 'gemma',
        'gemma2': 'gemma',
        'qwen2': 'qwen',
        'llama3.2-vision': 'llama2',
        'llava': 'llava',
        'bakllava': 'bakllava'
    };

    // Get the correct model name
    const ollamaName = modelMap[baseName] || baseName;
    
    // Add :latest tag
    return `${ollamaName}:latest`;
}

// Ollama IPC handlers
ipcMain.handle('check-ollama-connection', async () => {
    try {
        const response = await fetch('http://127.0.0.1:11434/api/tags');
        return response.ok;
    } catch (error) {
        console.error('Failed to connect to Ollama:', error);
        return false;
    }
});

ipcMain.handle('remove-model', async (event, modelName) => {
    try {
        const formattedName = formatModelName(modelName);
        console.log('Removing model:', formattedName);
        
        const response = await fetch(`http://localhost:11434/api/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: formattedName })
        });
        
        if (!response.ok) {
            const text = await response.text();
            console.error('Delete response:', response.status, text);
            throw new Error(`Failed to remove model: ${response.status} ${response.statusText} ${text ? `- ${text}` : ''}`);
        }
        return true;
    } catch (error) {
        console.error('Failed to remove model:', error);
        throw error;
    }
});

ipcMain.on('close-config', () => {
    if (ollamaConfigWindow) {
        ollamaConfigWindow.close();
    }
});

// Handle app ready
app.whenReady().then(async () => {
    initializePaths();
    await initializeStyles();
    
    // Check if this is the first launch
    const isFirstLaunch = store.get('settings.firstLaunch', true);
    
    if (isFirstLaunch) {
        // Create and show style selection window
        styleSelectionWindow.createStyleSelectionWindow();
    } else {
        // Create and set startup window as normal
        appStartupManager.startup = createStartupWindow();
    }

    // Set up IPC handlers
    ipcMain.on('startup-window-ready', () => {
        appStartupManager.initializeApp().catch(error => {
            console.error('Failed to initialize app:', error);
        });
    });

    // Add handler for tag generation
    ipcMain.handle('generate-tags', async (event, { text, systemPrompt }) => {
        try {
            const config = configManager.getConfig();
            const currentModel = config.currentModel || 'llama2';
            
            const response = await fetch('http://127.0.0.1:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: currentModel,
                    prompt: systemPrompt + '\n\nInput text: "' + text + '"',
                    stream: false
                })
            });

            if (!response.ok) {
                throw new Error('Failed to generate tags');
            }

            const data = await response.json();
            return data.response;
        } catch (error) {
            console.error('Error generating tags:', error);
            throw error;
        }
    });

    // Prevent duplicate window creation
    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            await createWindow();
        }
    });

    // Handle window-all-closed event
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    // Set up IPC handlers
    ipcMain.on('retry-startup', () => {
        appStartupManager.retry();
    });

    // Add list-models and get-config handlers
    ipcMain.handle('list-models', async () => {
        return await ollamaManager.listModels();
    });

    ipcMain.handle('get-config', async () => {
        try {
            const configPath = path.join(app.getPath('userData'), 'config.json');
            const configData = await fs.readFile(configPath, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            console.error('Error reading config:', error);
            return {
                currentModel: null,
                visionModel: null
            };
        }
    });

    ipcMain.handle('detect-and-translate', async (event, text) => {
        try {
            return await ollamaManager.detectAndTranslateText(text);
        } catch (error) {
            console.error('Error in detect-and-translate:', error);
            throw error;
        }
    });

    ipcMain.handle('generate-prompt', async (event, data) => {
        try {
            console.log('Received generate-prompt request:', data);
            
            if (!data || !data.basePrompt) {
                throw new Error('No base prompt provided');
            }
            
            const { basePrompt, styleId } = data;
            
            // Ensure we have the current model from Ollama manager
            if (!ollamaManager.currentModel) {
                throw new Error('No text model selected. Please select a model in settings.');
            }
            
            // Always get the latest style data from the styles manager
            if (!styleId) {
                throw new Error('No style ID provided');
            }
            
            const style = await stylesManager.getStyle(styleId);
            if (!style) {
                throw new Error(`Style ${styleId} not found`);
            }
            
            console.log('Using style from styles manager:', style);
            
            // Generate the prompt
            const result = await ollamaManager.generatePrompt(
                basePrompt,
                styleId,
                style
            );
            
            return {
                prompt: result.prompt,
                parameters: result.parameters
            };
        } catch (error) {
            console.error('Error in generate-prompt:', error);
            throw error;
        }
    });

    ipcMain.handle('select-model', async (event, { type, modelName }) => {
        try {
            if (type.toLowerCase() === 'text') {
                await ollamaManager.setModel(modelName);
            } else if (type.toLowerCase() === 'vision') {
                await ollamaManager.setVisionModel(modelName);
            }
            
            // Get updated status
            const status = await ollamaManager.getStatus();
            mainWindow.webContents.send('ollama-status', status);
            
            return status;
        } catch (error) {
            console.error('Error selecting model:', error);
            throw error;
        }
    });

    ipcMain.handle('refine-prompt', async (event, { prompt, style }) => {
        try {
            return await ollamaManager.refinePrompt(prompt, style);
        } catch (error) {
            console.error('Error refining prompt:', error);
            throw error;
        }
    });

    // Add save-config handler
    ipcMain.handle('save-config', async (event, config) => {
        try {
            const configPath = path.join(app.getPath('userData'), 'config.json');
            await fs.writeFile(configPath, JSON.stringify(config, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving config:', error);
            throw error;
        }
    });

    // Event handlers for style settings
    ipcMain.on('open-style-settings', async (event, styleId) => {
        const window = styleSettingsWindow.createStyleSettingsWindow(mainWindow);
        
        // Get style data from storage and send it to the settings window
        const style = await stylesManager.getStyle(styleId);
        if (style) {
            window.webContents.on('did-finish-load', () => {
                // Ensure modelParameters has default values
                const modelParams = {
                    temperature: 0.7,
                    top_p: 0.9,
                    top_k: 40,
                    repeat_penalty: 1.1,
                    ...(style.modelParameters || {})
                };
                
                window.webContents.send('style-data', {
                    ...style,
                    modelParameters: modelParams
                });
            });
        }
    });

    ipcMain.on('close-style-settings', () => {
        styleSettingsWindow.closeStyleSettingsWindow();
    });

    ipcMain.on('save-style-settings', async (event, updatedStyle) => {
        try {
            console.log('Saving style settings:', updatedStyle);
            await stylesManager.updateStyle(updatedStyle);
            mainWindow.webContents.send('style-updated', updatedStyle);
            styleSettingsWindow.closeStyleSettingsWindow();
        } catch (error) {
            console.error('Error saving style settings:', error);
            event.reply('style-settings-save-error', error.message);
        }
    });

    ipcMain.on('update-style-parameters', async (event, data) => {
        try {
            await stylesManager.updateStyleParameters(data.styleId, data.parameters);
            event.reply('style-parameters-updated');
        } catch (error) {
            console.error('Error updating style parameters:', error);
            event.reply('style-parameters-update-error', error.message);
        }
    });

    // Theme settings handlers
    ipcMain.handle('get-setting', async (event, key) => {
        try {
            const settings = store.get('settings') || {};
            return settings[key];
        } catch (error) {
            console.error('Error getting setting:', error);
            return null;
        }
    });

    ipcMain.handle('set-setting', async (event, key, value) => {
        try {
            const settings = store.get('settings') || {};
            settings[key] = value;
            store.set('settings', settings);
            return true;
        } catch (error) {
            console.error('Error setting setting:', error);
            return false;
        }
    });

    // Window control handlers
    ipcMain.on('minimize-window', () => {
        const win = BrowserWindow.getFocusedWindow();
        if (win) win.minimize();
    });

    ipcMain.on('maximize-window', () => {
        const win = BrowserWindow.getFocusedWindow();
        if (win) {
            if (win.isMaximized()) {
                win.unmaximize();
            } else {
                win.maximize();
            }
        }
    });

    ipcMain.on('close-window', () => {
        const win = BrowserWindow.getFocusedWindow();
        if (win) win.close();
    });

    // Window opening handlers
    ipcMain.on('open-config', () => {
        configWindow.create();
    });

    ipcMain.on('open-settings', () => {
        settingsWindow.create();
    });

    ipcMain.on('open-styles', () => {
        stylesWindow.create();
    });

    ipcMain.on('open-vision', () => {
        visionWindow.create();
    });

    ipcMain.on('open-credits', () => {
        creditsWindow.create();
    });

    ipcMain.on('open-ollama-config', () => {
        createOllamaConfigWindow();
    });

    // Ollama status handlers
    ipcMain.handle('check-ollama-status', async () => {
        return await ollamaManager.getStatus();
    });

    ipcMain.handle('refresh-ollama-status', async () => {
        return await ollamaManager.getStatus();
    });

    // Model handlers
    ipcMain.handle('get-available-models', async () => {
        return await ollamaManager.listModels();
    });

    ipcMain.handle('get-custom-models', async () => {
        return await ollamaManager.getCustomModels();
    });

    ipcMain.handle('install-model', async (event, modelName) => {
        try {
            const formattedName = formatModelName(modelName);
            console.log('Installing model:', formattedName);
            
            const response = await fetch('http://localhost:11434/api/pull', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: formattedName })
            });
            
            if (!response.ok) {
                const text = await response.text();
                console.error('Install response:', response.status, text);
                throw new Error(`Failed to install model: ${response.status} ${response.statusText} ${text ? `- ${text}` : ''}`);
            }
            
            const text = await response.text();
            const lines = text.split('\n').filter(line => line.trim());
            
            for (let i = 0; i < lines.length; i++) {
                try {
                    const data = JSON.parse(lines[i]);
                    if (data.status === 'downloading' && data.total && data.completed) {
                        event.sender.send('model-install-progress', { 
                            modelName, 
                            progress: Math.min(99, (data.completed / data.total) * 100),
                            downloadSize: data.completed,
                            totalSize: data.total
                        });
                    }
                } catch (e) {
                    // Ignore parse errors for non-JSON lines
                }
            }
            
            // Send final progress update
            event.sender.send('model-install-progress', { 
                modelName, 
                progress: 100
            });
            
            return true;
        } catch (error) {
            console.error('Failed to install model:', error);
            throw error;
        }
    });

    ipcMain.handle('delete-model', async (event, modelName) => {
        return await ollamaManager.deleteModel(modelName);
    });

    // Style management handlers
    ipcMain.handle('get-styles', async () => {
        console.log('Handling get-styles request');
        return await stylesManager.getAllStyles();
    });

    ipcMain.handle('get-style', async (event, styleId) => {
        try {
            return await stylesManager.getStyle(styleId);
        } catch (error) {
            console.error('Error getting style:', error);
            throw error;
        }
    });

    ipcMain.handle('save-style', async (event, style) => {
        return await stylesManager.saveStyle(style);
    });

    ipcMain.handle('delete-style', async (event, styleId) => {
        return await stylesManager.deleteStyle(styleId);
    });

    ipcMain.handle('update-style', async (event, style) => {
        return await stylesManager.updateStyle(style);
    });

    // Settings handlers
    ipcMain.handle('get-settings', async () => {
        return settingsManager.getSettings();
    });

    ipcMain.handle('save-settings', async (event, settings) => {
        return settingsManager.saveSettings(settings);
    });

    // Draw Things connection handler
    ipcMain.handle('check-draw-things', async () => {
        return new Promise((resolve) => {
            const client = new net.Socket();
            
            client.on('error', () => {
                resolve(false);
            });

            client.connect(DRAW_THINGS_PORT, '127.0.0.1', () => {
                client.end();
                resolve(true);
            });
        });
    });

    // Handle model tuning window
    let modelTuningWindows = new Map();

    ipcMain.on('open-model-tuning', (event, styleData) => {
        // Check if window already exists for this style
        if (modelTuningWindows.has(styleData.styleId)) {
            const existingWindow = modelTuningWindows.get(styleData.styleId);
            if (!existingWindow.isDestroyed()) {
                existingWindow.focus();
                return;
            }
        }

        // Create new window
        const modelTuningWindow = new BrowserWindow({
            width: 500,
            height: 600,
            minWidth: 400,
            minHeight: 500,
            show: false,
            frame: false,
            titleBarStyle: 'hidden',
            trafficLightPosition: { x: -100, y: -100 },
            parent: BrowserWindow.getFocusedWindow(),
            modal: true,
            title: `${styleData.styleName} - Model Fine-tuning`,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        modelTuningWindow.loadFile('model-tuning.html');
        
        modelTuningWindow.once('ready-to-show', () => {
            modelTuningWindow.show();
            modelTuningWindow.webContents.send('init-model-tuning', styleData);
        });

        modelTuningWindow.on('closed', () => {
            modelTuningWindows.delete(styleData.styleId);
        });

        modelTuningWindows.set(styleData.styleId, modelTuningWindow);
    });

    ipcMain.on('save-model-parameters', async (event, data) => {
        try {
            console.log('Received save-model-parameters with data:', data);
            
            if (!data || !data.styleId) {
                console.error('Invalid data received:', data);
                return;
            }
            
            // Update parameters directly
            const result = await stylesManager.updateStyleParameters(data.styleId, data.parameters);
            console.log('Update result:', result);
            
            if (result) {
                // Notify main window about the update
                BrowserWindow.getAllWindows().forEach(window => {
                    window.webContents.send('model-parameters-updated', {
                        styleId: data.styleId,
                        parameters: data.parameters
                    });
                });
            } else {
                console.error('Failed to update style parameters');
            }
        } catch (error) {
            console.error('Error saving model parameters:', error);
        }
    });

    // Handle model-changed event
    ipcMain.on('model-changed', (event, config) => {
        try {
            console.log('Model changed event received:', config);
            
            // Update both Ollama managers
            const ollamaManagerModule = require('./ollama-manager');
            ollamaManagerModule.ollamaManager.setDefaultModel(config.currentModel);
            ollamaManager.setDefaultModel(config.currentModel);
            
            console.log('Updated model in both managers:', config.currentModel);
            
            // Notify all windows about the change
            BrowserWindow.getAllWindows().forEach(window => {
                window.webContents.send('model-changed', config);
            });
        } catch (error) {
            console.error('Error updating model:', error);
        }
    });

    ipcMain.on('show-ollama-config', () => {
        configWindow.create();
    });

    // Update Ollama connection status
    function updateOllamaStatus(isConnected) {
        if (mainWindow) {
            mainWindow.webContents.send('ollama-status', isConnected);
        }
    }

    // Handle style selection completion
    ipcMain.on('style-selection-complete', async (event, selectedStyleIds) => {
        try {
            console.log('Style selection complete with styles:', selectedStyleIds);
            
            // Get all styles
            const allStyles = await stylesManager.getAllStyles();
            
            // Update each style's active state based on selection
            for (const style of allStyles) {
                const isSelected = selectedStyleIds.includes(style.id);
                style.active = isSelected;
                await stylesManager.updateStyle(style);
                console.log(`Style ${style.id} active state updated to:`, style.active);
            }
            
            // Find and close the style selection window
            const styleWindow = BrowserWindow.getAllWindows().find(win => {
                try {
                    return win.webContents === event.sender;
                } catch (e) {
                    return false;
                }
            });
            
            if (styleWindow && !styleWindow.isDestroyed()) {
                styleWindow.close();
            }
            
            // Mark first launch as complete
            store.set('settings.firstLaunch', false);
            
            // Create startup window and initialize app
            appStartupManager.startup = createStartupWindow();
            appStartupManager.initializeApp().catch(error => {
                console.error('Failed to initialize app:', error);
            });
            
        } catch (error) {
            console.error('Error handling style selection:', error);
        }
    });

    // Create and set startup window
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            appStartupManager.startup = createStartupWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Export the AppStartupManager instance
module.exports = {
    appStartupManager
};

const electron = require('electron');
const { BrowserWindow, ipcMain, dialog, shell } = electron;
const app = electron.app;
const path = require('path');
const Store = require('electron-store');
const http = require('http');
const { ollamaManager, getStatus } = require('./ollama-manager');
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
const sharp = require('sharp');
const { PythonShell } = require('python-shell');
const ort = require('onnxruntime-node');
const { spawn } = require('child_process');
const https = require('https');
const dependenciesWindow = require('./dependencies-window');
const creditsWindow = require('./credits-window');
const fetch = require('node-fetch');
const fs = require('fs').promises;

// Initialize electron store with schema
const store = new Store({
    schema: {
        settings: {
            type: 'object',
            properties: {
                theme: {
                    type: 'string',
                    default: 'purple'
                }
            }
        }
    }
});

// Global variables
let mainWindow = null;

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
            await setupDefaultModels(this.startup);

            this.updateStartupProgress('Creating main window...', 90);
            try {
                this.mainWindow = await this.createMainWindow();

                // Signal initialization complete
                if (this.startup) {
                    this.startup.webContents.send('initialization-complete');
                }

                this.updateStartupProgress('Finalizing startup...', 95);
                this.isStartupComplete = true;
                this.updateStartupProgress('Startup complete', 100);

                // Close startup window after a short delay
                setTimeout(() => {
                    if (this.startup && !this.startup.isDestroyed()) {
                        this.startup.close();
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
            // configManager auto-initializes in constructor, no need to call initialize
            await settingsManager.loadSettings();
            await stylesManager.loadStyles();
            // themeManager is ready after construction
        } catch (error) {
            console.error('Error initializing configuration:', error);
            throw new Error('Failed to initialize application configuration: ' + error.message);
        }
    }

    async createMainWindow() {
        if (!this.mainWindow) {
            console.log('Creating main window...');
            this.mainWindow = new BrowserWindow({
                width: 1200,
                height: 800,
                minWidth: 900,
                minHeight: 700,
                show: false,
                frame: false,
                titleBarStyle: 'hidden',
                trafficLightPosition: { x: -100, y: -100 },
                titleBarOverlay: false,
                backgroundColor: '#1E1B2E',
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                    devTools: true
                }
            });

            try {
                console.log('Loading index.html...');
                await this.mainWindow.loadFile('index.html');
                console.log('Main window loaded successfully');

                return new Promise((resolve) => {
                    this.mainWindow.once('ready-to-show', () => {
                        console.log('Main window ready to show');
                        this.mainWindow.show();
                        this.mainWindow.focus();
                        resolve(this.mainWindow);
                    });

                    // Add timeout in case ready-to-show never fires
                    setTimeout(() => {
                        if (this.mainWindow && !this.mainWindow.isDestroyed() && !this.mainWindow.isVisible()) {
                            console.log('Forcing window show after timeout');
                            this.mainWindow.show();
                            this.mainWindow.focus();
                            resolve(this.mainWindow);
                        }
                    }, 3000);
                });
            } catch (error) {
                console.error('Error loading main window:', error);
                throw error;
            }
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
const initializeStyles = async () => {
    try {
        const styles = await stylesManager.getStyles();
        console.log('Styles initialized successfully:', styles);
    } catch (error) {
        console.error('Error initializing styles:', error);
    }
};

// Setup default models for the application
async function setupDefaultModels(startup) {
    try {
        // Ensure models directory exists
        await fs.mkdir(SAFETENSORS_MODELS_PATH, { recursive: true });
        await fs.mkdir(CUSTOM_MODELS_PATH, { recursive: true });

        // Check if Ollama is running
        const isOllamaRunning = await ollamaManager.checkConnection();
        if (!isOllamaRunning) {
            throw new Error('Ollama service is not running. Please start Ollama and try again.');
        }

        // Check for required models
        const installedModels = await ollamaManager.listModels();
        
        // Check if we have at least one model installed
        if (!installedModels || installedModels.length === 0) {
            throw new Error('No Ollama models found. Please install at least one model to continue.');
        }

        // Update config with available models if needed
        const config = configManager.getConfig();
        if (!config.currentModel || !installedModels.some(m => m.name?.toLowerCase() === config.currentModel.toLowerCase())) {
            // Set first available model as default text model
            config.currentModel = installedModels[0].name;
            configManager.updateConfig(config);
        }
        
        if (!config.visionModel || !installedModels.some(m => m.name?.toLowerCase() === config.visionModel.toLowerCase())) {
            // Try to find a vision-capable model (llava, bakllava, etc.)
            const visionModel = installedModels.find(m => 
                m.name?.toLowerCase().includes('llava') || 
                m.name?.toLowerCase().includes('vision')
            );
            
            if (visionModel) {
                config.visionModel = visionModel.name;
            } else {
                // If no vision-specific model found, use the same as text model
                config.visionModel = config.currentModel;
            }
            configManager.updateConfig(config);
        }

        return true;
    } catch (error) {
        console.error('Error setting up default models:', error);
        throw error;
    }
}

// Create main application window
async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        show: false,
        frame: false,
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: -100, y: -100 }, // Hide traffic lights
        titleBarOverlay: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    await mainWindow.loadFile('index.html');
    
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.focus();
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

// Handle app ready
app.whenReady().then(async () => {
    initializePaths();
    await initializeStyles();
    
    // Set up IPC handlers
    ipcMain.on('startup-window-ready', () => {
        appStartupManager.initializeApp().catch(error => {
            console.error('Failed to initialize app:', error);
        });
    });

    ipcMain.on('retry-startup', () => {
        appStartupManager.retry();
    });

    // IPC Handlers
    ipcMain.handle('detect-and-translate', async (event, text) => {
        try {
            return await ollamaManager.detectAndTranslateText(text);
        } catch (error) {
            console.error('Error in detect-and-translate:', error);
            throw error;
        }
    });

    ipcMain.handle('generate-tags', async (event, { text }) => {
        try {
            const tags = await ollamaManager.generateTags(text);
            return tags;
        } catch (error) {
            console.error('Error in generate-tags:', error);
            throw error;
        }
    });

    ipcMain.handle('generate-prompt', async (event, data) => {
        try {
            console.log('Received generate-prompt request:', data);
            
            if (!data || !data.basePrompt) {
                throw new Error('No base prompt provided');
            }
            
            const { basePrompt, styleId, customStyle } = data;
            
            // Get style data if not provided
            let mergedStyle = customStyle;
            if (!mergedStyle && styleId) {
                const style = await stylesManager.getStyle(styleId);
                if (style) {
                    mergedStyle = style;
                }
            }
            
            console.log('Using merged style:', mergedStyle);
            
            // Generate the prompt
            const result = await ollamaManager.generatePrompt(
                basePrompt,
                styleId,
                mergedStyle
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

    // Ollama status handlers
    ipcMain.handle('check-ollama-status', async () => {
        return await getStatus();
    });

    ipcMain.handle('refresh-ollama-status', async () => {
        return await getStatus();
    });

    // Model handlers
    ipcMain.handle('get-available-models', async () => {
        return await ollamaManager.listModels();
    });

    ipcMain.handle('get-custom-models', async () => {
        return await ollamaManager.getCustomModels();
    });

    ipcMain.handle('list-models', async () => {
        return await ollamaManager.listModels();
    });

    ipcMain.handle('install-model', async (event, modelName) => {
        return await ollamaManager.installModel(modelName, (progress) => {
            event.sender.send('model-install-progress', { modelName, progress });
        });
    });

    ipcMain.handle('delete-model', async (event, modelName) => {
        return await ollamaManager.deleteModel(modelName);
    });

    // Style management handlers
    ipcMain.handle('get-styles', async () => {
        return await stylesManager.getStyles();
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

    ipcMain.handle('get-style', async (event, styleId) => {
        return await stylesManager.getStyle(styleId);
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

    // Create and set startup window
    appStartupManager.startup = createStartupWindow();

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

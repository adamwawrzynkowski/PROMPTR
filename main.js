const electron = require('electron');
const { BrowserWindow, ipcMain, dialog, shell, protocol } = electron;
const app = electron.app;
const creditsWindow = require('./credits-window');

// Optimize GPU usage while keeping hardware acceleration
app.commandLine.appendSwitch('ignore-gpu-blacklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-hardware-overlays', 'single-fullscreen,single-on-top');

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
const startupWindow = require('./startup-window');
const configManager = require('./config-manager');
const styleEditWindow = require('./style-edit-window');
const fsSync = require('fs');
const styleSelectionWindow = require('./style-selection-window');
const sharp = require('sharp');
const { spawn } = require('child_process');
const https = require('https');
const fetch = require('node-fetch');
const pidusage = require('pidusage');
const os = require('os');

// Global variables
let mainWindow = null;
let ollamaConfigWindow = null;
let onboardingWindow = null;
let visionWindow = null;

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

const isDev = process.env.NODE_ENV === 'development';
const getAssetPath = (fileName) => {
    if (isDev) {
        return path.join(__dirname, 'assets', fileName);
    }
    return path.join(process.resourcesPath, fileName);
};

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
            // Create startup window
            this.startup = createStartupWindow();
            
            // Wait for startup window to be ready
            await new Promise(resolve => {
                ipcMain.once('startup-window-ready', resolve);
            });

            this.updateStartupProgress('Checking system resources...', 10);
            await this.checkSystemResources();

            this.updateStartupProgress('Checking Ollama connection...', 20);
            try {
                const response = await fetch('http://127.0.0.1:11434/api/tags');
                if (!response.ok) {
                    throw new Error('Ollama server not responding');
                }
            } catch (error) {
                console.error('Ollama connection error:', error);
                this.updateStartupProgress('Ollama not running', 0, {
                    ollamaError: true
                });
                return;
            }

            this.updateStartupProgress('Initializing configuration...', 40);
            await this.initializeConfiguration();

            this.updateStartupProgress('Creating main window...', 60);
            this.mainWindow = await createWindow();

            this.updateStartupProgress('Loading application...', 80);

            // Final startup steps
            this.updateStartupProgress('Ready!', 100);
            
            // Close startup window and show main window
            setTimeout(() => {
                if (this.startup) {
                    this.startup.close();
                    this.startup = null;
                }
                if (this.mainWindow) {
                    this.mainWindow.show();
                    this.mainWindow.focus();
                }
                this.isStartupComplete = true;
            }, 500);

        } catch (error) {
            console.error('Startup error:', error);
            await this.handleStartupError(error);
        }
    }

    updateStartupProgress(status, progress, extra = {}) {
        if (this.startup) {
            this.startup.webContents.send('startup-progress', {
                status,
                progress,
                message: '',
                ...extra
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

        // Get current config from both sources
        const configPath = path.join(app.getPath('userData'), 'config.json');
        let config = {};
        try {
            const configData = await fs.readFile(configPath, 'utf8');
            config = JSON.parse(configData);
        } catch (error) {
            console.log('No existing config.json found');
        }

        // Get settings from electron store
        const settings = store.get('settings') || {};
        
        const isVisionModel = (model) => {
            const name = model.name.toLowerCase();
            return name.includes('llava') || 
                   name.includes('vision') || 
                   name.includes('bakllava');
        };

        // Set default text model if none is set
        let currentModel = config.currentModel || settings.currentModel;
        if (!currentModel) {
            const defaultTextModel = installedModels.models.find(model => 
                !isVisionModel(model)
            );
            if (defaultTextModel) {
                currentModel = defaultTextModel.name;
                config.currentModel = currentModel;
                store.set('settings.currentModel', currentModel);
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
                store.set('settings.currentModel', currentModel);
                console.log('Set default text model:', defaultTextModel.name);
            }
        }

        // Set the default model in OllamaManager
        if (currentModel) {
            ollamaManager.setModel(currentModel);
            console.log('Set OllamaManager default model to:', currentModel);
        } else {
            console.error('No suitable text model found');
            throw new Error('No suitable text model found');
        }

        // Set default vision model if none is set
        let visionModel = config.visionModel || settings.visionModel;
        if (!visionModel) {
            const defaultVisionModel = installedModels.models.find(model => 
                isVisionModel(model)
            );
            if (defaultVisionModel) {
                visionModel = defaultVisionModel.name;
                config.visionModel = visionModel;
                store.set('settings.visionModel', visionModel);
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
    const { width, height } = store.get('settings.windowSize') || { width: 1200, height: 800 };
    
    mainWindow = new BrowserWindow({
        width,
        height,
        minWidth: 800,
        minHeight: 600,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: true,
            enablePreferredSizeMode: false,
            spellcheck: false,
            v8CacheOptions: 'code',
            enableRemoteModule: true
        },
        backgroundColor: '#1e1e1e',
        show: false,
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: -100, y: -100 },
        icon: getAssetPath('icon.png')
    });

    // Optimize window performance
    mainWindow.webContents.setFrameRate(60); // Restore to 60 FPS for smoothness
    mainWindow.webContents.setBackgroundThrottling(true);
    
    // Load the index.html file
    await mainWindow.loadFile('index.html');
    
    // Optimize rendering
    mainWindow.webContents.on('did-finish-load', () => {
        // Enable smooth scrolling
        mainWindow.webContents.executeJavaScript(`
            document.querySelector('body').style.scrollBehavior = 'smooth';
        `);
    });
    
    // Only show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Save window size on resize
    mainWindow.on('resize', () => {
        const [width, height] = mainWindow.getSize();
        store.set('settings.windowSize', { width, height });
    });

    return mainWindow;
}

// Create startup window
function createStartupWindow() {
    const startup = new BrowserWindow({
        width: 500,
        height: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        frame: false,
        resizable: false,
        show: false,
        useContentSize: true,
        backgroundColor: '#1e1b2e',
        icon: getAssetPath('icon.png')
    });

    startup.loadFile('startup.html');
    startup.once('ready-to-show', () => {
        startup.show();
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
            contextIsolation: false,
            enableRemoteModule: true
        },
        frame: false,
        parent: mainWindow,
        modal: true,
        show: false,
        icon: getAssetPath('icon.png')
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

// Model-related IPC handlers
function setupModelHandlers() {
    // Remove any existing handlers to prevent duplicates
    ipcMain.removeHandler('install-model');
    ipcMain.removeHandler('select-model');
    ipcMain.removeHandler('list-models');
    ipcMain.removeHandler('remove-model');
    ipcMain.removeHandler('check-model-availability');
    
    // Model installation and configuration
    ipcMain.handle('install-model', async (event, modelName) => {
        try {
            console.log('Starting model installation in main process:', modelName);
            // Pass progress callback to pullModel
            await ollamaManager.pullModel(modelName, (progress) => {
                console.log('Progress callback called:', progress);
                event.sender.send('model-install-progress', {
                    progress: progress,
                    status: `Installing ${modelName}... ${Math.round(progress)}%`
                });
            });
            console.log('Model pull complete, setting as current model');
            await ollamaManager.setModel(modelName);
            console.log('Installation complete');
            return { success: true };
        } catch (error) {
            console.error('Error installing model:', error);
            throw error;
        }
    });

    // Model availability check
    ipcMain.handle('check-model-availability', async (event, modelName) => {
        try {
            return await ollamaManager.checkModelAvailability(modelName);
        } catch (error) {
            console.error('Error checking model availability:', error);
            return false;
        }
    });

    // Model removal
    ipcMain.handle('remove-model', async (event, modelName) => {
        try {
            console.log('Attempting to remove model:', modelName);
            
            const response = await fetch(`http://localhost:11434/api/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: modelName })
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

    ipcMain.handle('select-model', async (event, { type, modelName }) => {
        try {
            if (type.toLowerCase() === 'text') {
                await ollamaManager.setModel(modelName);
            } else if (type.toLowerCase() === 'vision') {
                await ollamaManager.setVisionModel(modelName);
            }
            
            // Get updated status
            const status = await ollamaManager.getStatus();
            if (mainWindow) {
                mainWindow.webContents.send('ollama-status', status);
            }
            return status;
        } catch (error) {
            console.error('Error selecting model:', error);
            throw error;
        }
    });

    ipcMain.handle('list-models', async () => {
        return await ollamaManager.listModels();
    });

    ipcMain.on('model-changed', (event, modelData) => {
        try {
            let modelName;
            let config;
            
            // Handle both formats: string and object
            if (typeof modelData === 'string') {
                modelName = modelData;
                config = {
                    currentModel: modelName,
                    settings: { currentModel: modelName }
                };
            } else {
                modelName = modelData.currentModel;
                config = modelData;
            }

            console.log('Model changed event received:', modelName);
            
            // Update config
            const configManagerModule = require('./config-manager');
            const configData = configManagerModule.getConfig();
            configData.currentModel = modelName;
            configData.settings.currentModel = modelName;
            configManagerModule.saveConfig(configData);
            
            // List of models that should keep their parameters
            const MODELS_WITH_PARAMS = [
                'qwen2.5',
                'mistral',
                'gemma',
                'dolphin-llama3',
                'llama3.2'
            ];

            // Check if this model should keep its parameters
            const baseModelName = modelName.split(':')[0];
            const shouldKeepParams = MODELS_WITH_PARAMS.includes(baseModelName);
            const modelNameForOllama = shouldKeepParams ? modelName : baseModelName;
            
            // Update Ollama manager
            ollamaManager.setModel(modelNameForOllama);
            
            console.log('Updated model in both managers:', modelNameForOllama);
            
            // Notify all windows about the change
            BrowserWindow.getAllWindows().forEach(window => {
                window.webContents.send('model-changed', config);
            });
        } catch (error) {
            console.error('Error updating model:', error);
        }
    });
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
        console.log('Removing model:', modelName);
        
        const response = await fetch(`http://localhost:11434/api/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: modelName })
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

// Handle model installation from onboarding
ipcMain.handle('install-model', async (event, modelName) => {
    try {
        await ollamaManager.pullModel(modelName);
        return { success: true };
    } catch (error) {
        console.error('Error installing model:', error);
        return { success: false, error: error.message };
    }
});

// Handle onboarding completion
ipcMain.handle('complete-onboarding', async () => {
    try {
        // Close onboarding window if it exists
        if (onboardingWindow) {
            onboardingWindow.close();
            onboardingWindow = null;
        }
        
        // Mark onboarding as completed
        const config = store.get('config', {});
        config.onboardingCompleted = true;
        store.set('config', config);
        
        // Initialize app through startup manager
        await appStartupManager.initializeApp();
        
        return true;
    } catch (error) {
        console.error('Error completing onboarding:', error);
        throw error;
    }
});

// Check if onboarding is needed
async function needsOnboarding() {
    try {
        const config = store.get('config', {});
        
        // If user has completed onboarding before, skip it
        if (config.onboardingCompleted) {
            return false;
        }

        const response = await fetch('http://127.0.0.1:11434/api/tags');
        const data = await response.json();
        
        // Check if models array exists and has any installed model
        const installedModels = data.models || [];
        const hasAnyModel = installedModels.some(model => 
            ['llama3.2', 'qwen2.5:0.5b', 'mistral', 'gemma', 'dolphin-llama3'].includes(model.name)
        );
        
        // Need onboarding if no model is installed or no model is selected
        return !hasAnyModel || !config.currentModel;
    } catch (error) {
        console.error('Error checking onboarding status:', error);
        // If we can't check, assume we need onboarding
        return true;
    }
}

// App startup
app.whenReady().then(async () => {
    try {
        initializePaths();
        await initializeStyles();
        
        // Set up all IPC handlers
        setupModelHandlers();
        
        // Check if onboarding is needed
        const needsOnboardingResult = await needsOnboarding();
        if (needsOnboardingResult) {
            createOnboardingWindow();
        } else {
            // Skip onboarding and initialize app
            await appStartupManager.initializeApp();
        }
    } catch (error) {
        console.error('Error during app startup:', error);
        dialog.showErrorBox('Startup Error', 'Failed to start the application. Please try again.');
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Prevent duplicate window creation
app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow();
    }
});

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
ipcMain.handle('get-config', async () => {
    try {
        // First try to get from electron store
        const settings = store.get('settings') || {};
        let currentModel = settings.currentModel;
        let visionModel = settings.visionModel;

        // If not found in store, try to get from config.json
        if (!currentModel || !visionModel) {
            try {
                const configPath = path.join(app.getPath('userData'), 'config.json');
                const configData = await fs.readFile(configPath, 'utf8');
                const config = JSON.parse(configData);
                
                // Update store with config values if they exist
                if (config.currentModel && !currentModel) {
                    currentModel = config.currentModel;
                    store.set('settings.currentModel', currentModel);
                }
                if (config.visionModel && !visionModel) {
                    visionModel = config.visionModel;
                    store.set('settings.visionModel', visionModel);
                }
            } catch (error) {
                console.error('Error reading config.json:', error);
            }
        }

        return {
            currentModel,
            visionModel
        };
    } catch (error) {
        console.error('Error getting config:', error);
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

ipcMain.handle('generate-prompt', async (event, { basePrompt, styleId, style, promptType, markedWords }) => {
    try {
        // Get the style from the styles manager if not provided
        if (!style) {
            style = await stylesManager.getStyle(styleId);
            if (!style) {
                throw new Error('Style not found');
            }
        }

        // Generate the prompt using the style and prompt type
        const result = await ollamaManager.generatePrompt({ 
            basePrompt, 
            styleId, 
            style, 
            promptType,
            markedWords
        });
        return result;
    } catch (error) {
        console.error('Error generating prompt:', error);
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
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.on('close-window', () => {
    app.quit(); // This will quit the entire application
});

// Window opening handlers
ipcMain.on('open-config', () => {
    configWindow.create();
});

ipcMain.on('open-settings', () => {
    settingsWindow.create();
});

ipcMain.on('open-styles-window', () => {
    if (stylesWindow.window) {
        stylesWindow.window.focus();
    } else {
        stylesWindow.create();
    }
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

ipcMain.handle('delete-model', async (event, modelName) => {
    return await ollamaManager.deleteModel(modelName);
});

// Style management handlers
ipcMain.handle('get-styles', async () => {
    try {
        console.log('Handling get-styles request');
        if (!stylesManager.initialized) {
            console.log('Initializing styles manager...');
            await stylesManager.initialize();
        }
        const styles = await stylesManager.getAllStyles();
        console.log('Retrieved styles:', styles);
        return styles;
    } catch (error) {
        console.error('Error getting styles:', error);
        throw error;
    }
});

ipcMain.handle('get-style', async (event, styleId) => {
    try {
        console.log('Getting style data for ID:', styleId);
        const style = await stylesManager.getStyle(styleId);
        console.log('Retrieved style data:', style);
        return style;
    } catch (error) {
        console.error('Error getting style:', error);
        throw error;
    }
});

ipcMain.handle('save-style', async (event, style) => {
    try {
        if (style.id) {
            await stylesManager.updateStyle(style);
        } else {
            await stylesManager.createStyle(style);
        }
        notifyStylesChanged();
        return true;
    } catch (error) {
        console.error('Error saving style:', error);
        throw error;
    }
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
            contextIsolation: false,
            enableRemoteModule: true
        },
        icon: getAssetPath('icon.png')
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

ipcMain.on('close-vision-window', () => {
    if (visionWindow) {
        visionWindow.close();
    }
});

ipcMain.on('minimize-vision-window', () => {
    if (visionWindow) {
        visionWindow.minimize();
    }
});

ipcMain.removeHandler('analyze-image');
ipcMain.handle('analyze-image', async (event, payload) => {
    try {
        // Handle both old and new formats
        let image, instructions, feature;
        
        if (typeof payload === 'string') {
            // Old format: just base64 image
            image = payload;
            instructions = "Analyze this image and provide a detailed description.";
            feature = "description";
        } else {
            // New format: { image, instructions, feature }
            ({ image, instructions, feature } = payload);
        }

        // Convert base64 image to buffer
        const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // Create a temporary file for the image
        const tempImagePath = path.join(app.getPath('temp'), 'temp_vision_image.jpg');
        await fs.writeFile(tempImagePath, imageBuffer);

        // Prepare the prompt based on the feature
        let prompt = instructions;
        switch (feature) {
            case 'description':
                // Use the provided instructions directly
                break;
            case 'interpreter':
                prompt = 'Analyze this image using the following style: ' + instructions;
                break;
            case 'object-detection':
                prompt = 'List and describe all objects you can identify in this image, including their locations and relationships to each other.';
                break;
            case 'style-detection':
                prompt = 'Analyze and describe the artistic and visual style of this image, including techniques, composition, and aesthetic elements.';
                break;
            case 'style-maker':
                prompt = 'Create a detailed style description based on this image that could be used to generate similar images. Include artistic techniques, composition, lighting, and mood.';
                break;
            case 'object-coordinates':
                prompt = 'Provide coordinates and dimensions for all major objects in this image, using a normalized coordinate system (0-1 for both x and y axes).';
                break;
            default:
                prompt = instructions;
        }

        // Read the image file
        const imageContent = await fs.readFile(tempImagePath, { encoding: 'base64' });

        // Prepare the request to Ollama
        const response = await fetch('http://127.0.0.1:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3.2-vision:11b',
                prompt: prompt,
                images: [imageContent],
                stream: false
            })
        });

        const result = await response.json();
        
        // Clean up the temporary file
        await fs.unlink(tempImagePath);

        return result.response;
    } catch (error) {
        console.error('Error analyzing image:', error);
        throw new Error('Failed to analyze image: ' + error.message);
    }
});

ipcMain.on('vision-result', (event, result) => {
    // Send the result to the main window
    mainWindow.webContents.send('vision-result', result);
});

// Vision window handlers
ipcMain.on('open-vision', () => {
    createVisionWindow();
});

// Get current theme
ipcMain.on('get-current-theme', (event) => {
    const settings = store.get('settings') || {};
    const theme = `theme-${settings.theme || 'purple'}`;
    console.log('Sending current theme:', theme);
    event.reply('theme-changed', theme);
});

// Create Vision window
function createVisionWindow() {
    if (visionWindow) {
        visionWindow.focus();
        return;
    }

    visionWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 900,
        minHeight: 600,
        show: false,
        frame: false,
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: -100, y: -100 },
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        icon: getAssetPath('icon.png')
    });

    visionWindow.loadFile('vision.html');
    
    // Send current theme once window is ready
    visionWindow.webContents.on('did-finish-load', () => {
        const settings = store.get('settings') || {};
        const theme = `theme-${settings.theme || 'purple'}`;
        console.log('Sending current theme:', theme);
        visionWindow.webContents.send('theme-changed', theme);
        visionWindow.show();
    });

    visionWindow.on('closed', () => {
        visionWindow = null;
    });
}

// Vision window controls
ipcMain.on('minimize-vision', () => {
    if (visionWindow) visionWindow.minimize();
});

ipcMain.on('maximize-vision', () => {
    if (visionWindow) {
        if (visionWindow.isMaximized()) {
            visionWindow.unmaximize();
        } else {
            visionWindow.maximize();
        }
    }
});

ipcMain.on('close-vision', () => {
    if (visionWindow) visionWindow.close();
});

// Theme handlers
ipcMain.on('get-current-theme', (event) => {
    const settings = store.get('settings') || {};
    const theme = `theme-${settings.theme || 'purple'}`;
    console.log('Sending current theme:', theme);
    event.reply('theme-changed', theme);
});

// When theme changes in main window, update Vision window
ipcMain.on('theme-changed', (event, theme) => {
    console.log('Theme change received in main process:', theme);
    
    // Update theme in electron store
    store.set('settings.theme', theme);
    console.log('Theme saved in store:', theme);
    
    // Notify all windows about theme change
    const themeClass = `theme-${theme}`;
    console.log('Broadcasting theme change:', themeClass);
    BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
            window.webContents.send('theme-changed', themeClass);
        }
    });
    
    // Update vision window theme
    if (visionWindow && !visionWindow.isDestroyed()) {
        visionWindow.webContents.send('theme-changed', themeClass);
    }
});

// Performance monitoring
async function getAppleSiliconMetrics() {
    return new Promise((resolve) => {
        // Use ioreg to get GPU information
        const cmd = "ioreg -l | grep -A 1 PerformanceStatistics";
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.warn('Error getting GPU metrics:', error);
                // Fallback to CPU only
                const cpus = os.cpus();
                let totalCPUUsage = 0;
                
                cpus.forEach(cpu => {
                    const total = Object.values(cpu.times).reduce((acc, tv) => acc + tv, 0);
                    const idle = cpu.times.idle;
                    totalCPUUsage += ((total - idle) / total) * 100;
                });

                resolve({
                    cpu: Math.min(100, totalCPUUsage / cpus.length),
                    gpu: 0
                });
                return;
            }

            try {
                // Extract GPU utilization from ioreg output
                let gpuUtilization = 0;
                
                // Look for Device Utilization or Renderer Utilization
                const deviceMatch = stdout.match(/"Device Utilization %"=(\d+)/);
                const rendererMatch = stdout.match(/"Renderer Utilization %"=(\d+)/);
                
                if (deviceMatch) {
                    gpuUtilization = parseInt(deviceMatch[1]);
                } else if (rendererMatch) {
                    gpuUtilization = parseInt(rendererMatch[1]);
                }

                // Get CPU usage
                const cpus = os.cpus();
                let totalCPUUsage = 0;
                
                cpus.forEach(cpu => {
                    const total = Object.values(cpu.times).reduce((acc, tv) => acc + tv, 0);
                    const idle = cpu.times.idle;
                    totalCPUUsage += ((total - idle) / total) * 100;
                });

                resolve({
                    cpu: Math.min(100, totalCPUUsage / cpus.length),
                    gpu: Math.min(100, gpuUtilization)
                });
            } catch (error) {
                console.warn('Error parsing GPU metrics:', error);
                resolve({ cpu: 0, gpu: 0 });
            }
        });
    });
}

// Performance monitoring
async function getPerformanceStats() {
    try {
        // RAM Usage
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const systemMemUsed = totalMem - freeMem;
        const ramPercentage = (systemMemUsed / totalMem) * 100;
        
        let metrics = { cpu: 0, gpu: 0 };
        
        // Get CPU and GPU metrics based on platform
        if (process.platform === 'darwin') {
            try {
                metrics = await getAppleSiliconMetrics();
            } catch (error) {
                console.warn('Error getting Apple Silicon metrics:', error);
            }
        } else {
            // Fallback to basic CPU measurement for non-macOS
            const cpus = os.cpus();
            let totalCPUUsage = 0;
            
            cpus.forEach(cpu => {
                const total = Object.values(cpu.times).reduce((acc, tv) => acc + tv, 0);
                const idle = cpu.times.idle;
                totalCPUUsage += ((total - idle) / total) * 100;
            });
            
            metrics.cpu = Math.min(100, totalCPUUsage / cpus.length);
        }
        
        // Ollama process monitoring
        const ollamaPid = await findOllamaProcess();
        let ollamaStats = {
            cpu: 0,
            memory: 0
        };
        
        if (ollamaPid) {
            try {
                ollamaStats = await pidusage(ollamaPid);
            } catch (error) {
                console.warn('Error getting Ollama stats:', error);
            }
        }
        
        return {
            system: {
                cpu: metrics.cpu,
                ram: ramPercentage,
                gpu: metrics.gpu
            },
            ollama: {
                cpu: Math.min(100, ollamaStats.cpu || 0),
                ram: ollamaStats.memory ? (ollamaStats.memory / totalMem) * 100 : 0,
                active: !!ollamaPid
            }
        };
    } catch (error) {
        console.error('Error in getPerformanceStats:', error);
        return {
            system: { cpu: 0, ram: 0, gpu: 0 },
            ollama: { cpu: 0, ram: 0, active: false }
        };
    }
}

// Function to find Ollama process ID
async function findOllamaProcess() {
    return new Promise((resolve) => {
        const cmd = process.platform === 'darwin' ? 
            "pgrep -x ollama" : 
            "tasklist /FI \"IMAGENAME eq ollama.exe\" /NH";
                
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.log('Error finding Ollama process:', error);
                resolve(null);
                return;
            }
            
            const pid = parseInt(stdout);
            if (isNaN(pid)) {
                console.log('Ollama process not found');
                resolve(null);
                return;
            }
            
            resolve(pid);
        });
    });
}

// Register performance monitoring handler
ipcMain.handle('get-performance-stats', async () => {
    return await getPerformanceStats();
});

// Handle tag generation
ipcMain.handle('generate-tags', async (event, { text, systemPrompt }) => {
    try {
        const response = await fetch(`http://127.0.0.1:11434/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: DEFAULT_TEXT_MODEL,
                prompt: text,
                system: systemPrompt,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data.response;
    } catch (error) {
        console.error('Error generating tags:', error);
        throw error;
    }
});

// Create onboarding window
function createOnboardingWindow() {
    onboardingWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        show: false,
        frame: false,
        resizable: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
            webSecurity: false
        },
        icon: getAssetPath('icon.png')
    });
    
    onboardingWindow.loadFile('onboarding.html');
    
    onboardingWindow.once('ready-to-show', () => {
        onboardingWindow.show();
    });
    
    return onboardingWindow;
}

ipcMain.handle('generate-system-instructions', async (event, description) => {
    try {
        const instructions = await ollamaManager.generateSystemInstructions(description);
        return instructions;
    } catch (error) {
        console.error('Error generating system instructions:', error);
        throw error;
    }
});

ipcMain.on('create-style', () => {
    const window = styleEditWindow.create();
    window.once('ready-to-show', () => {
        window.show();
    });
});

ipcMain.handle('show-message', async (event, options) => {
    return dialog.showMessageBox({
        type: options.type || 'info',
        title: options.message || 'Message',
        message: options.detail || '',
        buttons: ['OK']
    });
});

// Add handlers for style management
ipcMain.handle('open-style-edit-window', async (event, styleId) => {
    try {
        console.log('Opening style edit window for style:', styleId);
        const window = styleEditWindow.create(styleId);
        
        if (styleId) {
            const style = await stylesManager.getStyle(styleId);
            console.log('Retrieved style data:', style);
            
            window.webContents.on('did-finish-load', () => {
                console.log('Window loaded, sending style data');
                window.webContents.send('style-data', style);
            });
        }
        
        return true;
    } catch (error) {
        console.error('Error opening style edit window:', error);
        throw error;
    }
});

ipcMain.handle('show-confirmation', async (event, options) => {
    const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        title: options.title || 'Confirm',
        message: options.message,
        buttons: options.buttons || ['Yes', 'Cancel'],
        defaultId: 1, // Cancel będzie domyślną opcją
        cancelId: 1,  // Cancel będzie użyty przy naciśnięciu Esc
        noLink: true  // Lepszy wygląd na macOS
    });
    return response;
});

ipcMain.handle('delete-style', async (event, styleId) => {
    try {
        const { response } = await dialog.showMessageBox(mainWindow, {
            type: 'question',
            title: 'Delete Style',
            message: 'Are you sure you want to delete this style?',
            buttons: ['Delete', 'Cancel'],
            defaultId: 1,
            cancelId: 1,
            noLink: true
        });

        if (response === 0) { // Użytkownik kliknął Delete
            await stylesManager.deleteStyle(styleId);
            notifyStylesChanged();
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error deleting style:', error);
        throw error;
    }
});

ipcMain.handle('request-sudo-password', async (event) => {
    return new Promise((resolve) => {
        const promptWindow = new BrowserWindow({
            width: 400,
            height: 150,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: true
            },
            frame: false,
            resizable: false,
            alwaysOnTop: true,
            icon: getAssetPath('icon.png')
        });

        promptWindow.loadURL(`data:text/html,
            <html>
                <body style="background: #1e1e1e; color: white; font-family: system-ui;">
                    <div style="padding: 20px;">
                        <h3>Sudo Password Required</h3>
                        <p>Enter password to monitor system performance:</p>
                        <input type="password" id="password" style="width: 100%; margin-bottom: 10px;">
                        <button onclick="submit()" style="margin-right: 10px;">OK</button>
                        <button onclick="window.close()">Cancel</button>
                    </div>
                    <script>
                        function submit() {
                            const password = document.getElementById('password').value;
                            window.postMessage({ type: 'password', password });
                        }
                    </script>
                </body>
            </html>
        `);

        promptWindow.webContents.on('ipc-message', (event, channel, data) => {
            if (channel === 'password') {
                resolve(data);
                promptWindow.close();
            }
        });

        promptWindow.on('closed', () => {
            resolve(null);
        });
    });
});

ipcMain.on('retry-ollama-connection', async () => {
    try {
        const response = await fetch('http://127.0.0.1:11434/api/tags');
        if (response.ok) {
            // Ollama is now running, continue startup
            appStartupManager.retry();
        } else {
            // Still not running
            appStartupManager.updateStartupProgress('Ollama not running', 0, {
                ollamaError: true
            });
        }
    } catch (error) {
        // Connection failed
        appStartupManager.updateStartupProgress('Ollama not running', 0, {
            ollamaError: true
        });
    }
});

ipcMain.on('quit-app', () => {
    app.quit();
});

// Startup window IPC handlers
ipcMain.on('retry-ollama-connection', async () => {
    try {
        const response = await fetch('http://127.0.0.1:11434/api/tags');
        if (response.ok) {
            BrowserWindow.getAllWindows().forEach(window => {
                window.webContents.send('startup-progress', {
                    progress: 0,
                    status: 'Reconnecting...',
                    message: '',
                    ollamaError: false
                });
            });
            appStartupManager.initializeApp();
        }
    } catch (error) {
        console.error('Failed to reconnect to Ollama:', error);
    }
});

ipcMain.on('quit-app', () => {
    app.quit();
});

// Handle show-startup-window event
ipcMain.on('show-startup-window', (event, options = {}) => {
    const startupWindow = require('./startup-window');
    const window = startupWindow.create();
    
    // If Ollama error is present, send startup progress with error state
    if (options.ollamaError) {
        window.webContents.on('did-finish-load', () => {
            window.webContents.send('startup-progress', {
                progress: 0,
                status: 'Error',
                message: 'Failed to connect to Ollama',
                ollamaError: true
            });
        });
    }
});

// Add restart handler
ipcMain.handle('restart-app', () => {
    app.relaunch();
    app.exit();
});

// Credits window handler
ipcMain.on('open-credits', () => {
    creditsWindow.create();
});

// Handle external links
ipcMain.handle('open-external', async (event, url) => {
    await shell.openExternal(url);
});

// Handle style import/export
ipcMain.handle('import-style', async () => {
    try {
        const { filePaths } = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [
                { name: 'JSON Files', extensions: ['json'] }
            ]
        });

        if (filePaths.length === 0) {
            return null;
        }

        const fileContent = await fs.readFile(filePaths[0], 'utf8');
        const styleData = JSON.parse(fileContent);
        const newStyle = await stylesManager.importStyle(styleData);
        notifyStylesChanged();
        return newStyle;
    } catch (error) {
        console.error('Error importing style:', error);
        throw error;
    }
});

ipcMain.handle('export-style', async (event, styleId) => {
    try {
        const style = await stylesManager.exportStyle(styleId);
        const { filePath } = await dialog.showSaveDialog({
            defaultPath: `${style.name.toLowerCase().replace(/\s+/g, '-')}.json`,
            filters: [
                { name: 'JSON Files', extensions: ['json'] }
            ]
        });

        if (!filePath) {
            return false;
        }

        await fs.writeFile(filePath, JSON.stringify(style, null, 2));
        return true;
    } catch (error) {
        console.error('Error exporting style:', error);
        throw error;
    }
});

// Helper function to notify main window about style changes
function notifyStylesChanged() {
    BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('styles-changed');
    });
}

let drawThingsClient = null;

// Check Draw Things connection
async function checkDrawThingsConnection() {
    const endpoints = [
        'http://127.0.0.1:3333/health',
        'http://127.0.0.1:3333/api/health',
        'http://127.0.0.1:3333/api/v1/health',
        'http://127.0.0.1:3333/',
        'http://localhost:3333/health'
    ];

    console.log('Checking Draw Things connection...');
    
    for (const endpoint of endpoints) {
        try {
            console.log(`Trying endpoint: ${endpoint}`);
            const response = await fetch(endpoint);
            console.log(`Response status for ${endpoint}:`, response.status);
            
            if (response.ok) {
                console.log('Successfully connected to Draw Things at:', endpoint);
                return true;
            }
            
            const text = await response.text();
            console.log(`Response text for ${endpoint}:`, text);
        } catch (error) {
            console.log(`Error trying ${endpoint}:`, error.message);
        }
    }

    console.log('All connection attempts failed');
    return false;
}

// Handle Draw Things requests
ipcMain.handle('send-to-draw-things', async (event, prompt) => {
    try {
        console.log('Attempting to send prompt to Draw Things:', prompt);
        
        // First check if Draw Things is connected
        const isConnected = await checkDrawThingsConnection();
        if (!isConnected) {
            throw new Error('Draw Things is not connected. Please check if the app is running and API Server is enabled.');
        }

        // Try to discover API endpoints
        try {
            const rootResponse = await fetch('http://127.0.0.1:3333/');
            console.log('Root endpoint status:', rootResponse.status);
            const rootText = await rootResponse.text();
            console.log('Root endpoint response:', rootText);
        } catch (error) {
            console.log('Error fetching root endpoint:', error.message);
        }

        // Try different endpoint patterns
        const endpoints = [
            'http://127.0.0.1:3333/api/generate',
            'http://127.0.0.1:3333/generate',
            'http://127.0.0.1:3333/txt2img',
            'http://127.0.0.1:3333/api/txt2img',
            'http://127.0.0.1:3333/sdapi/v1/txt2img',
            'http://127.0.0.1:3333/run'
        ];

        const requestBody = {
            prompt: prompt,
            steps: 20,
            width: 512,
            height: 512
        };

        console.log('Trying request body:', JSON.stringify(requestBody, null, 2));

        for (const endpoint of endpoints) {
            try {
                console.log('Trying endpoint:', endpoint);
                
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });

                console.log(`Response status for ${endpoint}:`, response.status);
                const responseText = await response.text();
                console.log(`Response text for ${endpoint}:`, responseText);

                if (response.ok) {
                    console.log('Successfully sent prompt to Draw Things');
                    return { success: true };
                }
            } catch (error) {
                console.log(`Error with endpoint ${endpoint}:`, error.message);
            }
        }

        throw new Error('Failed to process the prompt in Draw Things. Please try again.');
    } catch (error) {
        console.error('Error in send-to-draw-things:', error);
        throw error;
    }
});

// Add Draw Things connection check handler
ipcMain.handle('check-draw-things-connection', async () => {
    return checkDrawThingsConnection();
});

// Add general connection check handler (only for Draw Things)
ipcMain.handle('check-connections', async () => {
    const drawThingsStatus = await checkDrawThingsConnection();
    return {
        drawThings: drawThingsStatus
    };
});

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

app.whenReady().then(() => {
    protocol.registerFileProtocol('app', (request, callback) => {
        const url = request.url.replace('app://', '');
        try {
            return callback(path.join(process.resourcesPath, url));
        } catch (error) {
            console.error('Failed to register protocol', error);
        }
    });
});

// Vision model handlers
ipcMain.handle('check-vision-model', async () => {
    try {
        const response = await fetch('http://127.0.0.1:11434/api/tags');
        const data = await response.json();
        return data.models.some(model => model.name.includes('llama3.2-vision'));
    } catch (error) {
        console.error('Error checking vision model:', error);
        return false;
    }
});

ipcMain.handle('install-vision-model', async (event) => {
    try {
        const modelName = 'llama3.2-vision:11b';
        console.log('Installing vision model:', modelName);
        
        const response = await fetch('http://127.0.0.1:11434/api/pull', {
            method: 'POST',
            body: JSON.stringify({ name: modelName }),
            headers: { 'Content-Type': 'application/json' }
        });

        const reader = response.body.getReader();
        let downloadProgress = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n').filter(Boolean);

            for (const line of lines) {
                const data = JSON.parse(line);
                if (data.status === 'downloading' && data.completed && data.total) {
                    downloadProgress = (data.completed / data.total) * 100;
                    event.sender.send('model-download-progress', downloadProgress);
                }
            }
        }

        console.log('Vision model installation complete');
        return true;
    } catch (error) {
        console.error('Error installing vision model:', error);
        throw error;
    }
});

// Style selector window
let styleSelectorWindow = null;

function createStyleSelectorWindow(parentWindow) {
    if (styleSelectorWindow) {
        styleSelectorWindow.focus();
        return styleSelectorWindow;
    }

    styleSelectorWindow = new BrowserWindow({
        width: 600,
        height: 400,
        parent: parentWindow,
        modal: true,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    styleSelectorWindow.loadFile('style-selector.html');

    styleSelectorWindow.on('closed', () => {
        styleSelectorWindow = null;
    });

    return styleSelectorWindow;
}

// Handle opening style selector window
ipcMain.on('open-style-selector', (event) => {
    console.log('Opening style selector window');
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const selectorWindow = createStyleSelectorWindow(parentWindow);
    
    // Store the parent window's webContents to send the selected style back
    selectorWindow.parentWebContents = event.sender;
});

// Handle style selection
ipcMain.on('style-selected', (event, style) => {
    console.log('Style selected:', style);
    // Get the parent window's webContents that we stored earlier
    const parentWebContents = styleSelectorWindow.parentWebContents;
    if (parentWebContents) {
        // Send the selected style back to the vision window
        parentWebContents.send('style-selected-for-interpreter', style);
    }
});

// Handle getting styles
ipcMain.on('get-styles', async (event) => {
    try {
        let styles = [];
        if (stylesManager) {
            styles = await stylesManager.getAllStyles();
        }
        event.sender.send('load-styles', styles);
    } catch (error) {
        console.error('Error loading styles:', error);
        event.sender.send('load-styles', []);
    }
});

// Handle closing style selector
ipcMain.on('close-style-selector', () => {
    if (styleSelectorWindow) {
        styleSelectorWindow.close();
    }
});

// Nasłuchuj na żądanie odświeżenia listy stylów
ipcMain.on('refresh-styles-list', () => {
    // Znajdź okno zarządzania stylami i wyślij do niego sygnał odświeżenia
    const manageStylesWindow = BrowserWindow.getAllWindows().find(window => 
        window.getTitle() === 'Manage Styles'
    );
    
    if (manageStylesWindow) {
        manageStylesWindow.webContents.send('styles-refresh-needed');
    }
});

// Generate prompt
async function generatePrompt(prompt, style) {
    try {
        const systemInstructions = style.systemInstructions || defaultSystemInstructions;
        
        // Przygotuj kontekst dla modelu
        const messages = [
            {
                role: "system",
                content: `You are transforming prompts to match a specific style. Your ONLY task is to output the transformed prompt.

CRITICAL RULES - VIOLATIONS WILL RESULT IN REJECTION:
1. DO NOT start with ANY of these phrases (including variations):
   - "Stable Diffusion prompt..."
   - "A prompt..."
   - "An image..."
   - "Create..."
   - "Generate..."
   - "Make..."
   - "Produce..."
   - "Design..."
   - "In the style of..."
   - "Using the style of..."
   - "With the style of..."
   - "This is a..."
   - "This will be..."
   - "Prompt:"
   - "Output:"
   - "Result:"
2. Output ONLY the transformed prompt
3. NO explanations, descriptions, or metadata
4. NO quotes or special characters at start/end
5. NO phrases like "in this image" or "this prompt"

Style to match: "${style.description}"
${systemInstructions}`
            },
            {
                role: "user",
                content: `Transform: "${prompt}". Remember - output ONLY the transformed prompt, starting directly with the content.`
            }
        ];

        // Dla custom styli dodaj przykłady
        if (style.custom) {
            messages.splice(1, 0, {
                role: "system",
                content: `Examples of CORRECT and INCORRECT outputs:

❌ WRONG: "Stable Diffusion prompt for a landscape"
❌ WRONG: "An image of a landscape"
❌ WRONG: "Create a landscape"
❌ WRONG: "This prompt shows a landscape"
❌ WRONG: "In the style of ${style.description}, a landscape"
✅ CORRECT: "majestic mountain landscape, ${style.description}, dramatic lighting"

❌ WRONG: "A prompt for a portrait"
❌ WRONG: "Generate a portrait"
❌ WRONG: "This image depicts a portrait"
✅ CORRECT: "elegant portrait, ${style.description}, detailed features"

Your output must follow the CORRECT format. Start directly with the content.`
            });
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: messages,
            max_tokens: 500,
            temperature: 0.7,
            presence_penalty: 0.1,
            frequency_penalty: 0.1
        });

        let generatedPrompt = completion.choices[0].message.content;

        // Lista zabronionych fraz - rozszerzona
        const phrasesToRemove = [
            "stable diffusion prompt for",
            "stable diffusion prompt of",
            "a prompt for",
            "a prompt of",
            "an image of",
            "generate an image of",
            "create an image of",
            "a picture of",
            "an illustration of",
            "a rendering of",
            "a visualization of",
            "this image shows",
            "this prompt creates",
            "this prompt generates",
            "this image depicts",
            "this picture shows",
            "in this image",
            "in this prompt",
            "the image shows",
            "the prompt creates",
            "generate a",
            "create a",
            "make a",
            "produce a",
            "design a",
            "in the style of",
            "using the style of",
            "with the style of",
            "this is a",
            "this will be",
            "prompt:",
            "output:",
            "result:"
        ];

        // Usuń wszystkie zabronione frazy z początku (case insensitive)
        phrasesToRemove.forEach(phrase => {
            const regex = new RegExp(`^${phrase}\\s*`, 'i');
            while (regex.test(generatedPrompt)) {
                generatedPrompt = generatedPrompt.replace(regex, '');
            }
        });

        // Usuń cudzysłowy i inne znaki specjalne z początku i końca
        generatedPrompt = generatedPrompt.replace(/^["'`]|["'`]$/g, '');
        
        // Usuń wielokrotne spacje
        generatedPrompt = generatedPrompt.replace(/\s+/g, ' ');

        // Jeśli prompt nadal zaczyna się od zabronionej frazy, spróbuj jeszcze raz
        const hasUnwantedStart = phrasesToRemove.some(phrase => 
            generatedPrompt.toLowerCase().startsWith(phrase)
        );

        if (hasUnwantedStart) {
            // Rekurencyjne wywołanie z dodatkowym ostrzeżeniem
            messages.unshift({
                role: "system",
                content: "WARNING: Previous output was incorrect. Remember to start DIRECTLY with the content, without any introductory phrases."
            });
            return generatePrompt(prompt, style);
        }

        return generatedPrompt.trim();
    } catch (error) {
        console.error('Error generating prompt:', error);
        throw error;
    }
}

// Add post-processing handler
ipcMain.handle('post-process-prompt', async (event, { prompt, negativeWords }) => {
    try {
        const systemMessage = `You are a prompt refiner. Your task is to modify the given prompt by removing or rephrasing parts that contain any of the specified negative words/phrases, while maintaining the overall meaning and style of the prompt. The output should be a coherent, flowing prompt without the negative elements.

Rules:
1. Remove or rephrase parts containing the negative words/phrases
2. Maintain the overall meaning and style
3. Keep the output concise and natural
4. Return ONLY the modified prompt, without any explanations

Example:
Input prompt: "beautiful landscape with mountains and ugly rocks in the foreground"
Negative words: ["ugly"]
Output: "beautiful landscape with mountains and weathered rocks in the foreground"`;

        const messages = [
            { role: "system", content: systemMessage },
            { role: "user", content: `Prompt: "${prompt}"
Negative words/phrases: ${JSON.stringify(negativeWords)}` }
        ];

        const response = await fetch('http://127.0.0.1:11434/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: currentModel,
                messages: messages,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error('Failed to post-process prompt');
        }

        const data = await response.json();
        return data.message.content.trim();
    } catch (error) {
        console.error('Error in post-processing:', error);
        throw error;
    }
});
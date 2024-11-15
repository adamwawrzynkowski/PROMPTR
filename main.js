const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const ollamaManager = require('./ollama');
const configWindow = require('./config-window');
const stylesManager = require('./styles-manager');
const stylesWindow = require('./styles-window');
const settingsManager = require('./settings-manager');
const settingsWindow = require('./settings-window');
const themeManager = require('./theme-manager');

// Dodaj stałą z wersją aplikacji
const APP_VERSION = 'v0.1';

let mainWindow;
let connectionCheckInterval;
let configWindowInstance = null;

async function checkOllamaConnection() {
    try {
        const isConnected = await ollamaManager.checkConnection();
        const status = ollamaManager.getStatus();
        
        BrowserWindow.getAllWindows().forEach(window => {
            window.webContents.send('ollama-status', status);
        });
        
        if (!isConnected && !configWindowInstance) {
            await ollamaManager.startServer();
            const newStatus = await ollamaManager.checkConnection();
            if (!newStatus.isConnected || !newStatus.currentModel) {
                configWindowInstance = configWindow.create();
                configWindowInstance.on('closed', () => {
                    configWindowInstance = null;
                });
            }
        }
        
        return status;
    } catch (error) {
        console.error('Error checking Ollama connection:', error);
        return { isConnected: false };
    }
}

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        frame: false,
        transparent: true,
        titleBarStyle: 'hidden',
        backgroundColor: '#00000000',
        show: false
    });

    mainWindow.loadFile('index.html');

    mainWindow.webContents.on('did-finish-load', async () => {
        try {
            // Dodaj wysłanie wersji aplikacji do renderera
            mainWindow.webContents.send('app-version', APP_VERSION);
            
            const currentSettings = settingsManager.getSettings();
            await themeManager.applyTheme(currentSettings.theme, mainWindow);

            const status = await ollamaManager.checkConnection();
            if (!status.isConnected || !status.currentModel) {
                await ollamaManager.startServer();
                const newStatus = await ollamaManager.checkConnection();
                if (!newStatus.isConnected || !newStatus.currentModel) {
                    configWindowInstance = configWindow.create();
                    configWindowInstance.on('closed', () => {
                        configWindowInstance = null;
                    });
                }
            }

            mainWindow.show();
        } catch (error) {
            console.error('Error during window initialization:', error);
            mainWindow.show();
        }
    });

    connectionCheckInterval = setInterval(checkOllamaConnection, 5000);

    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Event handlers
ipcMain.on('refresh-connection', async () => {
    const status = await checkOllamaConnection();
    configWindow.window.webContents.send('connection-status', ollamaManager.getStatus());
});

ipcMain.on('save-config', async (event, config) => {
    await ollamaManager.setModel(config.model);
    if (configWindowInstance) {
        configWindowInstance.close();
        configWindowInstance = null;
    }
    BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('ollama-status', ollamaManager.getStatus());
    });
});

ipcMain.on('open-config', () => {
    configWindow.create();
});

ipcMain.on('toggle-history', () => {
    console.log('History toggled');
});

ipcMain.handle('generate-prompt', async (event, basePrompt, style) => {
    try {
        const status = ollamaManager.getStatus();
        if (!status.isConnected || !status.currentModel) {
            if (!configWindowInstance) {
                configWindowInstance = configWindow.create();
                configWindowInstance.on('closed', () => {
                    configWindowInstance = null;
                });
            }
            throw new Error('Please configure Ollama and select a model first');
        }

        // Pobierz styl z managera stylów
        const styleConfig = stylesManager.getStyle(style);
        if (!styleConfig) {
            throw new Error('Style not found');
        }

        // Sprawdź czy to custom styl
        const isCustomStyle = stylesManager.isCustomStyle(style);
        
        // Generuj prompt z uwzględnieniem custom stylu
        return await ollamaManager.generatePrompt(
            basePrompt, 
            style,
            isCustomStyle ? styleConfig : null
        );
    } catch (error) {
        console.error('Error in generate-prompt handler:', error);
        throw error;
    }
});

ipcMain.handle('generate-tags', async (event, text) => {
    try {
        const status = ollamaManager.getStatus();
        if (!status.isConnected || !status.currentModel) {
            throw new Error('Not connected or no model selected');
        }
        return await ollamaManager.generateTags(text);
    } catch (error) {
        console.error('Error in generate-tags handler:', error);
        throw error;
    }
});

ipcMain.handle('get-styles', () => {
    return stylesManager.getAllStyles();
});

ipcMain.handle('get-style', (event, id) => {
    return stylesManager.getStyle(id);
});

ipcMain.handle('add-style', (event, style) => {
    const id = `custom_${Date.now()}`;
    stylesManager.addCustomStyle(id, style);
    return id;
});

ipcMain.handle('update-style', (event, id, style) => {
    stylesManager.addCustomStyle(id, style);
});

ipcMain.handle('delete-style', (event, id) => {
    stylesManager.removeCustomStyle(id);
});

ipcMain.on('open-styles', () => {
    const stylesWindowInstance = stylesWindow.create();
    stylesWindowInstance.on('closed', () => {
        mainWindow.webContents.send('refresh-styles');
    });
});

ipcMain.handle('get-available-styles', () => {
    return stylesManager.getAllStyles();
});

ipcMain.handle('get-settings', () => {
    return settingsManager.getSettings();
});

ipcMain.handle('save-settings', async (event, newSettings) => {
    try {
        const settings = settingsManager.updateSettings(newSettings);
        
        // Zastosuj nowe ustawienia do wszystkich okien
        const windows = BrowserWindow.getAllWindows();
        await Promise.all(windows.map(async (window) => {
            try {
                // Zastosuj motyw
                await themeManager.applyTheme(settings.theme, window);
                // Wyślij aktualizację ustawień do okna
                window.webContents.send('settings-updated', settings);
            } catch (error) {
                console.error('Error applying settings to window:', error);
            }
        }));
        
        return settings;
    } catch (error) {
        console.error('Error saving settings:', error);
        throw error;
    }
});

ipcMain.on('open-settings', () => {
    const settingsWindowInstance = settingsWindow.create();
    
    // Zastosuj aktualny motyw do okna ustawień
    const currentSettings = settingsManager.getSettings();
    themeManager.applyTheme(currentSettings.theme, settingsWindowInstance);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    clearInterval(connectionCheckInterval);
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
}); 
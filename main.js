const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const ollamaManager = require('./ollama');
const configWindow = require('./config-window');
const stylesManager = require('./styles-manager');
const stylesWindow = require('./styles-window');
const settingsManager = require('./settings-manager');
const settingsWindow = require('./settings-window');
const themeManager = require('./theme-manager');
const { exec } = require('child_process');
const net = require('net');

// Dodaj stałą z wersją aplikacji
const APP_VERSION = 'v0.1';

// Dodaj na początku pliku, gdzie są inne stałe
const DRAW_THINGS_PATH = '/Applications/Draw Things.app';
const DRAW_THINGS_PORT = 3333;

let mainWindow;
let connectionCheckInterval;
let configWindowInstance = null;

// Dodaj funkcję sprawdzającą port
function checkPort(port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        
        socket.setTimeout(1000);
        
        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });
        
        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        
        socket.on('error', () => {
            socket.destroy();
            resolve(false);
        });
        
        socket.connect(port, '127.0.0.1');
    });
}

// Zmodyfikuj funkcję sprawdzania statusu Draw Things
async function checkDrawThingsStatus() {
    return new Promise(async (resolve) => {
        // Najpierw sprawdź czy Draw Things jest uruchomione
        exec('pgrep -f "Draw Things"', async (error, stdout, stderr) => {
            if (error || !stdout.trim()) {
                console.log('Draw Things is not running');
                resolve(false);
                return;
            }

            // Sprawdź czy port jest używany przez Draw Things
            exec(`lsof -i :${DRAW_THINGS_PORT}`, (error, stdout, stderr) => {
                console.log(`Port ${DRAW_THINGS_PORT} status:`, stdout);
                
                if (error || !stdout.trim()) {
                    console.log('Port is not in use');
                    resolve(false);
                    return;
                }

                // Jeśli port jest używany, uznajemy że Draw Things jest dostępne
                resolve(true);
            });
        });
    });
}

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

// Dodaj nowy handler IPC przed app.whenReady()
ipcMain.handle('check-draw-things', async () => {
    return await checkDrawThingsStatus();
});

// Zmodyfikuj handler do wysyłania promptu
ipcMain.handle('send-to-draw-things', async (event, prompt) => {
    const isAvailable = await checkDrawThingsStatus();
    if (!isAvailable) {
        throw new Error('Draw Things API is not available. Please make sure Draw Things is running and API Server is enabled with HTTP protocol.');
    }

    return new Promise((resolve, reject) => {
        // Wysyłamy tylko prompt
        const data = JSON.stringify({
            prompt: prompt
        });

        const options = {
            hostname: 'localhost',
            port: DRAW_THINGS_PORT,
            path: '/sdapi/v1/txt2img',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                'Accept': 'application/json'
            },
            timeout: 5000
        };

        console.log('Sending request to Draw Things:', options.path);
        console.log('Request data:', data);

        const req = http.request(options, (res) => {
            let responseData = '';

            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                console.log('Draw Things response:', responseData);
                try {
                    const response = JSON.parse(responseData);
                    if (res.statusCode === 200) {
                        resolve(true);
                    } else if (response.error === "HTTPException" && response.detail) {
                        reject(new Error(`Draw Things API error: ${response.detail}`));
                    } else {
                        reject(new Error(`Draw Things API error: ${res.statusCode} - ${responseData}`));
                    }
                } catch (error) {
                    reject(new Error(`Failed to parse Draw Things response: ${responseData}`));
                }
            });
        });

        req.on('error', (error) => {
            console.error('Error sending to Draw Things:', error);
            reject(new Error('Please make sure Draw Things API Server is enabled with HTTP protocol'));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request to Draw Things timed out'));
        });

        req.write(data);
        req.end();
    });
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
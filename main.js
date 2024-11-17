const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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
const visionWindow = require('./vision-window');
const modelInstallWindow = require('./model-install-window');
const startupWindow = require('./startup-window');
const configManager = require('./config-manager');
const styleEditWindow = require('./style-edit-window');
const fs = require('fs').promises;

// Zmień wersję aplikacji
const APP_VERSION = 'v1.0';

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
    // Najpierw pokaż okno startowe
    const startup = startupWindow.create();
    
    // Utwórz główne okno, ale nie pokazuj go jeszcze
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

    try {
        // Rozpocznij proces inicjalizacji
        startup.webContents.send('startup-progress', { step: 0 });
        
        // Spróbuj połączyć się z Ollama kilka razy
        let connectionAttempts = 0;
        const maxAttempts = 3;
        let status = null;

        while (connectionAttempts < maxAttempts) {
            startup.webContents.send('startup-progress', { 
                step: 0,
                status: `Connecting to Ollama (attempt ${connectionAttempts + 1}/${maxAttempts})...`
            });

            status = await ollamaManager.checkConnection();
            console.log('Connection status:', status);
            
            if (status && status.isConnected) {
                break;
            }

            connectionAttempts++;
            if (connectionAttempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        if (!status || !status.isConnected) {
            console.error('Failed to connect to Ollama:', status);
            startup.webContents.send('startup-error', 'Could not connect to Ollama. Please make sure Ollama is running and try again.');
            return;
        }

        // Kontynuuj inicjalizację jeśli połączenie się powiodło
        startup.webContents.send('startup-progress', { 
            step: 1, 
            status: 'Checking Ollama configuration...' 
        });

        // Sprawdź konfigurację
        const currentStatus = ollamaManager.getStatus();
        startup.webContents.send('startup-progress', { 
            step: 2, 
            status: 'Starting application...' 
        });

        // Poczekaj na załadowanie głównego okna
        await new Promise(resolve => {
            mainWindow.webContents.on('did-finish-load', async () => {
                mainWindow.webContents.send('app-version', APP_VERSION);
                const currentSettings = settingsManager.getSettings();
                await themeManager.applyTheme(currentSettings.theme, mainWindow);
                resolve();
            });
        });

        // Sprawdź czy zapisane modele są dostępne
        const savedConfig = configManager.getConfig();
        if (savedConfig.currentModel) {
            const isModelAvailable = await ollamaManager.checkModelAvailability(savedConfig.currentModel);
            if (!isModelAvailable) {
                configWindowInstance = configWindow.create();
                configWindowInstance.on('closed', () => {
                    configWindowInstance = null;
                });
            }
        } else {
            // Jeśli nie ma zapisanego modelu, pokaż okno konfiguracji
            configWindowInstance = configWindow.create();
            configWindowInstance.on('closed', () => {
                configWindowInstance = null;
            });
        }

        // Zamknij okno startowe i pokaż główne okno
        startup.close();
        mainWindow.show();

        // Rozpocznij sprawdzanie połączenia
        connectionCheckInterval = setInterval(checkOllamaConnection, 5000);

    } catch (error) {
        console.error('Error during startup:', error);
        startup.webContents.send('startup-error', error.message);
        // Nie zamykaj aplikacji automatycznie
    }
}

// Event handlers
ipcMain.on('refresh-connection', async () => {
    const status = await checkOllamaConnection();
    configWindow.window.webContents.send('connection-status', ollamaManager.getStatus());
});

ipcMain.on('save-config', async (event, config) => {
    await ollamaManager.setModel(config.model);
    await ollamaManager.setVisionModel(config.visionModel);
    if (configWindowInstance) {
        configWindowInstance.close();
        configWindowInstance = null;
    }
    BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('ollama-status', ollamaManager.getStatus());
    });
});

ipcMain.on('open-config', () => {
    configWindowInstance = configWindow.create();
    // Wyślij aktualny status do nowego okna konfiguracji
    const status = ollamaManager.getStatus();
    configWindowInstance.webContents.on('did-finish-load', () => {
        configWindowInstance.webContents.send('ollama-status', status);
    });
    configWindowInstance.on('closed', () => {
        configWindowInstance = null;
    });
});

ipcMain.on('toggle-history', () => {
    console.log('History toggled');
});

ipcMain.handle('generate-prompt', async (event, basePrompt, styleId) => {
    try {
        const status = ollamaManager.getStatus();
        if (!status.isConnected || !status.currentModel) {
            throw new Error('Not connected or no model selected');
        }

        // Pobierz styl z managera stylów
        const style = stylesManager.getStyle(styleId);
        if (!style) {
            throw new Error('Style not found');
        }

        // Sprawdź czy to custom styl
        const isCustomStyle = stylesManager.isCustomStyle(styleId);
        
        // Generuj prompt z uwzględnieniem custom stylu
        const improvedPrompt = await ollamaManager.generatePrompt(
            basePrompt, 
            styleId,
            isCustomStyle ? style : null
        );

        return improvedPrompt;
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
        
        console.log('Generating tags for text:', text);
        const tags = await ollamaManager.generateTags(text);
        console.log('Generated tags:', tags);

        // Wyślij tagi bezpośrednio do okna, które wysłało żądanie
        event.sender.send('tags-generated', tags);
        
        return tags;
    } catch (error) {
        console.error('Error in generate-tags handler:', error);
        // Wyślij błąd do okna
        event.sender.send('tags-generated-error', error.message);
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

ipcMain.handle('analyze-image', async (event, imageData) => {
    try {
        console.log('Checking Ollama status...');
        const status = ollamaManager.getStatus();
        console.log('Ollama status:', status);
        
        if (!status.isConnected) {
            throw new Error('Ollama is not connected');
        }

        // Sprawdź czy model vision jest wybrany
        if (!status.visionModel) {
            throw new Error('No vision model selected. Please configure a vision model in Ollama Configuration first.');
        }

        // Sprawdź czy model vision jest dostępny
        const isModelAvailable = await ollamaManager.checkModelAvailability(status.visionModel);
        if (!isModelAvailable) {
            modelInstallWindow.create(status.visionModel);
            throw new Error(`Vision model ${status.visionModel} needs to be installed first`);
        }
        
        console.log('Starting image analysis...');
        const result = await ollamaManager.analyzeImage(imageData);
        console.log('Analysis completed:', result);
        return result;
    } catch (error) {
        console.error('Error analyzing image:', error);
        throw error;
    }
});

ipcMain.on('open-vision', () => {
    visionWindow.create();
});

ipcMain.handle('set-prompt', async (event, prompt) => {
    try {
        console.log('Setting prompt in main:', prompt);
        mainWindow.webContents.send('set-prompt', prompt);
        console.log('Prompt sent to renderer');
        return true;
    } catch (error) {
        console.error('Error setting prompt:', error);
        throw error;
    }
});

// Dodaj te handlery przed app.whenReady()

// Handler do sprawdzania statusu Ollamy
ipcMain.handle('check-ollama-status', async () => {
    try {
        // Zamiast sprawdzać połączenie ponownie, użyj aktualnego statusu
        const status = ollamaManager.getStatus();
        console.log('Returning current Ollama status:', status);
        return status;
    } catch (error) {
        console.error('Error checking Ollama status:', error);
        return {
            isConnected: false,
            error: error.message
        };
    }
});

// Handler do pobierania dostępnych modeli
ipcMain.handle('get-available-models', async () => {
    try {
        // Lista dostępnych modeli Ollama
        const availableModels = [
            { name: 'llama2', type: 'Text' },
            { name: 'llama2:13b', type: 'Text' },
            { name: 'llama2:70b', type: 'Text' },
            { name: 'codellama', type: 'Text' },
            { name: 'mistral', type: 'Text' },
            { name: 'mixtral', type: 'Text' },
            { name: 'neural-chat', type: 'Text' },
            { name: 'starling-lm', type: 'Text' },
            { name: 'llava', type: 'Vision' },
            { name: 'bakllava', type: 'Vision' }
        ];
        
        console.log('Available models:', availableModels);
        return availableModels;
    } catch (error) {
        console.error('Error getting available models:', error);
        return [];
    }
});

// Zmień istniejący handler save-config na handle
ipcMain.handle('save-config', async (event, config) => {
    try {
        await ollamaManager.setModel(config.model);
        await ollamaManager.setVisionModel(config.visionModel);
        BrowserWindow.getAllWindows().forEach(window => {
            window.webContents.send('ollama-status', ollamaManager.getStatus());
        });
        return true;
    } catch (error) {
        console.error('Error saving config:', error);
        throw error;
    }
});

// Dodaj nowe handlery
ipcMain.handle('install-model', async (event, modelName) => {
    try {
        await ollamaManager.installModel(modelName, (progress) => {
            // Wyślij aktualizację postępu do okna konfiguracji
            event.sender.send('model-download-progress', {
                model: modelName,
                progress: progress
            });
        });
        return true;
    } catch (error) {
        console.error('Error installing model:', error);
        throw error;
    }
});

ipcMain.handle('check-model-availability', async (event, modelName) => {
    return await ollamaManager.checkModelAvailability(modelName);
});

// Dodaj nowy handler przed app.whenReady()
ipcMain.on('quit-app', () => {
    app.quit();
});

// Dodaj nowy handler do odświeżania statusu
ipcMain.handle('refresh-ollama-status', async () => {
    try {
        await ollamaManager.checkConnection();
        const status = ollamaManager.getStatus();
        // Wyślij zaktualizowany status do wszystkich okien
        BrowserWindow.getAllWindows().forEach(window => {
            window.webContents.send('ollama-status', status);
        });
        return status;
    } catch (error) {
        console.error('Error refreshing Ollama status:', error);
        return {
            isConnected: false,
            error: error.message
        };
    }
});

ipcMain.handle('delete-model', async (event, modelName) => {
    try {
        await ollamaManager.deleteModel(modelName);
        return true;
    } catch (error) {
        console.error('Error deleting model:', error);
        throw error;
    }
});

// Zaktualizuj handlery dla tworzenia/edycji stylu
ipcMain.on('create-new-style', (event) => {
    const newStyleWindow = styleEditWindow.create();
    newStyleWindow.on('closed', () => {
        // Odśwież listę stylów w oknie zarządzania
        event.sender.send('refresh-styles');
    });
});

ipcMain.on('edit-style', (event, styleId) => {
    const styleWindow = styleEditWindow.create(styleId);
    styleWindow.on('closed', () => {
        event.sender.send('refresh-styles');
    });
});

// Handler do importu stylów
ipcMain.handle('import-styles', async () => {
    try {
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [
                { name: 'PROMPTR Style', extensions: ['promptrstyle'] }
            ]
        });

        if (result.canceled) {
            return { success: false, message: 'Import canceled' };
        }

        const filePath = result.filePaths[0];
        const fileContent = await fs.readFile(filePath, 'utf8');
        const styles = JSON.parse(fileContent);

        // Sprawdź każdy styl przed importem
        for (const style of styles) {
            const styleId = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Sprawdź czy styl ma wszystkie wymagane pola
            if (!style.name || !style.description || !style.icon || !Array.isArray(style.fixedTags)) {
                return { success: false, message: 'Invalid style format' };
            }

            // Sprawdź czy styl o takiej nazwie już istnieje
            const existingStyles = stylesManager.getAllStyles();
            const styleExists = Object.values(existingStyles).some(
                existing => existing.name.toLowerCase() === style.name.toLowerCase()
            );

            if (styleExists) {
                return { 
                    success: false, 
                    message: `Style "${style.name}" already exists` 
                };
            }

            // Dodaj styl
            stylesManager.addCustomStyle(styleId, style);
        }

        return { 
            success: true, 
            message: `Successfully imported ${styles.length} style(s)` 
        };
    } catch (error) {
        console.error('Error importing styles:', error);
        return { 
            success: false, 
            message: 'Error importing styles: ' + error.message 
        };
    }
});

// Handler do eksportu stylów
ipcMain.handle('export-styles', async (event, styles) => {
    try {
        if (!Array.isArray(styles)) {
            styles = [styles];
        }

        if (styles.length === 0) {
            return { 
                success: false, 
                message: 'No styles to export' 
            };
        }

        // Użyj nazwy stylu jako nazwy pliku
        const defaultFileName = styles.length === 1 
            ? `${styles[0].name.toLowerCase().replace(/\s+/g, '_')}.promptrstyle`
            : 'promptr_styles.promptrstyle';

        const result = await dialog.showSaveDialog({
            defaultPath: defaultFileName,
            filters: [
                { name: 'PROMPTR Style', extensions: ['promptrstyle'] }
            ]
        });

        if (result.canceled) {
            return { success: false, message: 'Export canceled' };
        }

        await fs.writeFile(
            result.filePath, 
            JSON.stringify(styles, null, 2)
        );

        return { 
            success: true, 
            message: styles.length === 1 ? 'Style exported successfully' : `Successfully exported ${styles.length} styles`
        };
    } catch (error) {
        console.error('Error exporting styles:', error);
        return { 
            success: false, 
            message: 'Error exporting styles: ' + error.message 
        };
    }
});

// Dodaj handler dla przekazywania wyniku analizy do okna edycji stylu
ipcMain.on('vision-analysis-complete', (event, description, source = 'prompt') => {
    // Przekaż wynik do wszystkich okien wraz z informacją o źródle
    BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('vision-result', description, source);
    });
});

// Dodaj nowy handler dla analizy obrazu dla stylu
ipcMain.on('open-vision-for-style', () => {
    const visionWindowInstance = visionWindow.create('style');
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
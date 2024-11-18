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
    console.log('Checking Draw Things status...');
    return new Promise(async (resolve) => {
        // Najpierw sprawdź czy Draw Things jest uruchomione
        exec('pgrep -f "Draw Things"', async (error, stdout, stderr) => {
            if (error || !stdout.trim()) {
                console.log('Draw Things process is not running');
                resolve(false);
                return;
            }

            console.log('Draw Things process found, checking port...');

            // Sprawdź czy port jest używany przez Draw Things
            exec(`lsof -i :${DRAW_THINGS_PORT}`, (error, stdout, stderr) => {
                console.log(`Port ${DRAW_THINGS_PORT} check result:`, stdout);
                
                if (error || !stdout.trim()) {
                    console.log(`Port ${DRAW_THINGS_PORT} is not in use`);
                    resolve(false);
                    return;
                }

                console.log(`Port ${DRAW_THINGS_PORT} is active, Draw Things is available`);
                resolve(true);
            });
        });
    });
}

// Zmodyfikuj funkcję findOllamaPort
async function findOllamaPort() {
    // Najpierw sprawdź czy proces Ollamy działa
    return new Promise((resolve) => {
        exec('pgrep ollama', async (error, stdout, stderr) => {
            if (error || !stdout.trim()) {
                console.log('Ollama process is not running');
                resolve(null);
                return;
            }

            console.log('Ollama process found, checking ports...');

            // Sprawdź który port jest używany przez Ollama
            exec('lsof -i -P | grep ollama', async (error, stdout, stderr) => {
                if (error || !stdout.trim()) {
                    console.log('No Ollama ports found');
                    resolve(null);
                    return;
                }

                // Przeanalizuj wynik aby znaleźć port
                const lines = stdout.split('\n');
                for (const line of lines) {
                    // Szukaj linii zawierającej LISTEN i IPv4
                    if (line.includes('LISTEN') && line.includes('TCP')) {
                        const match = line.match(/:(\d+)/);
                        if (match && match[1]) {
                            const port = parseInt(match[1]);
                            console.log(`Found Ollama listening on port ${port}`);
                            resolve({ host: '127.0.0.1', port });
                            return;
                        }
                    }
                }

                // Jeśli nie znaleziono portu w lsof, spróbuj domyślne porty
                const defaultPorts = [11434, 8080, 3000];
                const localhost = '127.0.0.1';

                for (const port of defaultPorts) {
                    try {
                        const isAvailable = await checkPort(port);
                        if (isAvailable) {
                            console.log(`Found Ollama on default port ${port}`);
                            resolve({ host: localhost, port });
                            return;
                        }
                    } catch (error) {
                        console.log(`Port ${port} check failed:`, error.message);
                        continue;
                    }
                }

                console.log('No available Ollama ports found');
                resolve(null);
            });
        });
    });
}

// Dodaj funkcję pomocniczą do sprawdzania portu
function checkPort(port) {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: port,
            path: '/api/version',
            method: 'GET',
            timeout: 1000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    resolve(response.version ? true : false);
                } catch {
                    resolve(false);
                }
            });
        });

        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

// Zmodyfikuj funkcję checkOllamaConnection
async function checkOllamaConnection() {
    try {
        console.log('Starting Ollama connection check...');
        
        // Najpierw sprawdź czy Ollama jest uruchomiona
        const ollamaEndpoint = await findOllamaPort();
        
        if (!ollamaEndpoint) {
            console.log('Ollama is not running, attempting to start...');
            // Spróbuj zatrzymać istniejący proces
            exec('pkill ollama', async () => {
                // Poczekaj chwilę
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Uruchom Ollamę
                exec('ollama serve', async (error) => {
                    if (error) {
                        console.error('Error starting Ollama:', error);
                        return { 
                            isConnected: false, 
                            error: 'Failed to start Ollama server' 
                        };
                    }
                    
                    // Poczekaj na uruchomienie serwera
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    // Sprawdź ponownie połączenie
                    const newEndpoint = await findOllamaPort();
                    if (newEndpoint) {
                        ollamaManager.updateEndpoint(newEndpoint);
                        await ollamaManager.checkConnection();
                        return ollamaManager.getStatus();
                    }
                });
            });
            
            return { 
                isConnected: false, 
                error: 'Could not find Ollama endpoint' 
            };
        }

        console.log('Found Ollama endpoint:', ollamaEndpoint);
        ollamaManager.updateEndpoint(ollamaEndpoint);
        
        const isConnected = await ollamaManager.checkConnection();
        console.log('Ollama connection check result:', isConnected);
        
        if (!isConnected) {
            return {
                isConnected: false,
                error: 'Could not connect to Ollama'
            };
        }
        
        const status = ollamaManager.getStatus();
        console.log('Final Ollama status:', status);
        
        // Sprawdź czy mamy wszystkie potrzebne informacje
        if (!status.currentModel) {
            return {
                isConnected: true,
                error: 'No model selected'
            };
        }
        
        BrowserWindow.getAllWindows().forEach(window => {
            window.webContents.send('ollama-status', status);
        });
        
        return status;
    } catch (error) {
        console.error('Error in checkOllamaConnection:', error);
        return { 
            isConnected: false, 
            error: error.message,
            details: 'Check if Ollama is installed and running'
        };
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

    // Załaduj główne okno od razu
    mainWindow.loadFile('index.html');

    // Wyślij wersję do okna startowego po załadowaniu
    startup.webContents.on('did-finish-load', () => {
        startup.webContents.send('app-version', APP_VERSION);
        startup.webContents.send('startup-progress', { 
            step: 0,
            status: 'Initializing...' 
        });
    });

    try {
        // Próba połączenia z Ollamą
        startup.webContents.send('startup-progress', { 
            step: 1,
            status: 'Connecting to Ollama...' 
        });

        const status = await checkOllamaConnection();
        console.log('Ollama connection status:', status);

        // Kontynuuj niezależnie od statusu połączenia
        startup.webContents.send('startup-progress', { 
            step: 2,
            status: 'Starting application...' 
        });

        // Krótkie opóźnienie dla pokazania komunikatu
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Zastosuj ustawienia
        const currentSettings = settingsManager.getSettings();
        await themeManager.applyTheme(currentSettings.theme, mainWindow);

        // Pokaż główne okno i zamknij startowe
        mainWindow.show();
        startup.close();

        // Rozpocznij okresowe sprawdzanie połączenia
        connectionCheckInterval = setInterval(checkOllamaConnection, 5000);

    } catch (error) {
        console.error('Error during startup:', error);
        
        // W przypadku błędu, pokaż komunikat i kontynuuj
        startup.webContents.send('startup-error', error.message);
        
        // Krótkie opóźnienie na pokazanie błędu
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Mimo błędu, uruchom aplikację
        mainWindow.show();
        startup.close();
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
    console.log('Received check-draw-things request');
    const status = await checkDrawThingsStatus();
    console.log('Draw Things status check result:', status);
    return status;
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

ipcMain.handle('analyze-image', async (event, imageData, analysisType = 'content') => {
    try {
        console.log('Checking Ollama status...');
        const status = ollamaManager.getStatus();
        console.log('Ollama status:', status);
        
        if (!status.isConnected) {
            throw new Error('Ollama is not connected');
        }

        if (!status.visionModel) {
            throw new Error('No vision model selected. Please configure a vision model in Ollama Configuration first.');
        }

        const isModelAvailable = await ollamaManager.checkModelAvailability(status.visionModel);
        if (!isModelAvailable) {
            modelInstallWindow.create(status.visionModel);
            throw new Error(`Vision model ${status.visionModel} needs to be installed first`);
        }
        
        console.log('Starting image analysis...', 'Type:', analysisType);
        
        // Przekaż typ analizy bezpośrednio do metody analyzeImage
        const result = await ollamaManager.analyzeImage(imageData, null, analysisType);
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
        console.log('Getting available models...');
        
        // Lista znanych modeli
        const knownModels = {
            'llama2': { name: 'Llama 2', type: 'Text' },
            'llama3': { name: 'Llama 3', type: 'Text' },
            'llama3.2': { name: 'Llama 3.2', type: 'Text' },
            'mistral': { name: 'Mistral', type: 'Text' },
            'mixtral': { name: 'Mixtral', type: 'Text' },
            'neural-chat': { name: 'Neural Chat', type: 'Text' },
            'starling-lm': { name: 'Starling LM', type: 'Text' },
            'dolphin-llama3': { name: 'Dolphin Llama 3', type: 'Text' },
            'llava': { name: 'Llava', type: 'Vision' },
            'bakllava': { name: 'Bakllava', type: 'Vision' }
        };

        // Pobierz listę zainstalowanych modeli
        const installedModels = await ollamaManager.getInstalledModels();
        console.log('Installed models:', installedModels);

        // Przygotuj listę wszystkich modeli
        const allModels = [];

        // Dodaj zainstalowane modele
        for (const installedModel of installedModels) {
            // Wyciągnij podstawową nazwę modelu (bez tagów)
            const baseModelName = installedModel.split(':')[0].toLowerCase();
            
            // Jeśli model jest znany, użyj jego konfiguracji
            if (knownModels[baseModelName]) {
                allModels.push({
                    id: installedModel,
                    name: `${knownModels[baseModelName].name} (${installedModel})`,
                    type: knownModels[baseModelName].type,
                    installed: true
                });
            } else {
                // Dla nieznanych modeli, określ typ na podstawie nazwy
                const type = installedModel.includes('llava') ? 'Vision' : 'Text';
                allModels.push({
                    id: installedModel,
                    name: installedModel,
                    type: type,
                    installed: true
                });
            }
        }

        // Dodaj nieznane modele jako dostępne do pobrania
        Object.entries(knownModels).forEach(([modelId, modelInfo]) => {
            if (!installedModels.some(installed => installed.startsWith(modelId))) {
                allModels.push({
                    id: modelId,
                    name: modelInfo.name,
                    type: modelInfo.type,
                    installed: false
                });
            }
        });
        
        console.log('Final models list:', allModels);
        return allModels;
    } catch (error) {
        console.error('Error getting available models:', error);
        return [];
    }
});

// Zaktualizuj handler do zapisywania konfiguracji
ipcMain.handle('save-config', async (event, config) => {
    try {
        console.log('Saving config:', config);
        
        // Sprawdź czy wybrane modele są zainstalowane
        const textModel = config.model;
        const visionModel = config.visionModel;
        
        if (textModel) {
            const isTextModelInstalled = await ollamaManager.checkModelAvailability(textModel);
            if (!isTextModelInstalled) {
                throw new Error(`Text model ${textModel} is not installed`);
            }
        }
        
        if (visionModel) {
            const isVisionModelInstalled = await ollamaManager.checkModelAvailability(visionModel);
            if (!isVisionModelInstalled) {
                throw new Error(`Vision model ${visionModel} is not installed`);
            }
        }

        // Zapisz konfigurację
        await ollamaManager.setModel(textModel);
        await ollamaManager.setVisionModel(visionModel);
        
        // Zaktualizuj status we wszystkich oknach
        const newStatus = ollamaManager.getStatus();
        BrowserWindow.getAllWindows().forEach(window => {
            window.webContents.send('ollama-status', newStatus);
        });

        return true;
    } catch (error) {
        console.error('Error saving config:', error);
        throw error;
    }
});

// Dodaj nowy handler do sprawdzania czy model jest zainstalowany
ipcMain.handle('check-model-installed', async (event, modelId) => {
    try {
        const isInstalled = await ollamaManager.checkModelAvailability(modelId);
        return isInstalled;
    } catch (error) {
        console.error('Error checking model installation:', error);
        return false;
    }
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
ipcMain.on('vision-analysis-complete', (event, description, source = 'prompt', analysisType = 'content') => {
    BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('vision-result', description, source, analysisType);
    });
});

// Dodaj nowy handler dla analizy obrazu dla stylu
ipcMain.on('open-vision-for-style', () => {
    const visionWindowInstance = visionWindow.create('style');
});

// Dodaj nowy handler
ipcMain.handle('detect-and-translate', async (event, text) => {
    try {
        const result = await ollamaManager.detectAndTranslateText(text);
        return result;
    } catch (error) {
        console.error('Error in detect-and-translate:', error);
        throw error;
    }
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
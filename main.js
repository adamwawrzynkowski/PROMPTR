const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
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
const fs = require('fs');
const modelImportWindow = require('./model-import-window');
const sharp = require('sharp');
const { PythonShell } = require('python-shell');
const ort = require('onnxruntime-node');
const { spawn } = require('child_process');
const https = require('https');
const dependenciesWindow = require('./dependencies-window');
const creditsWindow = require('./credits-window');

// Usuń niepotrzebne importy
// const ort = require('onnxruntime-node');
// const { InferenceSession, Tensor } = ort;

// Zmień wersję aplikacji
const APP_VERSION = 'v0.9 Beta';

// Dodaj na początku pliku, gdzie są inne stałe
const DRAW_THINGS_PATH = '/Applications/Draw Things.app';
const DRAW_THINGS_PORT = 3333;
const SAFETENSORS_MODELS_PATH = path.join(app.getPath('userData'), 'models');
const CUSTOM_MODELS_PATH = path.join(app.getPath('userData'), 'custom-models');

let mainWindow;
let connectionCheckInterval;
let configWindowInstance = null;

// Dodaj na początku pliku zmienną do śledzenia aktualnego żądania
let currentGenerationRequest = null;

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
async function checkDrawThingsStatus(port = null) {
    console.log('Checking Draw Things status...');
    
    // Użyj portu z parametru lub z ustawień
    if (!port) {
        const settings = settingsManager.getSettings();
        port = settings.drawThingsIntegration.port || 3333;
    }
    
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
            exec(`lsof -i :${port}`, (error, stdout, stderr) => {
                console.log(`Port ${port} check result:`, stdout);
                
                if (error || !stdout.trim()) {
                    console.log(`Port ${port} is not in use`);
                    resolve(false);
                    return;
                }

                // Sprawdź czy port jest aktywny poprzez proste żądanie HTTP
                const testRequest = http.request({
                    hostname: '127.0.0.1',
                    port: port,
                    path: '/sdapi/v1/txt2img',
                    method: 'GET',
                    timeout: 1000
                }, (res) => {
                    // Nawet jeśli dostaniemy 404, to znaczy że serwer odpowiada
                    console.log(`Draw Things API response: ${res.statusCode}`);
                    resolve(true);
                });

                testRequest.on('error', (error) => {
                    console.log('Draw Things API test error:', error.message);
                    resolve(false);
                });

                testRequest.on('timeout', () => {
                    console.log('Draw Things API test timeout');
                    testRequest.destroy();
                    resolve(false);
                });

                testRequest.end();
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
        
        const ollamaEndpoint = await findOllamaPort();
        
        if (!ollamaEndpoint) {
            return { 
                isConnected: false, 
                error: 'Could not find Ollama endpoint',
                currentModel: null
            };
        }

        console.log('Found Ollama endpoint:', ollamaEndpoint);
        ollamaManager.updateEndpoint(ollamaEndpoint);
        
        const isConnected = await ollamaManager.checkConnection();
        console.log('Ollama connection check result:', isConnected);
        
        if (!isConnected) {
            return {
                isConnected: false,
                error: 'Could not connect to Ollama',
                currentModel: null
            };
        }
        
        const status = ollamaManager.getStatus();
        console.log('Final Ollama status:', status);
        
        // Zwróć tylko podstawowe informacje
        return {
            isConnected: status.isConnected,
            currentModel: status.currentModel,
            error: status.error
        };
        
    } catch (error) {
        console.error('Error in checkOllamaConnection:', error);
        return { 
            isConnected: false, 
            error: error.message,
            currentModel: null
        };
    }
}

// Dodaj funkcję sprawdzania zależności
async function checkDependencies() {
    const dependencies = {
        ollama: false,
        python: false
    };

    // Sprawdź Ollama
    try {
        const ollamaEndpoint = await findOllamaPort();
        dependencies.ollama = !!ollamaEndpoint;
    } catch (error) {
        console.error('Error checking Ollama:', error);
    }

    // Sprawdź Python
    try {
        await new Promise((resolve, reject) => {
            exec('python3 --version', (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout);
                }
            });
        });
        dependencies.python = true;
    } catch (error) {
        console.error('Error checking Python:', error);
    }

    return dependencies;
}

// Zmodyfikuj funkcję createWindow
async function createWindow() {
    console.log('Creating main window...');
    const startup = startupWindow.create();
    
    startup.webContents.on('did-finish-load', () => {
        startup.webContents.send('app-version', APP_VERSION);
        startup.webContents.send('startup-progress', { 
            step: 0,
            status: 'Checking dependencies...' 
        });
    });

    try {
        // Sprawdź zależności
        const dependencies = await checkDependencies();
        console.log('Dependencies check result:', dependencies);
        
        if (!dependencies.ollama || !dependencies.python) {
            console.log('Missing dependencies:', dependencies);
            startup.close();
            
            const depWindow = dependenciesWindow.create();
            depWindow.webContents.on('did-finish-load', () => {
                depWindow.webContents.send('dependencies-status', dependencies);
            });
            
            return;
        }

        // Kontynuuj normalne uruchamianie aplikacji
        startup.webContents.send('startup-progress', { 
            step: 1,
            status: 'Connecting to Ollama...' 
        });

        const status = await checkOllamaConnection();
        console.log('Ollama connection status:', status);

        if (!status.isConnected) {
            console.log('Ollama not connected, showing config window');
            startup.close();
            configWindow.create();
            return;
        }

        startup.webContents.send('startup-progress', { 
            step: 2,
            status: 'Starting application...' 
        });

        // Utwórz główne okno tylko jeśli wszystkie zależności są dostępne i Ollama jest połączone
        if (!mainWindow) {
            mainWindow = new BrowserWindow({
                width: 1200,
                height: 800,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                    enableRemoteModule: true,
                    backgroundThrottling: false,
                    allowRunningInsecureContent: true
                },
                frame: false,
                transparent: true,
                titleBarStyle: 'hidden',
                trafficLightPosition: { x: -100, y: -100 },
                backgroundColor: '#00000000'
            });

            // Załaduj główne okno
            await mainWindow.loadFile('index.html');

            // Zastosuj ustawienia
            const currentSettings = settingsManager.getSettings();
            if (currentSettings && currentSettings.theme) {
                await themeManager.applyTheme(currentSettings.theme, mainWindow);
            }

            // Rozpocznij okresowe sprawdzanie połączenia
            connectionCheckInterval = setInterval(async () => {
                try {
                    const status = await checkOllamaConnection();
                    const serializedStatus = {
                        isConnected: !!status.isConnected,
                        currentModel: status.currentModel || null,
                        error: status.error || null
                    };

                    BrowserWindow.getAllWindows().forEach(window => {
                        if (!window.isDestroyed()) {
                            try {
                                window.webContents.send('ollama-status', serializedStatus);
                            } catch (error) {
                                console.error('Error sending status to window:', error);
                            }
                        }
                    });
                } catch (error) {
                    console.error('Error in connection check interval:', error);
                }
            }, 5000);
        }

        // Pokaż główne okno i zamknij startowe
        mainWindow.show();
        startup.close();

    } catch (error) {
        console.error('Error during startup:', error);
        startup.webContents.send('startup-error', error.message);
        
        // Krótkie opóźnienie na pokazanie błędu
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Zamknij okno startowe w przypadku błędu
        startup.close();
    }

    mainWindow.on('maximize', () => {
        mainWindow.webContents.send('window-state-change', true);
    });

    mainWindow.on('unmaximize', () => {
        mainWindow.webContents.send('window-state-change', false);
    });
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

// Zaktualizuj handler generate-tags
ipcMain.handle('generate-tags', async (event, text) => {
    try {
        // Anuluj poprzednie żądanie jeśli istnieje
        if (currentGenerationRequest) {
            console.log('Cancelling previous generation request');
            await currentGenerationRequest.cancel();
            currentGenerationRequest = null;
        }

        const status = ollamaManager.getStatus();
        if (!status.isConnected || !status.currentModel) {
            throw new Error('Not connected or no model selected');
        }
        
        console.log('Original text:', text);

        // Sprawdź ustawienia tłumaczenia i przetłumacz jeśli potrzeba
        const settings = settingsManager.getSettings();
        let textToProcess = text;

        if (settings.autoTranslate) {
            console.log('Auto-translate is enabled, translating...');
            try {
                const translationResult = await ollamaManager.detectAndTranslateText(text);
                console.log('Translation result:', translationResult);
                
                if (translationResult.isTranslated) {
                    textToProcess = translationResult.translatedText;
                    console.log('Using translated text:', textToProcess);
                    
                    // Wyślij tylko podstawowe informacje o tłumaczeniu
                    const serializedTranslation = {
                        isTranslated: true,
                        originalText: text,
                        translatedText: textToProcess,
                        originalLanguage: translationResult.originalLanguage || 'unknown'
                    };
                    
                    event.sender.send('translation-status', serializedTranslation);
                }
            } catch (translationError) {
                console.error('Translation error:', translationError);
                event.sender.send('translation-error', {
                    message: translationError.message || 'Translation failed'
                });
                throw translationError;
            }
        }

        // Kontynuuj tylko jeśli mamy tekst do przetworzenia
        if (!textToProcess) {
            throw new Error('No text to process');
        }

        console.log('Generating tags for text:', textToProcess);

        // Utwórz nowe żądanie
        currentGenerationRequest = {
            cancel: () => ollamaManager.cancelCurrentGeneration(),
            promise: ollamaManager.generateTags(textToProcess)
        };

        // Generuj tagi
        const tags = await currentGenerationRequest.promise;
        currentGenerationRequest = null;

        if (!tags || tags.length === 0) {
            throw new Error('No tags generated');
        }

        console.log('Generated tags:', tags);
        event.sender.send('tags-generated', tags);
        return tags;

    } catch (error) {
        console.error('Error in generate-tags handler:', error);
        event.sender.send('tags-generated-error', {
            message: error.message || 'Tag generation failed'
        });
        currentGenerationRequest = null;
        throw error;
    }
});

// Zaktualizuj handler generate-prompt
ipcMain.handle('generate-prompt', async (event, basePrompt, styleId) => {
    try {
        // Anuluj poprzednie żądanie jeśli istnieje
        if (currentGenerationRequest) {
            console.log('Cancelling previous generation request');
            await currentGenerationRequest.cancel();
            currentGenerationRequest = null;
        }

        const status = ollamaManager.getStatus();
        if (!status.isConnected || !status.currentModel) {
            throw new Error('Not connected or no model selected');
        }

        // Sprawdź ustawienia tłumaczenia i przetłumacz jeśli potrzeba
        const settings = settingsManager.getSettings();
        let promptToProcess = basePrompt;

        if (settings.autoTranslate) {
            console.log('Auto-translate is enabled, translating...');
            try {
                const translationResult = await ollamaManager.detectAndTranslateText(basePrompt);
                console.log('Translation result:', translationResult);
                
                if (translationResult.isTranslated) {
                    promptToProcess = translationResult.translatedText;
                    console.log('Using translated prompt:', promptToProcess);
                    
                    // Wyślij tylko podstawowe informacje o tłumaczeniu
                    const serializedTranslation = {
                        isTranslated: true,
                        originalText: basePrompt,
                        translatedText: promptToProcess,
                        originalLanguage: translationResult.originalLanguage || 'unknown'
                    };
                    
                    event.sender.send('translation-status', serializedTranslation);
                }
            } catch (translationError) {
                console.error('Translation error:', translationError);
                event.sender.send('translation-error', {
                    message: translationError.message || 'Translation failed'
                });
                throw translationError;
            }
        }

        // Kontynuuj tylko jeśli mamy prompt do przetworzenia
        if (!promptToProcess) {
            throw new Error('No prompt to process');
        }

        // Pobierz styl z managera stylów
        const style = stylesManager.getStyle(styleId);
        if (!style) {
            throw new Error('Style not found');
        }

        // Sprawdź czy to custom styl
        const isCustomStyle = stylesManager.isCustomStyle(styleId);
        
        // Utwórz nowe żądanie
        currentGenerationRequest = {
            cancel: () => ollamaManager.cancelCurrentGeneration(),
            promise: ollamaManager.generatePrompt(
                promptToProcess, 
                styleId,
                isCustomStyle ? style : null
            )
        };

        // Generuj prompt
        const improvedPrompt = await currentGenerationRequest.promise;
        currentGenerationRequest = null;

        return improvedPrompt;

    } catch (error) {
        console.error('Error in generate-prompt handler:', error);
        currentGenerationRequest = null;
        throw error;
    }
});

ipcMain.handle('get-styles', () => {
    const styles = stylesManager.getAllStyles();
    // Upewnij się, że zwracamy prosty obiekt JSON
    return Object.fromEntries(
        Object.entries(styles).map(([id, style]) => [
            id,
            {
                ...style,
                // Upewnij się, że wszystkie pola są serializowalne
                name: String(style.name),
                description: String(style.description),
                icon: String(style.icon),
                fixedTags: Array.isArray(style.fixedTags) ? style.fixedTags.map(String) : []
            }
        ])
    );
});

ipcMain.handle('get-style', (event, id) => {
    const style = stylesManager.getStyle(id);
    if (!style) return null;
    
    // Upewnij się, że zwracamy prosty obiekt JSON
    return {
        ...style,
        name: String(style.name),
        description: String(style.description),
        icon: String(style.icon),
        fixedTags: Array.isArray(style.fixedTags) ? style.fixedTags.map(String) : []
    };
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
    try {
        const settings = settingsManager.getSettings();
        // Upewnij się, że zwracamy tylko serializowalne dane
        return {
            theme: settings.theme || 'dark',
            autoTranslate: Boolean(settings.autoTranslate),
            tagGeneration: Boolean(settings.tagGeneration),
            slowMode: Boolean(settings.slowMode),
            slowModeDelay: Number(settings.slowModeDelay) || 1000,
            drawThingsIntegration: {
                enabled: Boolean(settings.drawThingsIntegration?.enabled),
                path: String(settings.drawThingsIntegration?.path || ''),
                port: Number(settings.drawThingsIntegration?.port) || 3333
            }
        };
    } catch (error) {
        console.error('Error getting settings:', error);
        return settingsManager.defaultSettings;
    }
});

ipcMain.handle('save-settings', async (event, newSettings) => {
    try {
        console.log('Saving new settings:', newSettings);
        const settings = settingsManager.updateSettings(newSettings);
        
        // Zastosuj nowe ustawienia do wszystkich okien
        const windows = BrowserWindow.getAllWindows();
        await Promise.all(windows.map(async (window) => {
            if (!window.isDestroyed()) {
                try {
                    // Zastosuj motyw
                    if (settings.theme) {
                        await themeManager.applyTheme(settings.theme, window);
                    }
                    // Wyślij aktualizację ustawień do okna
                    window.webContents.send('settings-updated', settings);
                } catch (error) {
                    console.error('Error applying settings to window:', error);
                }
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
    const settings = settingsManager.getSettings();
    const port = settings.drawThingsIntegration.port || 3333;
    return await checkDrawThingsStatus(port);
});

// Zmodyfikuj handler do wysyłania promptu
ipcMain.handle('send-to-draw-things', async (event, prompt) => {
    try {
        // Pobierz aktualne ustawienia
        const settings = settingsManager.getSettings();
        const drawThingsPort = settings.drawThingsIntegration.port || 3333;

        const isAvailable = await checkDrawThingsStatus(drawThingsPort);
        if (!isAvailable) {
            throw new Error('Draw Things API is not available. Please make sure Draw Things is running and API Server is enabled with HTTP protocol.');
        }

        return new Promise((resolve, reject) => {
            // Wysyłamy tylko prompt
            const data = JSON.stringify({
                prompt: prompt
            });

            const options = {
                hostname: '127.0.0.1',
                port: drawThingsPort,
                path: '/sdapi/v1/txt2img',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                    'Accept': 'application/json'
                },
                timeout: 10000
            };

            console.log('Sending request to Draw Things:', {
                port: drawThingsPort,
                path: options.path,
                prompt: prompt
            });

            const req = http.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    console.log('Draw Things response status:', res.statusCode);
                    if (res.statusCode === 200) {
                        resolve(true);
                    } else {
                        try {
                            const response = JSON.parse(responseData);
                            reject(new Error(`Draw Things API error: ${response.detail || responseData}`));
                        } catch {
                            reject(new Error(`Draw Things API error: ${res.statusCode} - ${responseData}`));
                        }
                    }
                });
            });

            req.on('error', (error) => {
                console.error('Error sending to Draw Things:', error);
                if (error.code === 'ECONNREFUSED') {
                    reject(new Error('Connection refused. Please make sure Draw Things API Server is running and accessible.'));
                } else {
                    reject(new Error(`Connection error: ${error.message}`));
                }
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request to Draw Things timed out. Please check your connection and try again.'));
            });

            req.write(data);
            req.end();
        });
    } catch (error) {
        console.error('Error in send-to-draw-things handler:', error);
        throw error;
    }
});

ipcMain.handle('analyze-image', async (event, imageData, analysisType = 'content', useCustomModel = false, customModelName = null) => {
    try {
        console.log('Starting image analysis...', {
            analysisType,
            useCustomModel,
            customModelName
        });

        // Sprawdź czy to model custom
        if (useCustomModel) {
            console.log('Using custom model:', customModelName);
            
            // Pobierz pełną ścieżkę do modelu
            const customModelsPath = path.join(app.getPath('userData'), 'PROMPTR', 'custom-models', customModelName);
            console.log('Looking for model in:', customModelsPath);
            
            try {
                // Znajdź plik .safetensors w folderze modelu
                const files = await fs.readdir(customModelsPath);
                console.log('Files in model directory:', files);
                
                // Szukaj pliku model.safetensors lub innego .safetensors
                let modelFile = files.find(file => file === 'model.safetensors') || 
                              files.find(file => file.endsWith('.safetensors'));
                
                if (!modelFile) {
                    throw new Error('No .safetensors file found in model directory');
                }

                const modelPath = path.join(customModelsPath, modelFile);
                console.log('Using model file:', modelPath);

                // Sprawdź czy plik istnieje
                await fs.access(modelPath);
                console.log('Found model at:', modelPath);
                
                const result = await analyzeWithCustomModel(imageData, modelPath);
                return result;
            } catch (error) {
                console.error('Error accessing model:', error);
                throw new Error(`Model file not found: ${customModelName}`);
            }
        }

        // Dla modeli Ollama
        const status = ollamaManager.getStatus();
        if (!status.isConnected) {
            throw new Error('Ollama is not connected');
        }

        const result = await ollamaManager.analyzeImage(
            imageData,
            null,
            analysisType,
            false,
            customModelName
        );

        return result;
    } catch (error) {
        console.error('Error in analyze-image:', error);
        throw error;
    }
});

// Dodaj nową funkcję do przetwarzania obrazu
async function preprocessImage(imageData) {
    try {
        // Konwertuj base64 na buffer
        const buffer = Buffer.from(imageData.split(',')[1], 'base64');

        // Przetwórz obraz
        const processedImage = await sharp(buffer)
            .resize(224, 224) // Standardowy rozmiar dla wielu modeli CV
            .normalise() // Normalizacja wartości pikseli
            .raw()
            .toBuffer({ resolveWithObject: true });

        // Konwertuj do formatu float32 i normalizuj wartości do zakresu [0,1]
        const float32Data = new Float32Array(processedImage.data.length);
        for (let i = 0; i < processedImage.data.length; i++) {
            float32Data[i] = processedImage.data[i] / 255.0;
        }

        return {
            data: float32Data,
            width: processedImage.info.width,
            height: processedImage.info.height,
            channels: 3
        };
    } catch (error) {
        console.error('Error preprocessing image:', error);
        throw error;
    }
}

// Dodaj funkcję do dynamicznego importu
async function getTransformers() {
    const { pipeline, env } = await import('@xenova/transformers');
    return { pipeline, env };
}

// Zaktualizuj funkcję analyzeWithCustomModel
async function analyzeWithCustomModel(imageData, modelPath) {
    try {
        console.log('Starting analysis with model at path:', modelPath);

        // Wyślij status do okna
        BrowserWindow.getAllWindows().forEach(window => {
            window.webContents.send('analysis-progress', {
                status: 'Loading model...',
                progress: 0.2
            });
        });

        // Utwórz sesję ONNX Runtime
        const session = await ort.InferenceSession.create(modelPath);

        // Wyślij status
        BrowserWindow.getAllWindows().forEach(window => {
            window.webContents.send('analysis-progress', {
                status: 'Processing image...',
                progress: 0.4
            });
        });

        // Przetwórz obraz
        const processedImage = await preprocessImage(imageData);

        // Wyślij status
        BrowserWindow.getAllWindows().forEach(window => {
            window.webContents.send('analysis-progress', {
                status: 'Running inference...',
                progress: 0.6
            });
        });

        // Przygotuj tensor wejściowy
        const inputTensor = new ort.Tensor(
            'float32',
            processedImage.data,
            [1, processedImage.channels, processedImage.height, processedImage.width]
        );

        // Wykonaj inference
        const feeds = { input: inputTensor };
        const outputMap = await session.run(feeds);
        const output = outputMap[Object.keys(outputMap)[0]];

        // Wyślij status
        BrowserWindow.getAllWindows().forEach(window => {
            window.webContents.send('analysis-progress', {
                status: 'Processing results...',
                progress: 0.8
            });
        });

        // Przetwórz wyniki
        const outputData = output.data;
        const maxIndex = Array.from(outputData).indexOf(Math.max(...outputData));
        const confidence = outputData[maxIndex];

        // Spróbuj załadować etykiety
        let labels = [];
        try {
            const configPath = path.join(path.dirname(modelPath), 'config.json');
            const configContent = await fs.readFile(configPath, 'utf8');
            const config = JSON.parse(configContent);
            labels = config.id2label || {};
        } catch (error) {
            console.log('No labels found in config, using indices');
            labels = Array.from(outputData, (_, i) => `Class ${i}`);
        }

        const finalResult = {
            description: labels[maxIndex] || `Class ${maxIndex}`,
            confidence: confidence,
            details: Array.from(outputData).map((score, idx) => ({
                label: labels[idx] || `Class ${idx}`,
                score: score
            })).sort((a, b) => b.score - a.score).slice(0, 5)
        };

        // Wyślij końcowy status
        BrowserWindow.getAllWindows().forEach(window => {
            window.webContents.send('analysis-progress', {
                status: 'Analysis complete',
                progress: 1.0,
                result: finalResult
            });
        });

        return finalResult;
    } catch (error) {
        console.error('Error in analyzeWithCustomModel:', error);
        BrowserWindow.getAllWindows().forEach(window => {
            window.webContents.send('analysis-error', error.message);
        });
        throw error;
    }
}

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
        console.log('Deleting model:', modelName);
        const response = await fetch(`${ollamaManager.getBaseUrl()}/api/delete`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: modelName
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to delete model: ${response.status} - ${errorData.error || 'Unknown error'}`);
        }

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

// Dodaj nowy handler do instalacji modelu z Hugging Face
ipcMain.handle('install-custom-model', async (event, modelUrl) => {
    try {
        const result = await ollamaManager.installCustomModel(modelUrl);
        return result;
    } catch (error) {
        console.error('Error installing custom model:', error);
        throw error;
    }
});

// Dodaj handler
ipcMain.on('open-model-import', () => {
    modelImportWindow.create();
});

// Dodaj nowe handlery
ipcMain.handle('get-custom-models', async () => {
    return await ollamaManager.getCustomModels();
});

ipcMain.handle('delete-custom-model', async (event, modelName) => {
    return await ollamaManager.deleteCustomModel(modelName);
});

// Dodaj funkcję do sprawdzania i instalacji zależności Pythona
async function checkAndInstallPythonDependencies() {
    return new Promise((resolve, reject) => {
        const requirements = [
            'torch',
            'safetensors',
            'numpy'
        ];

        // Najpierw sprawdź czy Python jest zainstalowany
        const checkPython = spawn('python3', ['--version']);
        
        checkPython.on('error', () => {
            dialog.showErrorBox(
                'Python Not Found',
                'Python 3 is required but not found. Please install Python 3 from python.org'
            );
            reject(new Error('Python not found'));
        });

        checkPython.on('close', (code) => {
            if (code === 0) {
                console.log('Python found, checking dependencies...');
                
                // Sprawdź zainstalowane pakiety
                const pip = spawn('pip3', ['list']);
                let installedPackages = '';

                pip.stdout.on('data', (data) => {
                    installedPackages += data.toString();
                });

                pip.on('close', async () => {
                    const missingPackages = requirements.filter(pkg => 
                        !installedPackages.includes(pkg)
                    );

                    if (missingPackages.length > 0) {
                        console.log('Installing missing packages:', missingPackages);
                        
                        // Pokaż dialog informujący o instalacji
                        dialog.showMessageBox({
                            type: 'info',
                            title: 'Installing Dependencies',
                            message: `Installing required Python packages: ${missingPackages.join(', ')}`
                        });

                        // Instaluj brakujące pakiety
                        const install = spawn('pip3', ['install', ...missingPackages]);
                        
                        install.stdout.on('data', (data) => {
                            console.log('pip install output:', data.toString());
                        });

                        install.stderr.on('data', (data) => {
                            console.error('pip install error:', data.toString());
                        });

                        install.on('close', (code) => {
                            if (code === 0) {
                                console.log('Dependencies installed successfully');
                                resolve();
                            } else {
                                const error = new Error('Failed to install dependencies');
                                dialog.showErrorBox(
                                    'Installation Failed',
                                    'Failed to install required Python packages. Please install them manually:\n' +
                                    missingPackages.map(pkg => `pip3 install ${pkg}`).join('\n')
                                );
                                reject(error);
                            }
                        });
                    } else {
                        console.log('All dependencies already installed');
                        resolve();
                    }
                });
            } else {
                reject(new Error('Python check failed'));
            }
        });
    });
}

// Dodaj funkcję do pobierania ścieżki aplikacji
function getAppDataPath() {
    if (process.platform === 'darwin') { // macOS
        return path.join(app.getPath('userData'), 'PROMPTR');
    } else if (process.platform === 'win32') { // Windows
        return path.join(app.getPath('userData'), 'PROMPTR');
    } else { // Linux
        return path.join(app.getPath('userData'), 'PROMPTR');
    }
}

// Dodaj funkcję do pobierania ścieżki virtual env
function getVenvPath() {
    return path.join(getAppDataPath(), 'venv');
}

// Zmodyfikuj funkcję runPythonScript
function runPythonScript(scriptPath, args = []) {
    return new Promise((resolve, reject) => {
        // Najpierw uruchom skrypt używając systemowego Pythona do utworzenia venv
        if (scriptPath.endsWith('python_env_manager.py')) {
            const pythonProcess = spawn('python3', [scriptPath, ...args]);
            
            let output = '';
            let errorOutput = '';
            
            pythonProcess.stdout.on('data', (data) => {
                output += data.toString();
                console.log('Python output:', data.toString());
            });
            
            pythonProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
                console.error('Python error:', data.toString());
            });
            
            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    resolve(output);
                } else {
                    reject(new Error(errorOutput || 'Python script failed'));
                }
            });
        } else {
            // Dla innych skryptów użyj Pythona z venv
            const venvPython = path.join(getVenvPath(), 
                process.platform === 'win32' ? 'Scripts\\python.exe' : 'bin/python');
            
            console.log('Using Python path:', venvPython);
            console.log('Running script:', scriptPath);
            console.log('With args:', args);

            const pythonProcess = spawn(venvPython, [scriptPath, ...args]);
            
            let output = '';
            let errorOutput = '';
            
            pythonProcess.stdout.on('data', (data) => {
                output += data.toString();
                console.log('Python output:', data.toString());
            });
            
            pythonProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
                console.error('Python error:', data.toString());
            });
            
            pythonProcess.on('error', (error) => {
                console.error('Failed to start Python process:', error);
                reject(new Error(`Failed to start Python process: ${error.message}`));
            });
            
            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    resolve(output);
                } else {
                    reject(new Error(errorOutput || 'Python script failed'));
                }
            });
        }
    });
}

// Zmodyfikuj obsługę importu modelu
ipcMain.on('start-model-import', async (event, modelUrl) => {
    const sender = event.sender;
    let downloadResult = null;
    
    try {
        // Step 1: Download
        sender.send('import-status', {
            step: 'download',
            message: 'Starting download...',
            isActive: true
        });

        downloadResult = await ollamaManager.installCustomModel(modelUrl, 
            (progress, downloadedSize, totalSize, fileName) => {
                sender.send('import-progress', { progress });
                sender.send('import-status', {
                    step: 'download',
                    message: `Downloading ${fileName} (${(downloadedSize / 1024 / 1024).toFixed(1)}MB / ${(totalSize / 1024 / 1024).toFixed(1)}MB)`,
                    isActive: true
                });
            }
        );

        if (!downloadResult.success) {
            throw new Error(downloadResult.error || 'Download failed');
        }

        sender.send('import-status', {
            step: 'download',
            message: 'Download complete',
            isComplete: true
        });

        // Step 2: Setup Python Environment
        sender.send('import-status', {
            step: 'dependencies',
            message: 'Setting up Python environment...',
            isActive: true
        });

        try {
            // Uruchom setup środowiska Python
            const envSetupPath = path.join(__dirname, 'python_env_manager.py');
            await runPythonScript(envSetupPath);
            
            sender.send('import-status', {
                step: 'dependencies',
                message: 'Dependencies installed successfully',
                isComplete: true
            });
        } catch (envError) {
            throw new Error(`Failed to setup Python environment: ${envError.message}`);
        }

        // Step 3: Convert
        sender.send('import-status', {
            step: 'convert',
            message: 'Converting to ONNX...',
            isActive: true
        });

        try {
            const convertScriptPath = path.join(__dirname, 'convert.py');
            await runPythonScript(convertScriptPath, [downloadResult.path, path.join(downloadResult.path, 'model.onnx')]);
            
            sender.send('import-status', {
                step: 'convert',
                message: 'Conversion complete',
                isComplete: true
            });

            sender.send('import-complete');
        } catch (convError) {
            throw new Error(`Conversion failed: ${convError.message}`);
        }

    } catch (error) {
        console.error('Import error:', error);
        sender.send('import-error', error.message);
        
        // Cleanup if needed
        if (downloadResult && downloadResult.path) {
            try {
                fs.rmSync(downloadResult.path, { recursive: true, force: true });
            } catch (cleanupError) {
                console.error('Cleanup error:', cleanupError);
            }
        }
    }
});

// Dodaj wywołanie sprawdzenia zależności przy starcie aplikacji
app.whenReady().then(async () => {
    try {
        await checkAndInstallPythonDependencies();
        createWindow();
    } catch (error) {
        console.error('Failed to check/install dependencies:', error);
        // Kontynuuj uruchamianie aplikacji nawet jeśli instalacja się nie powiedzie
        createWindow();
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

async function downloadHuggingFaceFiles(repoId, targetDir, progressCallback) {
    try {
        // Usuń przedrostek URL i wyczyść ścieżkę
        repoId = repoId
            .replace('https://huggingface.co/', '')
            .replace('/tree/main', '')
            .trim();
        
        if (repoId.startsWith('@')) {
            repoId = repoId.substring(1);
        }
        
        console.log('=== Download Process Start ===');
        console.log('Repository ID:', repoId);
        console.log('Target directory:', targetDir);

        // Utwórz folder docelowy
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
            console.log('Created target directory');
        }

        // Pobierz listę plików z API
        const apiUrl = `https://huggingface.co/api/repos/${repoId}/tree/main`;
        console.log('Fetching file list from:', apiUrl);
        
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch repository content: ${response.status} ${response.statusText}`);
        }

        const files = await response.json();
        console.log('\n=== Files in Repository ===');
        console.log('Found files:', files);

        // Rekurencyjnie pobierz wszystkie pliki
        const downloadPromises = [];
        const downloadedFiles = [];

        async function processDirectory(items, currentPath = '') {
            for (const item of items) {
                const itemPath = currentPath ? `${currentPath}/${item.path}` : item.path;
                
                if (item.type === 'directory') {
                    // Pobierz zawartość podfolderu
                    const subDirUrl = `https://huggingface.co/api/repos/${repoId}/tree/main/${itemPath}`;
                    const subDirResponse = await fetch(subDirUrl);
                    const subDirContent = await subDirResponse.json();
                    await processDirectory(subDirContent, itemPath);
                } else if (item.type === 'file') {
                    // Utwórz podfoldery jeśli potrzebne
                    const targetPath = path.join(targetDir, itemPath);
                    await fs.mkdir(path.dirname(targetPath), { recursive: true });

                    // Dodaj plik do kolejki pobierania
                    downloadPromises.push(
                        downloadFile(repoId, itemPath, targetPath, progressCallback)
                            .then(() => {
                                downloadedFiles.push(itemPath);
                                progressCallback(
                                    (downloadedFiles.length / files.length) * 100,
                                    downloadedFiles.length,
                                    files.length,
                                    itemPath
                                );
                            })
                    );
                }
            }
        }

        await processDirectory(files);
        await Promise.all(downloadPromises);

        console.log('\n=== Download Complete ===');
        console.log('Downloaded files:', downloadedFiles);
        return true;

    } catch (error) {
        console.error('\n=== Download Error ===');
        console.error(error);
        throw error;
    }
}

// Dodaj nową funkcję pomocniczą do pobierania pojedynczego pliku
async function downloadFile(repoId, filePath, targetPath, progressCallback) {
    const fileUrl = `https://huggingface.co/${repoId}/resolve/main/${filePath}`;
    console.log(`Downloading: ${filePath}`);
    console.log(`From: ${fileUrl}`);
    console.log(`To: ${targetPath}`);

    const response = await fetch(fileUrl);
    if (!response.ok) {
        throw new Error(`Failed to download ${filePath}: ${response.status} ${response.statusText}`);
    }

    const fileStream = fs.createWriteStream(targetPath);
    const reader = response.body.getReader();
    const contentLength = parseInt(response.headers.get('content-length') || '0');
    let downloadedLength = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        downloadedLength += value.length;
        fileStream.write(Buffer.from(value));

        if (contentLength > 0) {
            const progress = (downloadedLength / contentLength) * 100;
            progressCallback(progress, downloadedLength, contentLength, filePath);
        }
    }

    fileStream.end();
    console.log(`Successfully downloaded ${filePath}`);
}

// Na początku pliku, po importach
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Dodaj nową funkcję pomocniczą do sprawdzania statusu Ollama
async function checkOllamaAvailability() {
    const status = ollamaManager.getStatus();
    if (!status.isConnected) {
        throw new Error('Ollama is not connected');
    }
    if (!status.currentModel) {
        throw new Error('No model selected');
    }
    return true;
}

// Dodaj nowy handler do sprawdzania statusu przed generowaniem
ipcMain.handle('check-ollama-before-generation', async () => {
    try {
        return await checkOllamaAvailability();
    } catch (error) {
        console.error('Ollama availability check failed:', error);
        throw error;
    }
});

// Dodaj obsługę anulowania generowania
ipcMain.on('cancel-generation', async () => {
    try {
        await ollamaManager.cancelCurrentGeneration();
    } catch (error) {
        console.error('Error cancelling generation:', error);
    }
});

// Dodaj handler do restartu aplikacji
ipcMain.on('restart-app', () => {
    app.relaunch();
    app.exit();
});

// Dodaj nowy handler do instalacji modelu
ipcMain.handle('install-model', async (event, modelName) => {
    try {
        console.log('Starting model installation:', modelName);
        
        // Sprawdź czy model jest już zainstalowany
        const isAvailable = await ollamaManager.checkModelAvailability(modelName);
        if (isAvailable) {
            console.log('Model already installed:', modelName);
            event.sender.send('model-install-progress', {
                progress: 100,
                status: 'Model already installed',
                downloadedSize: 0,
                totalSize: 0
            });
            return true;
        }

        // Wyślij żądanie instalacji do Ollama z obsługą streamu
        const baseUrl = ollamaManager.getBaseUrl();
        console.log('Sending pull request to:', baseUrl);

        const response = await fetch(`${baseUrl}/api/pull`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: modelName,
                stream: true
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to install model: ${response.status} ${response.statusText}`);
        }

        console.log('Pull request successful, starting download...');

        // Czytaj stream odpowiedzi
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let downloadedSize = 0;
        let totalSize = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                console.log('Download completed');
                event.sender.send('model-install-complete', {
                    message: 'Model installed successfully'
                });
                break;
            }

            // Dekoduj chunk i podziel na linie
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim());

            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    console.log('Progress data:', data);
                    
                    // Aktualizuj postęp
                    if (data.total) {
                        totalSize = data.total;
                    }
                    if (data.completed) {
                        downloadedSize = data.completed;
                    }

                    // Wyślij aktualizację postępu do interfejsu
                    if (totalSize > 0) {
                        const progress = Math.round((downloadedSize / totalSize) * 100);
                        event.sender.send('model-install-progress', {
                            modelName,
                            progress,
                            status: data.status,
                            downloadedSize,
                            totalSize,
                            digest: data.digest
                        });
                        console.log('Sent progress update:', progress);
                    }
                } catch (error) {
                    console.error('Error parsing progress data:', error);
                }
            }
        }

        return true;

    } catch (error) {
        console.error('Error installing model:', error);
        event.sender.send('model-install-error', {
            modelName,
            message: error.message
        });
        return false;
    }
});

// Dodaj handler do sprawdzania dostępności modelu
ipcMain.handle('check-model-availability', async (event, modelName) => {
    try {
        return await ollamaManager.checkModelAvailability(modelName);
    } catch (error) {
        console.error('Error checking model availability:', error);
        throw error;
    }
});

// Dodaj handler do pobierania listy zainstalowanych modeli
ipcMain.handle('get-installed-models', async () => {
    try {
        return await ollamaManager.getInstalledModels();
    } catch (error) {
        console.error('Error getting installed models:', error);
        throw error;
    }
});

// Dodaj nowy handler IPC
ipcMain.on('open-credits', () => {
    creditsWindow.create();
});

// Dodaj nowe handlery IPC
ipcMain.on('minimize-window', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.minimize();
});

ipcMain.on('maximize-window', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
        if (win.isMaximized()) {
            win.unmaximize();
            win.webContents.send('window-state-change', false);
        } else {
            win.maximize();
            win.webContents.send('window-state-change', true);
        }
    }
});

ipcMain.on('close-window', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.close();
}); 
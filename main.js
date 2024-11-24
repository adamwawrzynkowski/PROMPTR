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
const fsSync = require('fs');
const modelImportWindow = require('./model-import-window');
const sharp = require('sharp');
const { PythonShell } = require('python-shell');
const ort = require('onnxruntime-node');
const { spawn } = require('child_process');
const https = require('https');
const dependenciesWindow = require('./dependencies-window');
const creditsWindow = require('./credits-window');
const powerSaveBlocker = require('electron').powerSaveBlocker;
const fetch = require('node-fetch');
const fs = require('fs').promises;

// Usuń niepotrzebne importy
// const ort = require('onnxruntime-node');
// const { InferenceSession, Tensor } = ort;

// Zmień wersję aplikacji
const APP_VERSION = 'v1.0';

// Dodaj na początku pliku, gdzie są inne stałe
const DRAW_THINGS_PATH = '/Applications/Draw Things.app';
const DRAW_THINGS_PORT = 3333;
const SAFETENSORS_MODELS_PATH = path.join(app.getPath('userData'), 'models');
const CUSTOM_MODELS_PATH = path.join(app.getPath('userData'), 'custom-models');

// Dodaj na początku pliku, gdzie są inne stałe
const STYLE_ICONS = {
    // Style artystyczne
    'Artistic': 'fa-palette',
    'Abstract': 'fa-shapes',
    'Digital Art': 'fa-microchip',
    'Painting': 'fa-paint-brush',
    'Sketch': 'fa-pencil-alt',
    'Watercolor': 'fa-tint',
    'Oil Painting': 'fa-fill-drip',
    
    // Style realistyczne
    'Realistic': 'fa-camera',
    'Photography': 'fa-camera-retro',
    'Portrait': 'fa-user-circle',
    'Landscape': 'fa-mountain',
    'Nature': 'fa-leaf',
    'Wildlife': 'fa-paw',
    
    // Style fantastyczne
    'Fantasy': 'fa-dragon',
    'Sci-Fi': 'fa-robot',
    'Horror': 'fa-ghost',
    'Mythological': 'fa-hat-wizard',
    'Magical': 'fa-wand-sparkles',
    'Steampunk': 'fa-gears',
    
    // Style architektoniczne
    'Architecture': 'fa-building',
    'Interior': 'fa-couch',
    'Urban': 'fa-city',
    'Industrial': 'fa-industry',
    'Modern': 'fa-building-columns',
    
    // Style postaci
    'Character': 'fa-user-astronaut',
    'Anime': 'fa-star',
    'Cartoon': 'fa-child',
    'Superhero': 'fa-mask',
    'Warrior': 'fa-shield-halved',
    
    // Style koncepcyjne
    'Concept Art': 'fa-lightbulb',
    'Product': 'fa-box',
    'Vehicle': 'fa-car',
    'Weapon': 'fa-sword',
    'Prop': 'fa-cube',
    
    // Style atmosferyczne
    'Dark': 'fa-moon',
    'Light': 'fa-sun',
    'Atmospheric': 'fa-cloud',
    'Dramatic': 'fa-bolt',
    'Peaceful': 'fa-dove',
    
    // Style teksturowe
    'Metallic': 'fa-layer-group',
    'Glass': 'fa-glasses',
    'Fabric': 'fa-scissors',
    'Stone': 'fa-gem',
    'Wood': 'fa-tree',
    
    // Style specjalne
    'Custom': 'fa-magic',
    'Experimental': 'fa-flask',
    'Mixed Media': 'fa-layer-group',
    'Minimalist': 'fa-minus',
    'Maximalist': 'fa-plus',
    
    // Style techniczne
    'Technical': 'fa-ruler-combined',
    'Blueprint': 'fa-drafting-compass',
    'Diagram': 'fa-sitemap',
    'Schematic': 'fa-microchip',
    
    // Style animowane
    'Animation': 'fa-film',
    'Motion': 'fa-wind',
    'Dynamic': 'fa-bolt',
    'Kinetic': 'fa-arrows-spin',
    
    // Domyślna ikona
    'default': 'fa-brush'
};

let mainWindow;
let connectionCheckInterval;
let configWindowInstance = null;

// Dodaj na początku pliku zmienną do śledzenia aktualnego żądania
let currentGenerationRequest = null;

// Dodaj na początku pliku
let powerSaveId = null;

// Define the modelImportWindowInstance variable at the top of the file
let modelImportWindowInstance = null;

// Dodaj na początku pliku
let lastGC = Date.now();

// Dodaj na początku pliku
let isLowPowerMode = false;

// Zmodyfikuj stałe zasobów na początku pliku
const RESOURCE_LIMITS = {
    maxMemoryUsage: 128 * 1024 * 1024, // Zmniejsz do 128MB
    maxCPUUsage: 30, // Zmniejsz do 30%
    throttleInterval: 2000, // Zwiększ do 2s
    gcInterval: 120000, // Zwiększ do 2 minut
    lowPowerThreshold: 45, // Obniż próg do 45 stopni
    startupDelay: 1000, // Dodaj opóźnienie przy starcie
    checkInterval: 10000 // Sprawdzaj co 10s
};

// Dodaj monitorowanie zasobów
let resourceMonitorInterval;

// Dodaj cache dla często używanych operacji
const operationsCache = new Map();
let isStartupComplete = false;

// Dodaj funkcję do monitorowania temperatury
async function checkTemperature() {
    try {
        const { stdout } = await exec('pmset -g therm');
        const temp = parseInt(stdout.match(/CPU_Scheduler_Limit=(\d+)/)?.[1] || '0');
        return temp;
    } catch (error) {
        console.error('Error checking temperature:', error);
        return 0;
    }
}

// Zaktualizuj funkcję startResourceMonitoring
function startResourceMonitoring() {
    if (resourceMonitorInterval) {
        clearInterval(resourceMonitorInterval);
    }

    resourceMonitorInterval = setInterval(async () => {
        if (!isStartupComplete) return; // Pomijaj sprawdzanie podczas startu

        const temp = await checkTemperature();
        const wasInLowPowerMode = isLowPowerMode;
        isLowPowerMode = temp > RESOURCE_LIMITS.lowPowerThreshold;

        if (wasInLowPowerMode !== isLowPowerMode) {
            if (isLowPowerMode) {
                enableLowPowerMode();
            } else {
                disableLowPowerMode();
            }
        }

        // Sprawdzaj zasoby tylko gdy aplikacja jest aktywna
        if (mainWindow && !mainWindow.isMinimized()) {
            checkResources();
        }

    }, RESOURCE_LIMITS.checkInterval);
}

// Wydziel sprawdzanie zasobów do osobnej funkcji
async function checkResources() {
    const memoryUsage = process.memoryUsage().heapUsed;
    
    if (memoryUsage > RESOURCE_LIMITS.maxMemoryUsage) {
        await cleanupResources();
    }

    const startUsage = process.cpuUsage();
    setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const cpuPercent = (endUsage.user + endUsage.system) / 1000000;
        
        if (cpuPercent > RESOURCE_LIMITS.maxCPUUsage) {
            throttleAllOperations();
        }
    }, 100);
}

// Dodaj funkcję czyszczenia zasobów
async function cleanupResources() {
    // Wymuś garbage collection
    if (global.gc) {
        global.gc();
    }
    
    // Wyczyść cache
    operationsCache.clear();
    imageProcessingCache.clear();
    
    // Zwolnij nieużywane zasoby
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('cleanup-resources');
    }
}

// Zmodyfikuj funkcję enableLowPowerMode
function enableLowPowerMode() {
    console.log('Enabling low power mode');
    
    BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
            window.webContents.setFrameRate(30);
            window.webContents.setBackgroundThrottling(true);
            
            // Wyłącz animacje i efekty
            window.webContents.executeJavaScript(`
                document.body.classList.add('low-power-mode');
                document.body.style.setProperty('--animation-duration', '0.3s');
                document.body.style.setProperty('--transition-duration', '0.3s');
            `);
        }
    });
}

// Zmodyfikuj funkcję disableLowPowerMode
function disableLowPowerMode() {
    console.log('Disabling low power mode');
    
    BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
            window.webContents.setFrameRate(60);
            
            // Przywróć animacje i efekty
            window.webContents.executeJavaScript(`
                document.body.classList.remove('low-power-mode');
                document.body.style.setProperty('--animation-duration', '0.2s');
                document.body.style.setProperty('--transition-duration', '0.2s');
            `);
        }
    });
}

// Dodaj nasłuchiwanie na zdarzenia systemu
app.on('browser-window-blur', () => {
    enableLowPowerMode();
});

app.on('browser-window-focus', () => {
    if (!isLowPowerMode) {
        disableLowPowerMode();
    }
});

// Dodaj funkcję do throttlowania zadań
function throttle(task) {
    const now = Date.now();
    if (now - lastThrottleTime >= RESOURCE_LIMITS.throttleInterval) {
        lastThrottleTime = now;
        task();
        throttledTasks.clear();
    } else if (!throttledTasks.has(task)) {
        throttledTasks.add(task);
        setTimeout(() => {
            if (throttledTasks.has(task)) {
                task();
                throttledTasks.delete(task);
            }
        }, RESOURCE_LIMITS.throttleInterval);
    }
}

// Dodaj wywołanie GC przy zamykaniu okien
app.on('window-all-closed', () => {
    forceGC();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

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
    
    // Use port from parameter or settings
    if (!port) {
        const settings = settingsManager.getSettings();
        port = settings.drawThingsIntegration?.port || 3333;
    }
    
    try {
        // First check if Draw Things process is running
        const isRunning = await new Promise((resolve) => {
            exec('pgrep -f "Draw Things"', (error, stdout) => {
                resolve(!error && stdout.trim().length > 0);
            });
        });

        if (!isRunning) {
            console.log('Draw Things process is not running');
            return false;
        }

        console.log('Draw Things process found, checking port...');

        // Check if port is in use
        const portInUse = await new Promise((resolve) => {
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

        return portInUse;

    } catch (error) {
        console.error('Error checking Draw Things status:', error);
        return false;
    }
}

// Zoptymalizuj funkcję findOllamaPort
async function findOllamaPort() {
    console.log('Finding Ollama port...');
    const defaultPort = 11434;
    try {
        const isAvailable = await checkPort(defaultPort);
        if (isAvailable) {
            return { host: '127.0.0.1', port: defaultPort };
        }
    } catch (error) {
        console.error('Error checking default port:', error);
    }
    return null;
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

// Zoptymalizuj funkcję sprawdzania zależności
async function checkDependencies() {
    console.log('Checking dependencies...');
    const dependencies = {
        ollama: false
    };

    // Sprawdź tylko Ollama
    const ollamaCheck = await new Promise(resolve => {
        exec('pgrep ollama', (error, stdout) => {
            resolve(!error && stdout.trim());
        });
    });

    dependencies.ollama = ollamaCheck;
    return dependencies;
}

// Move this line to the very top of the file, before any app.whenReady() calls
app.disableHardwareAcceleration();

// Dodaj na początku pliku nowe stałe
const PERFORMANCE_CONFIG = {
    maxRenderers: 1,          // Ogranicz liczbę rendererów
    frameRate: 30,           // Zmniejsz FPS
    gcInterval: 30000,       // GC co 30 sekund
    batchSize: 5,            // Wielkość paczki dla operacji wsadowych
    idleTimeout: 1000,       // Czas bezczynności przed throttlingiem
    throttleTimeout: 100     // Opóźnienie throttlingu
};

// Dodaj śledzenie rendererów
const activeRenderers = new Set();

// Funkcja do tworzenia okna z odpowiednimi ustawieniami
function createWindowWithAcceleration(options) {
    // Sprawdź limit rendererów
    if (activeRenderers.size >= PERFORMANCE_CONFIG.maxRenderers) {
        const oldestRenderer = Array.from(activeRenderers)[0];
        if (oldestRenderer && !oldestRenderer.isDestroyed()) {
            oldestRenderer.destroy();
            activeRenderers.delete(oldestRenderer);
        }
    }

    const window = new BrowserWindow({
        ...options,
        webPreferences: {
            ...options.webPreferences,
            backgroundThrottling: true,
            enablePreferredSizeMode: true,
            // Wyłącz zbędne funkcje
            webgl: false,
            offscreen: false,
            paintWhenInitiallyHidden: false,
            spellcheck: false,
            // Optymalizacje dla Apple Silicon
            defaultEncoding: 'utf8',
            v8CacheOptions: 'code',
            // Wyłącz akcelerację sprzętową
            disableHardwareAcceleration: true,
            // Wyłącz animacje
            enablePreferredSizeMode: true
        },
        show: false,
        backgroundColor: '#000000',
        // Wyłącz przezroczystość
        transparent: false,
        // Wyłącz efekty wizualne
        vibrancy: null,
        visualEffectState: null,
    });

    // Dodaj renderer do śledzenia
    activeRenderers.add(window);

    // Ustaw niski FPS
    window.webContents.setFrameRate(PERFORMANCE_CONFIG.frameRate);

    return window;
}

// Dodaj nową funkcję do zarządzania rendererami
function optimizeRenderers() {
    activeRenderers.forEach(renderer => {
        if (!renderer.isDestroyed()) {
            renderer.webContents.setFrameRate(PERFORMANCE_CONFIG.frameRate);
            renderer.webContents.setBackgroundThrottling(true);
            
            // Wyłącz zbędne procesy
            renderer.webContents.executeJavaScript(`
                // Wyłącz wszystkie animacje
                document.body.style.setProperty('--animation-duration', '0s');
                document.body.style.setProperty('--transition-duration', '0s');
                
                // Zatrzymaj wszystkie animacje
                document.getAnimations().forEach(animation => animation.pause());
                
                // Wyłącz efekty hover
                document.body.classList.add('no-hover');
                
                // Optymalizuj renderowanie
                document.body.style.willChange = 'auto';
                document.body.style.backfaceVisibility = 'hidden';
                
                // Wyłącz smooth scrolling
                document.documentElement.style.scrollBehavior = 'auto';
                
                // Wyłącz animacje CSS
                document.body.classList.add('no-animations');
            `);
        }
    });
}

// Dodaj funkcję checkOllamaConnection
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

// Dodaj funkcję do optymalizacji wydajności okna
function optimizeWindowPerformance(window) {
    if (!window || window.isDestroyed()) return;

    window.webContents.setFrameRate(PERFORMANCE_CONFIG.frameRate);
    window.webContents.setBackgroundThrottling(true);
    
    window.webContents.executeJavaScript(`
        // Wyłącz wszystkie animacje
        document.body.classList.add('no-animations');
        document.body.classList.add('reduced-motion');
        
        // Optymalizuj renderowanie
        document.body.style.willChange = 'auto';
        document.body.style.backfaceVisibility = 'hidden';
        document.body.style.transform = 'translateZ(0)';
        
        // Wyłącz smooth scrolling
        CSS.supports('scroll-behavior', 'smooth') && 
            document.documentElement.style.setProperty('scroll-behavior', 'auto', 'important');
        
        // Optymalizuj obrazy
        document.querySelectorAll('img').forEach(img => {
            img.loading = 'lazy';
            img.decoding = 'async';
        });
    `);
}

// Dodaj stałe dla domyślnych modeli
const DEFAULT_TEXT_MODEL = 'llama3.2:latest';
const DEFAULT_VISION_MODEL = 'llava:7b';

// Usuń obie funkcje sendStartupProgress i sendStartupProgressWithDelay
// i zastąp je jedną nową funkcją
async function sendStatus(startup, data) {
    if (!startup || startup.isDestroyed()) return;
    
    console.log('Sending status:', data);
    startup.webContents.send('startup-progress', data);
    // Poczekaj na zakończenie frame
    await new Promise(resolve => setTimeout(resolve, 100));
}

// Zaktualizuj funkcję setupDefaultModels
async function setupDefaultModels(startup) {
    try {
        await sendStatus(startup, {
            step: 2,
            status: 'Checking Ollama connection...',
            progress: 20
        });

        const status = await checkOllamaConnection();
        if (!status.isConnected) {
            throw new Error('Could not connect to Ollama');
        }

        await sendStatus(startup, {
            step: 3,
            status: 'Checking installed models...',
            progress: 30
        });

        const installedModels = await ollamaManager.getInstalledModels();
        console.log('Installed models:', installedModels);
        
        const settings = settingsManager.getSettings();
        const needsDefaultSetup = !settings.currentModel || !settings.visionModel;

        // Sprawdź model tekstowy
        if (!installedModels.includes(DEFAULT_TEXT_MODEL)) {
            await sendStatus(startup, {
                step: 4,
                status: `Installing ${DEFAULT_TEXT_MODEL}...`,
                progress: 40
            });
            
            await ollamaManager.pullModel(DEFAULT_TEXT_MODEL, async (progress) => {
                await sendStatus(startup, {
                    step: 4,
                    status: `Installing ${DEFAULT_TEXT_MODEL}: ${Math.round(progress)}%`,
                    progress: 40 + (progress * 0.3)
                });
            });
        }

        // Sprawdź model wizyjny
        if (!installedModels.includes(DEFAULT_VISION_MODEL)) {
            await sendStatus(startup, {
                step: 5,
                status: `Installing ${DEFAULT_VISION_MODEL}...`,
                progress: 70
            });
            
            await ollamaManager.pullModel(DEFAULT_VISION_MODEL, async (progress) => {
                await sendStatus(startup, {
                    step: 5,
                    status: `Installing ${DEFAULT_VISION_MODEL}: ${Math.round(progress)}%`,
                    progress: 70 + (progress * 0.2)
                });
            });
        }

        // Konfiguracja końcowa
        if (needsDefaultSetup) {
            await sendStatus(startup, {
                step: 6,
                status: 'Configuring default settings...',
                progress: 90
            });

            await ollamaManager.setModel(DEFAULT_TEXT_MODEL);
            await ollamaManager.setVisionModel(DEFAULT_VISION_MODEL);

            settingsManager.updateSettings({
                ...settings,
                currentModel: DEFAULT_TEXT_MODEL,
                visionModel: DEFAULT_VISION_MODEL,
                initialSetupComplete: true
            });
        }

        await sendStatus(startup, {
            step: 7,
            status: 'Setup complete',
            progress: 100
        });

        return true;
    } catch (error) {
        console.error('Error in setupDefaultModels:', error);
        if (startup && !startup.isDestroyed()) {
            startup.webContents.send('startup-error', error.message);
        }
        throw error;
    }
}

// Zmodyfikuj funkcję createWindow aby opóźnić heavy operacje
async function createWindow() {
    console.log('Creating main window...');
    const startup = startupWindow.create();
    
    if (!startup) {
        console.error('Failed to create startup window');
        return;
    }

    try {
        // Włącz tryb oszczędzania energii od początku
        enableLowPowerMode();

        // Poczekaj na załadowanie okna startowego
        await new Promise((resolve) => {
            startup.once('ready-to-show', () => {
                startup.webContents.send('app-version', APP_VERSION);
                resolve();
            });
        });

        // Wyślij początkowy status
        await sendStatus(startup, {
            step: 0,
            status: 'Starting PROMPTR...',
            progress: 5
        });

        // Sprawdź Ollama
        await sendStatus(startup, {
            step: 1,
            status: 'Checking dependencies...',
            progress: 10
        });

        const dependencies = await checkDependencies();
        console.log('Dependencies check result:', dependencies);
        
        if (!dependencies.ollama) {
            console.log('Ollama not found:', dependencies);
            if (!startup.isDestroyed()) {
                startup.close();
            }
            
            const depWindow = dependenciesWindow.create();
            if (depWindow) {
                depWindow.webContents.on('did-finish-load', () => {
                    depWindow.webContents.send('dependencies-status', dependencies);
                });
            }
            return;
        }

        // Kontynuuj z konfiguracją modeli
        await setupDefaultModels(startup);

        // Inicjalizuj główne okno
        await initializeMainWindow(startup);

    } catch (error) {
        console.error('Error during startup:', error);
        if (startup && !startup.isDestroyed()) {
            startup.webContents.send('startup-error', error.message);
        }
    }
}

// Wydziel inicjalizację głównego okna do osobnej funkcji
async function initializeMainWindow(startup) {
    try {
        mainWindow = createWindowWithAcceleration({
            width: 1200,
            height: 800,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: true,
                backgroundThrottling: true
            },
            frame: false,
            show: false
        });

        // Wyłącz zbędne procesy przed załadowaniem
        mainWindow.webContents.once('dom-ready', () => {
            mainWindow.webContents.executeJavaScript(`
                // Wyłącz animacje
                document.body.classList.add('no-animations');
                // Wyłącz efekty
                document.body.classList.add('reduced-motion');
            `);
        });

        // Załaduj główne okno
        await mainWindow.loadFile('index.html');

        // Zastosuj optymalizacje
        optimizeWindowPerformance(mainWindow);
        optimizeRenderers();

        // Pokaż okno
        mainWindow.show();

        if (startup && !startup.isDestroyed()) {
            startup.close();
        }

        // Rozpocznij monitorowanie
        startResourceMonitoring();
        setupPerformanceMonitoring();

    } catch (error) {
        console.error('Error in initializeMainWindow:', error);
        throw error;
    }
}

// Dodaj nową funkcję monitorowania wydajności
function setupPerformanceMonitoring() {
    let lastActivity = Date.now();
    let isThrottled = false;

    // Monitoruj aktywność
    mainWindow.webContents.on('input', () => {
        lastActivity = Date.now();
        if (isThrottled) {
            isThrottled = false;
            mainWindow.webContents.setFrameRate(PERFORMANCE_CONFIG.frameRate);
        }
    });

    // Okresowo sprawdzaj bezczynność
    setInterval(() => {
        const now = Date.now();
        if (!isThrottled && (now - lastActivity) > PERFORMANCE_CONFIG.idleTimeout) {
            isThrottled = true;
            mainWindow.webContents.setFrameRate(10);
            forceGC();
        }
    }, PERFORMANCE_CONFIG.throttleTimeout);

    // Okresowo wymuszaj GC
    setInterval(() => {
        forceGC();
    }, PERFORMANCE_CONFIG.gcInterval);
}

// Dodaj nową funkcję do konfiguracji nasłuchiwania zdarzeń
function setupWindowEventListeners() {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    // Optymalizuj przy zmianie rozmiaru
    mainWindow.on('resize', throttle(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            optimizeWindowPerformance(mainWindow);
        }
    }));

    // Optymalizuj przy przywracaniu
    mainWindow.on('restore', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            optimizeWindowPerformance(mainWindow);
        }
    });

    // Zatrzymaj niepotrzebne operacje przy minimalizacji
    mainWindow.on('minimize', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.setFrameRate(10);
        }
    });

    // Przywróć normalne działanie przy maksymalizacji
    mainWindow.on('maximize', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.setFrameRate(isLowPowerMode ? 30 : 60);
        }
    });
}

// Event handlers
ipcMain.on('refresh-connection', async () => {
    console.log('Refreshing connection...');
    const status = await checkOllamaConnection();
    configWindow.window.webContents.send('connection-status', ollamaManager.getStatus());
});

ipcMain.on('save-config', async (event, config) => {
    console.log('Saving config:', config);
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
    console.log('Opening config window...');
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
    if (mainWindow) {
        // Optymalizuj animację przed przełączeniem
        mainWindow.webContents.executeJavaScript(`
            requestAnimationFrame(() => {
                document.querySelector('.history-panel')?.classList.toggle('visible');
                document.querySelector('.main-content')?.classList.toggle('shifted');
            });
        `);
    }
});

// Zaktualizuj handler generate-tags
ipcMain.handle('generate-tags', async (event, text) => {
    console.log('Handling generate-tags for text:', text);
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

        // Sprawdź ustawienia tumaczenia i przetłumacz jeśli potrzeba
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
    if (!mainWindow?.isVisible() || mainWindow.isMinimized()) {
        return;
    }

    // Użyj throttle dla aktualizacji UI
    const updateUI = (data) => {
        throttle(() => {
            event.sender.send('translation-status', data);
        });
    };

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

        // Sprawdź ustawienia tumaczenia i przetłumacz jeśli potrzeba
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
                    
                    updateUI(serializedTranslation);
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

ipcMain.handle('get-styles', async () => {
    try {
        const styles = await stylesManager.getStyles();
        return styles;
    } catch (error) {
        console.error('Error getting styles:', error);
        return {};
    }
});

ipcMain.handle('get-style', async (event, id) => {
    try {
        const style = await stylesManager.getStyle(id);
        if (!style) return null;
        
        return {
            ...style,
            name: String(style.name),
            description: String(style.description),
            icon: String(style.icon),
            fixedTags: Array.isArray(style.fixedTags) ? style.fixedTags.map(String) : []
        };
    } catch (error) {
        console.error('Error getting style:', error);
        return null;
    }
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
    if (stylesWindowInstance) {
        stylesWindowInstance.on('closed', () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('refresh-styles');
            }
        });
    }
});

ipcMain.handle('get-available-styles', () => {
    // Zmiana z getAllStyles() na getStyles()
    return stylesManager.getStyles();
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
    handleModalBackground(true);
    const settingsWindowInstance = settingsWindow.create();
    settingsWindowInstance.on('closed', () => {
        handleModalBackground(false);
    });
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
        const buffer = Buffer.from(imageData.split(',')[1], 'base64');
        
        // Użyj cache dla przetworzonych obrazów
        const cacheKey = buffer.toString('base64').slice(0, 50); // Użyj pierwszych 50 znaków jako klucz
        const cachedResult = imageProcessingCache.get(cacheKey);
        
        if (cachedResult) {
            return cachedResult;
        }

        const processedImage = await sharp(buffer)
            .resize(224, 224, {
                fastShrinkOnLoad: true,
                kernel: 'nearest',
                withoutEnlargement: true,
                fastMode: true
            })
            .normalise()
            .toBuffer({ resolveWithObject: true });

        const result = {
            data: new Float32Array(processedImage.data.buffer),
            width: processedImage.info.width,
            height: processedImage.info.height,
            channels: 3
        };

        imageProcessingCache.set(cacheKey, result);
        return result;
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
        // Zamiast sprawdzać poączenie ponownie, użyj aktualnego statusu
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
        
        // Zdefiniuj kategorie modeli
        const modelCategories = {
            SFW: [
                // Llama models
                'llama2:7b', 'llama2:13b', 'llama2:70b',
                'llama3:8b', 'llama3:70b',
                'llama3.1:8b', 'llama3.1:70b', 'llama3.1:405b',
                'llama3.2:1b', 'llama3.2:3b',
                
                // Gemma models
                'gemma:2b', 'gemma:7b',
                'gemma2:2b', 'gemma2:9b', 'gemma2:27b',
                
                // Mistral models
                'mistral:7b', 'mistral:8x7b',
                'mistral:latest',
                'mixtral:7b', 'mixtral:8x7b',
                'mistral-next:7b', 'mistral-next:8x7b',
                'mistral-medium:7b', 'mistral-small:7b',
                'mistral-tiny:7b',
                
                // Phi models
                'phi3:3.8b', 'phi3:14b',
                
                // Qwen models
                'qwen:0.5b', 'qwen:1.8b', 'qwen:4b', 'qwen:7b', 'qwen:14b', 'qwen:32b',
                
                // Qwen2 models
                'qwen2:0.5b', 'qwen2:1.5b', 'qwen2:7b', 'qwen2:72b',
                
                // Qwen2.5 models
                'qwen2.5:0.5b', 'qwen2.5:1.5b', 'qwen2.5:3b', 'qwen2.5:7b', 'qwen2.5:14b', 'qwen2.5:32b'
            ],
            NSFW: [
                // Dolphin-Mixtral model
                'dolphin-mixtral:8x7b',
                
                // Llama Uncensored models
                'llama2-uncensored:7b', 'llama2-uncensored:70b',
                
                // Dolphin-Llama models
                'dolphin-llama3:8b', 'dolphin-llama3:70b',
                
                // Dolphin-Mistral model
                'dolphin-mistral:7b'
            ],
            Vision: [
                // Llava models
                'llava:7b', 'llava:13b', 'llava:34b',
                
                // Llava-Llama model
                'llava-llama3:8b',
                
                // Llama Vision models
                'llama3.2-vision:11b', 'llama3.2-vision:90b',
                
                // Bakllava models
                'bakllava:7b', 'bakllava:latest'
            ],
            'Other Models': [
                // Aya models
                'aya:8b', 'aya:35b',
                
                // WizardLM models
                'wizardlm2:7b', 'wizardlm2:8x22b',
                
                // Vicuna models
                'vicuna:7b', 'vicuna:13b', 'vicuna:33b',
                
                // Yi models
                'yi:6b', 'yi:9b', 'yi:34b'
            ]
        };

        // Lista wykluczających się prefiksów dla modeli NSFW
        const nsfwPrefixes = ['dolphin-', 'uncensored'];

        // Pobierz zainstalowane modele
        const installedModels = await ollamaManager.getInstalledModels();
        console.log('Installed models:', installedModels);

        // Set do śledzenia już skategoryzowanych modeli
        const categorizedModelIds = new Set();

        // Przygotuj kategoryzowane modele
        const categorizedModels = {};
        
        // Inicjalizuj każdą kategorię
        Object.keys(modelCategories).forEach(category => {
            categorizedModels[category] = [];
        });

        // Jeśli mamy listę zainstalowanych modeli
        if (Array.isArray(installedModels)) {
            // Kategoryzuj modele
            installedModels.forEach(model => {
                // Pomijamy jeśli model został już skategoryzowany
                if (categorizedModelIds.has(model.toLowerCase())) {
                    return;
                }

                const modelName = model.toLowerCase();
                let categorized = false;

                // Najpierw sprawdź czy to model NSFW
                if (nsfwPrefixes.some(prefix => modelName.startsWith(prefix))) {
                    categorizedModels['NSFW'].push({
                        id: model,
                        name: model,
                        installed: true,
                        category: 'NSFW'
                    });
                    categorizedModelIds.add(modelName);
                    categorized = true;
                } else {
                    // Jeśli nie NSFW, sprawdź pozostałe kategorie
                    Object.entries(modelCategories).forEach(([category, modelList]) => {
                        if (!categorized && category !== 'NSFW' && 
                            modelList.some(m => modelName === m.toLowerCase())) {
                            categorizedModels[category].push({
                                id: model,
                                name: model,
                                installed: true,
                                category: category
                            });
                            categorizedModelIds.add(modelName);
                            categorized = true;
                        }
                    });
                }

                // Jeśli model nie pasuje do żadnej kategorii, dodaj do Other Models
                if (!categorized) {
                    categorizedModels['Other Models'].push({
                        id: model,
                        name: model,
                        installed: true,
                        category: 'Other Models'
                    });
                    categorizedModelIds.add(modelName);
                }
            });
        }

        // Dodaj dostępne ale niezainstalowane modele
        Object.entries(modelCategories).forEach(([category, modelList]) => {
            modelList.forEach(modelName => {
                const modelNameLower = modelName.toLowerCase();
                // Sprawdź czy model nie został już dodany
                if (!categorizedModelIds.has(modelNameLower)) {
                    categorizedModels[category].push({
                        id: modelName,
                        name: modelName,
                        installed: false,
                        category: category
                    });
                    categorizedModelIds.add(modelNameLower);
                }
            });
        });

        console.log('Categorized models:', categorizedModels);
        return categorizedModels;
    } catch (error) {
        console.error('Error getting available models:', error);
        return {
            SFW: [],
            NSFW: [],
            Vision: [],
            'Other Models': []
        };
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
            const existingStyles = await stylesManager.getStyles(); // Zmiana tutaj
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
    if (!modelImportWindowInstance) {
        modelImportWindowInstance = modelImportWindow.create();
        modelImportWindowInstance.on('closed', () => {
            modelImportWindowInstance = null;
        });
    }
});

// Dodaj handler dla rozpoczęcia importu modelu
ipcMain.on('start-model-import', async (event, modelUrl) => {
    const sender = event.sender;
    try {
        // Wyczyść i sparsuj URL
        const cleanUrl = modelUrl.trim()
            .replace('https://huggingface.co/', '')
            .replace('/tree/main', '')
            .replace(/^\/+|\/+$/g, '');
            
        const urlParts = cleanUrl.split('/');
        const owner = urlParts[0];
        const repo = urlParts[1];

        if (!owner || !repo) {
            throw new Error('Invalid model URL format');
        }

        console.log('Importing model from:', { owner, repo });

        // Utwórz katalog docelowy
        const targetDir = path.join(app.getPath('userData'), 'PROMPTR', 'custom-models', `${owner}_${repo}`);
        await fs.mkdir(targetDir, { recursive: true });

        sender.send('import-status', {
            step: 'initialize',
            message: 'Preparing to download model files...',
            isActive: true
        });

        await downloadRepositoryContents(owner, repo, '', targetDir, sender);

        sender.send('import-status', {
            step: 'complete',
            message: 'Model import completed successfully',
            isActive: false
        });

    } catch (error) {
        console.error('Error in model import:', error);
        sender.send('import-error', {
            message: error.message,
            details: error.stack
        });
    }
});

// Update the app.whenReady() calls to be in one place
app.whenReady().then(async () => {
    try {
        // First check dependencies
        await checkAndInstallPythonDependencies();
        
        // Then create window
        await createWindow();
        
        // Add window state change listeners
        if (mainWindow) {
            mainWindow.on('maximize', () => {
                mainWindow.webContents.send('window-state-change', true);
            });

            mainWindow.on('unmaximize', () => {
                mainWindow.webContents.send('window-state-change', false);
            });
        }
    } catch (error) {
        console.error('Error during app initialization:', error);
        // Still create window even if dependency check fails
        createWindow();
    }
});

app.on('window-all-closed', () => {
    console.log('All windows closed');
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
    }
    if (powerSaveId !== null) {
        powerSaveBlocker.stop(powerSaveId);
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    console.log('App activated');
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

async function downloadHuggingFaceFiles(repoId, targetDir, progressCallback) {
    try {
        // Usuń przedrostek URL i wyczyś ścieżkę
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
        if (!fsSync.existsSync(targetDir)) {
            fsSync.mkdirSync(targetDir, { recursive: true });
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
    console.log(`Starting download for file: ${filePath}`);
    const fileUrl = `https://huggingface.co/${repoId}/resolve/main/${filePath}`;
    console.log(`Downloading: ${filePath}`);
    console.log(`From: ${fileUrl}`);
    console.log(`To: ${targetPath}`);

    const response = await fetch(fileUrl);
    if (!response.ok) {
        throw new Error(`Failed to download ${filePath}: ${response.status} ${response.statusText}`);
    }

    const fileStream = fsSync.createWriteStream(targetPath);
    const reader = response.body.getReader();
    const contentLength = parseInt(response.headers.get('content-length') || '0');
    let downloadedLength = 0;

    // Helper function to format size
    const formatSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    };

    return new Promise((resolve, reject) => {
        response.body.on('data', (chunk) => {
            downloadedLength += chunk.length;
            fileStream.write(chunk);

            if (contentLength > 0) {
                const progress = (downloadedLength / contentLength) * 100;
                progressCallback(progress, downloadedLength, contentLength, filePath);
            } else {
                progressCallback(0, downloadedLength, contentLength, filePath);
            }
        });

        response.body.on('end', () => {
            fileStream.end();
            console.log(`Successfully downloaded ${filePath}`);
            resolve();
        });

        response.body.on('error', (error) => {
            fileStream.destroy();
            reject(error);
        });

        fileStream.on('error', (error) => {
            reject(error);
        });
    });

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

// Dodaj na początku pliku
let modalBackgroundTimeout;

// Dodaj funkcję do zarządzania tłem podczas otwierania okien modalnych
function handleModalBackground(show) {
    if (!mainWindow) return;
    
    clearTimeout(modalBackgroundTimeout);
    
    if (show) {
        mainWindow.webContents.send('set-background-state', 'dimmed');
    } else {
        // Małe opóźnienie przy przywracaniu, aby uniknąć migotania
        modalBackgroundTimeout = setTimeout(() => {
            mainWindow.webContents.send('set-background-state', 'normal');
        }, 100);
    }
}

// Zmodyfikuj handlery otwierania okien
ipcMain.on('open-settings', () => {
    handleModalBackground(true);
    const settingsWindowInstance = settingsWindow.create();
    settingsWindowInstance.on('closed', () => {
        handleModalBackground(false);
    });
});

ipcMain.on('open-config', () => {
    handleModalBackground(true);
    configWindowInstance = configWindow.create();
    configWindowInstance.on('closed', () => {
        configWindowInstance = null;
        handleModalBackground(false);
    });
});

// Podobnie dla innych okien modalnych
ipcMain.on('open-styles', () => {
    handleModalBackground(true);
    const stylesWindowInstance = stylesWindow.create();
    stylesWindowInstance.on('closed', () => {
        handleModalBackground(false);
        mainWindow.webContents.send('refresh-styles');
    });
});

// Dodaj handler dla get-custom-models
ipcMain.handle('get-custom-models', async () => {
    try {
        const customModelsPath = path.join(app.getPath('userData'), 'PROMPTR', 'custom-models');
        if (!fsSync.existsSync(customModelsPath)) {
            await fs.mkdir(customModelsPath, { recursive: true });
            return [];
        }

        const models = await fs.readdir(customModelsPath);
        return models.map(modelName => ({
            name: modelName,
            type: 'Custom',
            path: path.join(customModelsPath, modelName)
        }));
    } catch (error) {
        console.error('Error getting custom models:', error);
        return [];
    }
});

// Dodaj nowy handler dla get-model-info
ipcMain.handle('get-model-info', async (event, modelId) => {
    try {
        // Najpierw sprawdź czy model jest zainstalowany
        const installedModels = await ollamaManager.getInstalledModels();
        const isInstalled = installedModels.includes(modelId);

        if (!isInstalled) {
            // Jeśli model nie jest zainstalowany, zwróć podstawowe informacje z nazwy
            const sizeMatch = modelId.match(/[:\-](\d+(?:\.\d+)?[bB])/);
            const size = sizeMatch ? sizeMatch[1].toUpperCase() : null;
            
            return {
                id: modelId,
                name: modelId,
                size: size,
                parameters: size,
                isInstalled: false
            };
        }

        // Jeśli model jest zainstalowany, pobierz szczegółowe informacje
        const response = await fetch(`${ollamaManager.getBaseUrl()}/api/show`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: modelId
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to get model info: ${response.status}`);
        }

        const data = await response.json();
        
        // Wyciągnij rozmiar parametrów z nazwy jeśli nie ma w danych
        const sizeMatch = modelId.match(/[:\-](\d+(?:\.\d+)?[bB])/);
        const parameterSize = sizeMatch ? sizeMatch[1].toUpperCase() : null;

        return {
            id: modelId,
            name: modelId,
            size: data.size || null,
            parameters: parameterSize || data.parameter_size || null,
            template: data.template || null,
            system: data.system || null,
            families: data.families || [],
            isInstalled: true,
            details: {
                format: data.format || null,
                families: data.families || [],
                parameter_size: parameterSize || data.parameter_size || null,
                quantization_level: data.quantization_level || null
            }
        };
    } catch (error) {
        console.error('Error getting model info:', error);
        // Spróbuj wyciągnąć rozmiar z nazwy modelu
        const sizeMatch = modelId.match(/[:\-](\d+(?:\.\d+)?[bB])/);
        return {
            id: modelId,
            name: modelId,
            size: null,
            parameters: sizeMatch ? sizeMatch[1].toUpperCase() : null,
            isInstalled: false
        };
    }
});

// Dodaj też handler dla get-model-size (jako backup)
ipcMain.handle('get-model-size', async (event, modelId) => {
    try {
        const modelInfo = await ipcMain.handle('get-model-info', event, modelId);
        return modelInfo.size;
    } catch (error) {
        console.error('Error getting model size:', error);
        return null;
    }
});

// Zaktualizuj handler install-model
ipcMain.handle('install-model', async (event, modelId) => {
    try {
        console.log('Installing model:', modelId);
        
        const response = await fetch(`${ollamaManager.getBaseUrl()}/api/pull`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: modelId,
                stream: true
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to install model: ${response.status}`);
        }

        let downloadedSize = 0;
        let totalSize = 0;

        // Użyj response.body jako strumienia
        for await (const chunk of response.body) {
            const lines = chunk.toString().split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    
                    if (data.total) {
                        totalSize = data.total;
                    }
                    
                    if (data.completed) {
                        downloadedSize = data.completed;
                    }

                    // Wyślij aktualizację postępu do okna
                    if (totalSize > 0) {
                        event.sender.send('model-install-progress', {
                            modelName: modelId,
                            downloadedSize,
                            totalSize,
                            progress: (downloadedSize / totalSize) * 100
                        });
                    }
                } catch (error) {
                    console.error('Error parsing stream data:', error);
                }
            }
        }

        // Poczekaj chwilę aby upewnić się, że model jest gotowy
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Sprawdź czy model został zainstalowany
        const installedModels = await ollamaManager.getInstalledModels();
        if (!installedModels.includes(modelId)) {
            throw new Error('Model installation failed');
        }

        // Wyślij informację o zakończeniu instalacji
        event.sender.send('model-install-complete', {
            modelName: modelId,
            success: true
        });

        return true;

    } catch (error) {
        console.error('Error installing model:', error);
        event.sender.send('model-install-error', {
            modelName: modelId,
            error: error.message
        });
        throw error;
    }
});

// Dodaj na początku pliku
function forceGC() {
    if (global.gc) {
        global.gc();
    }
}

// Dodaj handler dla zapisywania stanu stylu
ipcMain.handle('save-style-state', async (event, { styleId, active }) => {
    try {
        const styles = await stylesManager.getStyles();
        if (styles[styleId]) {
            styles[styleId].active = active;
            await stylesManager.saveStyles(styles);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error saving style state:', error);
        return false;
    }
});

// Dodaj handlery dla przycisków okna
ipcMain.on('minimize-window', () => {
    const window = BrowserWindow.getFocusedWindow();
    if (window) window.minimize();
});

ipcMain.on('maximize-window', () => {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return;
    
    if (window.isMaximized()) {
        window.unmaximize();
    } else {
        window.maximize();
    }
    
    // Powiadom renderer o zmianie stanu
    window.webContents.send('window-state-change', window.isMaximized());
});

ipcMain.on('close-window', () => {
    const window = BrowserWindow.getFocusedWindow();
    if (window) window.close();
});

// Zmodyfikuj handler dla przycisku credits
ipcMain.on('open-credits', () => {
    const existingWindow = BrowserWindow.getAllWindows().find(win => win.getTitle() === 'Credits');
    if (existingWindow) {
        existingWindow.focus();
        return;
    }

    const creditsWindowInstance = new BrowserWindow({
        width: 400,
        height: 500,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: false,
        resizable: false,
        show: false,
        parent: mainWindow,
        modal: true
    });

    creditsWindowInstance.loadFile('credits.html');
    
    creditsWindowInstance.once('ready-to-show', () => {
        creditsWindowInstance.show();
    });
});

// Dodaj obsługę błędów dla głównego procesu
process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

// Dodaj lepszą obsługę błędów dla IPC
ipcMain.on('error', (event, error) => {
    console.error('IPC error:', error);
});

// Dodaj funkcję pomocniczą do bezpiecznego wysyłania wiadomości
function safeWebContentsCall(webContents, channel, ...args) {
    if (webContents && !webContents.isDestroyed()) {
        webContents.send(channel, ...args);
    }
}

// Zaktualizuj funkcję throttleAllOperations
function throttleAllOperations() {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    // Zmniejsz częstotliwość odświeżania
    mainWindow.webContents.setFrameRate(20);
    
    // Włącz throttling tła
    mainWindow.webContents.setBackgroundThrottling(true);
    
    // Wymuś tryb oszczędzania energii
    mainWindow.webContents.executeJavaScript(`
        document.body.classList.add('low-power-mode');
        document.body.classList.add('reduced-motion');
        
        // Zatrzymaj wszystkie animacje
        document.getAnimations().forEach(animation => {
            animation.pause();
        });
        
        // Zoptymalizuj scrollowanie
        document.querySelectorAll('.scrollable').forEach(elem => {
            elem.style.scrollBehavior = 'auto';
        });
    `);
    
    // Wyczyść cache
    operationsCache.clear();
    imageProcessingCache.clear();
    
    // Wymuś GC
    if (global.gc) {
        global.gc();
    }
}

// Dodaj brakującą funkcję checkAndInstallPythonDependencies
async function checkAndInstallPythonDependencies() {
    // Prosta implementacja - możemy rozszerzyć później jeśli potrzeba
    return true;
}
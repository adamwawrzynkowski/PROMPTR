const { BrowserWindow, ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const ollamaManager = require('./ollama');
const configManager = require('./config-manager');

let window = null;

function create(mode = 'prompt') {
    if (window) {
        window.focus();
        return window;
    }

    window = new BrowserWindow({
        width: 480,
        height: 720,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: false,
        transparent: true,
        resizable: false,
        backgroundColor: '#00000000',
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: -20, y: -20 },
    });

    window.loadFile('vision.html');

    window.webContents.on('did-finish-load', async () => {
        window.webContents.send('set-mode', mode);
        
        // Pobierz zainstalowane modele
        const models = await getModels();
        console.log('Sending models to window:', models);
        window.webContents.send('update-models', models);
    });

    window.on('closed', () => {
        window = null;
    });

    return window;
}

async function getModels() {
    try {
        const models = [];
        
        // Dodaj opcję "Use Ollama"
        const status = ollamaManager.getStatus();
        if (status.isConnected && status.visionModel) {
            models.push({
                id: 'ollama',
                name: `Use Ollama (${status.visionModel})`,
                type: 'ollama'
            });
        }

        // Pobierz zainstalowane modele custom z poprawnej ścieżki
        const customModelsPath = path.join(app.getPath('userData'), 'PROMPTR', 'custom-models');
        console.log('Custom models path:', customModelsPath);

        // Sprawdź czy katalog istnieje
        try {
            await fs.access(customModelsPath);
            const folders = await fs.readdir(customModelsPath, { withFileTypes: true });
            console.log('Entries in custom-models directory:', folders);

            // Filtruj i dodaj modele custom
            for (const folder of folders) {
                // Sprawdź czy to folder i nie zaczyna się od .
                if (folder.isDirectory() && !folder.name.startsWith('.')) {
                    const folderPath = path.join(customModelsPath, folder.name);
                    try {
                        // Pobierz wszystkie pliki w folderze
                        const files = await fs.readdir(folderPath);
                        // Znajdź pierwszy plik .safetensors
                        const safetensorsFile = files.find(file => file.endsWith('.safetensors'));
                        
                        if (safetensorsFile) {
                            const modelPath = path.join(folderPath, safetensorsFile);
                            const stats = await fs.stat(modelPath);
                            if (stats.isFile() && stats.size > 0) {
                                // Użyj nazwy folderu jako nazwy modelu
                                models.push({
                                    id: folder.name,
                                    name: folder.name + ' (Custom)',
                                    type: 'custom',
                                    modelPath: modelPath // Dodaj pełną ścieżkę do pliku modelu
                                });
                                console.log(`Found model in ${folder.name}: ${safetensorsFile}`);
                            }
                        }
                    } catch (error) {
                        console.log(`Skipping invalid model in folder ${folder.name}:`, error);
                    }
                }
            }
        } catch (error) {
            console.log('Error accessing custom-models directory:', error);
            // Utwórz katalog jeśli nie istnieje
            await fs.mkdir(customModelsPath, { recursive: true });
        }

        console.log('Final list of models:', models);
        return models;
    } catch (error) {
        console.error('Error getting models:', error);
        return [];
    }
}

module.exports = {
    create
}; 
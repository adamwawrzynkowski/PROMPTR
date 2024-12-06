const electron = require('electron');
const { BrowserWindow } = electron;
const ipcMain = electron.ipcMain;
const app = electron.app;
const path = require('path');
const fs = require('fs').promises;
const { PythonShell } = require('python-shell');

let window = null;

function create() {
    if (window) {
        window.focus();
        return window;
    }

    window = new BrowserWindow({
        width: 600,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: false,
        transparent: true,
        resizable: false,
        backgroundColor: '#00000000'
    });

    window.loadFile('model-import-window.html');

    window.on('closed', () => {
        window = null;
    });

    return window;
}

// Dodaj funkcję konwersji do ONNX
async function convertToOnnx(modelDir) {
    const safetensorsPath = path.join(modelDir, 'model.safetensors');
    const onnxPath = path.join(modelDir, 'model.onnx');

    return new Promise((resolve, reject) => {
        const options = {
            mode: 'text',
            pythonPath: 'python3',
            pythonOptions: ['-u'],
            scriptPath: path.join(__dirname, 'scripts'),
            args: [safetensorsPath, onnxPath]
        };

        PythonShell.run('convert_to_onnx.py', options).then(() => {
            resolve();
        }).catch((error) => {
            reject(error);
        });
    });
}

// Separate the IPC handler setup into a function
function setupIpcHandlers() {
    ipcMain.handle('import-model', async (event, modelInfo) => {
        try {
            const modelDir = path.join(app.getPath('userData'), 'PROMPTR', 'custom-models', modelInfo.name);
            await fs.mkdir(modelDir, { recursive: true });

            // Po pobraniu wszystkich plików
            window.webContents.send('import-progress', {
                status: 'Converting model to ONNX format...',
                progress: 0.9
            });

            // Konwertuj model do ONNX
            await convertToOnnx(modelDir);

            // Usuń oryginalny plik safetensors
            await fs.unlink(path.join(modelDir, 'model.safetensors'));

            window.webContents.send('import-progress', {
                status: 'Import complete',
                progress: 1.0
            });

            return { success: true };
        } catch (error) {
            console.error('Error during model import:', error);
            throw error;
        }
    });
}

module.exports = {
    create,
    setupIpcHandlers,
    convertToOnnx
};
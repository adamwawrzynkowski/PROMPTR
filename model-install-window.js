const { BrowserWindow } = require('electron');
const path = require('path');

let window = null;

function create(modelName) {
    if (window) {
        window.focus();
        return window;
    }

    window = new BrowserWindow({
        width: 400,
        height: 200,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: false,
        resizable: false
    });

    window.loadFile('model-install.html');

    window.webContents.on('did-finish-load', () => {
        window.webContents.send('model-info', modelName);
    });

    window.on('closed', () => {
        window = null;
    });

    return window;
}

module.exports = {
    create,
    window
}; 
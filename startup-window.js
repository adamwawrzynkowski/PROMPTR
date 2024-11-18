const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function create() {
    const window = new BrowserWindow({
        width: 400,
        height: 300,
        frame: false,
        transparent: true,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    window.loadFile(path.join(__dirname, 'startup.html'));
    return window;
}

module.exports = {
    create
}; 
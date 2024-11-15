const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

class ConfigWindow {
    constructor() {
        this.window = null;
    }

    create() {
        this.window = new BrowserWindow({
            width: 600,
            height: 400,
            frame: false,
            transparent: true,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            parent: BrowserWindow.getAllWindows()[0],
            modal: true
        });

        this.window.loadFile('config.html');
        return this.window;
    }
}

module.exports = new ConfigWindow(); 
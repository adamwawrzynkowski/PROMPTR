const { BrowserWindow } = require('electron');
const path = require('path');

class SettingsWindow {
    constructor() {
        this.window = null;
    }

    create() {
        this.window = new BrowserWindow({
            width: 600,
            height: 500,
            frame: false,
            transparent: true,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            parent: BrowserWindow.getAllWindows()[0],
            modal: true
        });

        this.window.loadFile('settings.html');
        return this.window;
    }
}

module.exports = new SettingsWindow(); 
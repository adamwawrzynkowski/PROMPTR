const { BrowserWindow } = require('electron');
const path = require('path');

class StylesWindow {
    constructor() {
        this.window = null;
    }

    create() {
        this.window = new BrowserWindow({
            width: 800,
            height: 600,
            frame: false,
            transparent: true,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            parent: BrowserWindow.getAllWindows()[0],
            modal: true
        });

        this.window.loadFile('styles.html');
        return this.window;
    }
}

module.exports = new StylesWindow(); 
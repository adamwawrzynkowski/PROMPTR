const { BrowserWindow } = require('electron');
const path = require('path');

let window = null;

function create() {
    if (window) {
        window.focus();
        return window;
    }

    window = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: false,
        resizable: false,
        show: false,
        backgroundColor: '#1e1b2e'
    });

    window.loadFile('config.html');

    window.once('ready-to-show', () => {
        window.show();
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
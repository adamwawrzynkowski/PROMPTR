const { BrowserWindow } = require('electron');
const path = require('path');

let window = null;

function create() {
    if (window) {
        window.focus();
        return window;
    }

    window = new BrowserWindow({
        width: 600,
        height: 400,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: false,
        resizable: false
    });

    window.loadFile('vision.html');

    window.on('closed', () => {
        window = null;
    });

    return window;
}

module.exports = {
    create,
    window
}; 
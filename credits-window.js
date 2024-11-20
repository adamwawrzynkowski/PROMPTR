const { BrowserWindow } = require('electron');
const path = require('path');

let window = null;

function create() {
    if (window) {
        window.focus();
        return window;
    }

    window = new BrowserWindow({
        width: 400,
        height: 500,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: false,
        resizable: false,
        transparent: true,
        backgroundColor: '#00000000'
    });

    window.loadFile('credits.html');

    window.on('closed', () => {
        window = null;
    });

    return window;
}

module.exports = {
    create
}; 
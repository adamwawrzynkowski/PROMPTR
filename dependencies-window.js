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
        height: 500,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: false,
        transparent: true,
        resizable: false,
        backgroundColor: '#00000000'
    });

    window.loadFile('dependencies-window.html');

    window.on('closed', () => {
        window = null;
    });

    return window;
}

module.exports = {
    create
}; 
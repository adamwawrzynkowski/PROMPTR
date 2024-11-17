const { BrowserWindow } = require('electron');
const path = require('path');

let window = null;

function create() {
    window = new BrowserWindow({
        width: 400,
        height: 200,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: false,
        resizable: false,
        center: true,
        show: false,
        transparent: true
    });

    window.loadFile('startup.html');

    window.once('ready-to-show', () => {
        window.show();
    });

    return window;
}

module.exports = {
    create,
    window
}; 
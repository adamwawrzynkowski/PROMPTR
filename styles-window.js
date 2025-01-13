const { BrowserWindow } = require('electron');
const path = require('path');

let window = null;

function create() {
    if (window) {
        window.focus();
        return window;
    }

    window = new BrowserWindow({
        width: 500,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: false,
        resizable: false,
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: -20, y: -100 }, // Ukryj przyciski poza widokiem
        transparent: true,
        vibrancy: 'under-window',
        visualEffectState: 'active'
    });

    window.loadFile(path.join(__dirname, 'styles-window.html'));

    window.on('closed', () => {
        window = null;
    });

    return window;
}

module.exports = {
    create,
    get window() {
        return window;
    }
};
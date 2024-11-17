const { BrowserWindow } = require('electron');
const path = require('path');

function create(styleId = null) {
    const window = new BrowserWindow({
        width: 500,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: false,
        resizable: false,
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: -20, y: -100 },
        transparent: true,
        vibrancy: 'under-window',
        visualEffectState: 'active'
    });

    window.loadFile(path.join(__dirname, 'style-edit-window.html'));

    if (styleId) {
        window.webContents.on('did-finish-load', () => {
            window.webContents.send('edit-style', styleId);
        });
    }

    return window;
}

module.exports = {
    create
}; 
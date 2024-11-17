const { BrowserWindow } = require('electron');
const path = require('path');

function create(source = 'prompt') {
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
        trafficLightPosition: { x: -20, y: -100 }
    });

    window.loadFile(path.join(__dirname, 'vision-window.html'));
    
    window.webContents.on('did-finish-load', () => {
        window.webContents.send('set-source', source);
    });

    return window;
}

module.exports = {
    create
}; 
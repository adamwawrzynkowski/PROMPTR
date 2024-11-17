const { BrowserWindow } = require('electron');
const path = require('path');

function create(styleData = null) {
    const window = new BrowserWindow({
        width: 400,
        height: 500,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: false,
        resizable: false,
        backgroundColor: '#1E1B2E',
        show: false,
        modal: true,
        parent: BrowserWindow.getFocusedWindow()
    });

    window.loadFile(path.join(__dirname, 'edit-style.html'));

    window.webContents.on('did-finish-load', () => {
        if (styleData) {
            window.webContents.send('edit-style', styleData);
        }
        window.show();
        window.center();
    });

    return window;
}

module.exports = {
    create
}; 
const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function create() {
    const window = new BrowserWindow({
        width: 500,
        height: 400,
        frame: false,
        transparent: true,
        resizable: false,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    window.loadFile(path.join(__dirname, 'startup.html'));
    
    // Add fade-in effect when showing the window
    window.once('ready-to-show', () => {
        window.show();
        window.webContents.executeJavaScript(`
            document.body.style.opacity = '0';
            setTimeout(() => {
                document.body.style.opacity = '1';
            }, 100);
        `);
    });

    return window;
}

module.exports = {
    create
};
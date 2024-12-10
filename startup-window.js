const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function create() {
    const window = new BrowserWindow({
        width: 400,
        height: 600,
        frame: false,
        transparent: true,
        resizable: false,
        show: false,
        useContentSize: true, // Use content size instead of window size
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    window.loadFile(path.join(__dirname, 'startup.html'));
    
    // Add fade-in effect when showing the window
    window.once('ready-to-show', () => {
        // Force window size
        const contentSize = window.getContentSize();
        console.log('Content size:', contentSize);
        
        if (contentSize[1] < 600) {
            window.setContentSize(400, 600, true);
        }
        
        window.show();
        window.webContents.executeJavaScript(`
            document.body.style.opacity = '0';
            document.body.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                document.body.style.opacity = '1';
            }, 100);
        `);
    });

    // Listen for initialization complete
    ipcMain.on('initialization-complete', () => {
        // Add fade-out effect and close window
        window.webContents.executeJavaScript(`
            document.body.style.opacity = '0';
            setTimeout(() => {
                window.close();
            }, 500);
        `);
    });

    // Make the window draggable by adding a drag handle
    window.webContents.executeJavaScript(`
        document.addEventListener('DOMContentLoaded', () => {
            const startupScreen = document.querySelector('.startup-screen');
            if (startupScreen) {
                startupScreen.style.webkitAppRegion = 'drag';
            }
        });
    `);

    return window;
}

module.exports = {
    create
};
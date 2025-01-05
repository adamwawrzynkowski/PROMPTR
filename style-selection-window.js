const { BrowserWindow } = require('electron');
const path = require('path');

let styleSelectionWindow = null;

function createStyleSelectionWindow() {
    styleSelectionWindow = new BrowserWindow({
        width: 900,
        height: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        show: false,
        backgroundColor: '#2e2d2b'
    });

    const htmlPath = path.join(__dirname, 'style-selection-window.html');
    console.log('Loading HTML from:', htmlPath);
    styleSelectionWindow.loadFile(htmlPath);

    styleSelectionWindow.once('ready-to-show', () => {
        styleSelectionWindow.show();
    });

    return styleSelectionWindow;
}

module.exports = {
    createStyleSelectionWindow,
    get window() {
        return styleSelectionWindow;
    }
};

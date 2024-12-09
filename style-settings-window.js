const { BrowserWindow } = require('electron');
const path = require('path');

let styleSettingsWindow = null;

function createStyleSettingsWindow(mainWindow) {
    styleSettingsWindow = new BrowserWindow({
        width: 500,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        parent: mainWindow,
        modal: true,
        show: false,
        frame: false,
        resizable: false
    });

    styleSettingsWindow.loadFile('windows/style-settings.html');
    styleSettingsWindow.once('ready-to-show', () => {
        styleSettingsWindow.show();
    });

    return styleSettingsWindow;
}

function closeStyleSettingsWindow() {
    if (styleSettingsWindow) {
        styleSettingsWindow.close();
        styleSettingsWindow = null;
    }
}

module.exports = {
    createStyleSettingsWindow,
    closeStyleSettingsWindow
};

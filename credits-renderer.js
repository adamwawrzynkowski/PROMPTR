const { shell, ipcRenderer } = require('electron');

document.getElementById('close-btn').addEventListener('click', () => {
    window.close();
});

document.getElementById('coffee-link').addEventListener('click', (e) => {
    e.preventDefault();
    shell.openExternal('https://buymeacoffee.com/a_wawrzynkowski');
});

// Update version display when received
ipcRenderer.on('app-version', (event, version) => {
    const versionElement = document.getElementById('credits-version');
    if (versionElement) {
        versionElement.textContent = `Version ${version}`;
    }
});

// Request version on load
document.addEventListener('DOMContentLoaded', async () => {
    const version = await ipcRenderer.invoke('get-version');
    const versionElement = document.getElementById('credits-version');
    if (versionElement) {
        versionElement.textContent = `Version ${version}`;
    }
});
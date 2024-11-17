const { ipcRenderer } = require('electron');

let modelName = '';
const installButton = document.getElementById('install-btn');
const progressBar = document.getElementById('progress');
const progressText = document.getElementById('progress-text');
const modelNameElement = document.getElementById('model-name');

document.querySelector('.close-button').addEventListener('click', () => {
    window.close();
});

ipcRenderer.on('model-info', (event, name) => {
    modelName = name;
    modelNameElement.textContent = name;
});

installButton.addEventListener('click', async () => {
    installButton.disabled = true;
    try {
        await ipcRenderer.invoke('install-model', modelName);
        window.close();
    } catch (error) {
        progressText.textContent = `Error: ${error.message}`;
        installButton.disabled = false;
    }
});

ipcRenderer.on('install-progress', (event, { progress, status }) => {
    progressBar.style.width = `${progress}%`;
    progressText.textContent = status;
}); 
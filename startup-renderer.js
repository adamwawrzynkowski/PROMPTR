const { ipcRenderer } = require('electron');

const progressBar = document.getElementById('progress');
const statusText = document.querySelector('.status-text');
const statusIcon = document.querySelector('.status-icon i');
const closeButton = document.getElementById('close-btn');

closeButton.addEventListener('click', () => {
    ipcRenderer.send('quit-app');
});

let progress = 0;
const progressSteps = [
    { value: 30, text: 'Connecting to Ollama...' },
    { value: 60, text: 'Checking configuration...' },
    { value: 90, text: 'Starting application...' }
];

ipcRenderer.on('startup-progress', (event, { step, status }) => {
    if (step < progressSteps.length) {
        progress = progressSteps[step].value;
        statusText.textContent = status || progressSteps[step].text;
        progressBar.style.width = `${progress}%`;
    }
});

ipcRenderer.on('startup-error', (event, error) => {
    statusText.textContent = `Error: ${error}`;
    statusText.style.color = '#f44336';
    statusIcon.className = 'fas fa-exclamation-triangle';
    statusIcon.style.color = '#f44336';
}); 
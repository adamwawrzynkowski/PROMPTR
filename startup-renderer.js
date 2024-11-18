const { ipcRenderer } = require('electron');

// Elementy UI
const progressBar = document.getElementById('progress');
const statusText = document.querySelector('.status-text');
const closeBtn = document.getElementById('close-btn');
const versionElement = document.getElementById('version');

// Obsługa zamykania
closeBtn.addEventListener('click', () => {
    ipcRenderer.send('quit-app');
});

// Obsługa wersji
ipcRenderer.on('app-version', (event, version) => {
    versionElement.textContent = version;
});

// Obsługa postępu
ipcRenderer.on('startup-progress', (event, data) => {
    console.log('Received startup progress:', data);
    
    // Aktualizuj pasek postępu
    const progress = ((data.step + 1) / 3) * 100;
    progressBar.style.width = `${progress}%`;
    
    // Aktualizuj tekst statusu
    if (data.status) {
        statusText.textContent = data.status;
    }
});

// Obsługa błędów
ipcRenderer.on('startup-error', (event, error) => {
    console.error('Startup error:', error);
    statusText.textContent = error;
    statusText.classList.add('error');
    progressBar.classList.add('error');
});

// Dodaj style dla błędów
const style = document.createElement('style');
style.textContent = `
    .error {
        color: #ff4444 !important;
    }
    .progress-bar .error {
        background-color: #ff4444 !important;
    }
`;
document.head.appendChild(style); 
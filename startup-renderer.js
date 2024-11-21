const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    const statusElement = document.getElementById('status');
    const progressBar = document.getElementById('progress');
    const versionElement = document.getElementById('version');
    let currentStatus = 'Initializing...';

    // Funkcja do aktualizacji interfejsu
    function updateUI(data) {
        console.log('Updating UI with data:', data);
        
        if (!data) return;

        // Aktualizuj status tylko jeśli jest nowy
        if (statusElement && data.status && data.status !== currentStatus) {
            currentStatus = data.status;
            requestAnimationFrame(() => {
                statusElement.style.opacity = '0';
                setTimeout(() => {
                    statusElement.textContent = data.status;
                    statusElement.style.opacity = '1';
                    // Dodaj klasę dla animacji
                    statusElement.classList.remove('status-update');
                    void statusElement.offsetWidth; // Force reflow
                    statusElement.classList.add('status-update');
                }, 150);
            });
        }

        // Aktualizuj pasek postępu
        if (progressBar && typeof data.progress === 'number') {
            requestAnimationFrame(() => {
                progressBar.value = data.progress;
            });
        }
    }

    // Nasłuchuj na komunikaty o postępie
    ipcRenderer.on('startup-progress', (event, data) => {
        console.log('Received startup progress:', data);
        updateUI(data);
    });

    // Nasłuchuj na błędy
    ipcRenderer.on('startup-error', (event, error) => {
        console.error('Startup error:', error);
        if (statusElement) {
            requestAnimationFrame(() => {
                statusElement.textContent = `Error: ${error}`;
                statusElement.classList.add('error');
            });
        }
    });

    // Nasłuchuj na wersję aplikacji
    ipcRenderer.on('app-version', (event, version) => {
        if (versionElement) {
            requestAnimationFrame(() => {
                versionElement.textContent = version;
            });
        }
    });
}); 
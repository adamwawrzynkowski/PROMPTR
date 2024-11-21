const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    const statusElement = document.getElementById('status');
    const progressBar = document.getElementById('progress');
    const versionElement = document.getElementById('version');

    // Funkcja do aktualizacji interfejsu
    function updateUI(data) {
        console.log('Updating UI with data:', data);
        
        if (!data) return;

        // Natychmiast aktualizuj status
        if (statusElement && data.status) {
            requestAnimationFrame(() => {
                statusElement.textContent = data.status;
                // Dodaj klasę dla animacji
                statusElement.classList.remove('status-update');
                void statusElement.offsetWidth; // Force reflow
                statusElement.classList.add('status-update');
            });
        }

        // Natychmiast aktualizuj pasek postępu
        if (progressBar && typeof data.progress === 'number') {
            requestAnimationFrame(() => {
                progressBar.value = data.progress;
            });
        }
    }

    // Ustaw początkowy status
    updateUI({
        status: 'Initializing...',
        progress: 0
    });

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
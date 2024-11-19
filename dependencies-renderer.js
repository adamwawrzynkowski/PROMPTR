const { ipcRenderer, shell } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    // Obsługa przycisku zamykania
    const closeButton = document.querySelector('.close-button');
    closeButton.addEventListener('click', () => {
        window.close();
    });

    // Obsługa przycisków instalacji
    document.querySelectorAll('.install-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const url = btn.dataset.url;
            shell.openExternal(url);
        });
    });

    // Obsługa przycisku Check Again
    const checkAgainBtn = document.getElementById('check-again-btn');
    checkAgainBtn.addEventListener('click', () => {
        ipcRenderer.send('restart-app');
    });

    // Aktualizacja statusu zależności
    ipcRenderer.on('dependencies-status', (event, status) => {
        const ollamaStatus = document.getElementById('ollama-status');
        const pythonStatus = document.getElementById('python-status');

        if (status.ollama) {
            ollamaStatus.classList.add('available');
            ollamaStatus.querySelector('.install-btn').style.display = 'none';
        }

        if (status.python) {
            pythonStatus.classList.add('available');
            pythonStatus.querySelector('.install-btn').style.display = 'none';
        }
    });
}); 
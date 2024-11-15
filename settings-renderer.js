const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.querySelector('.close-btn');
    const saveBtn = document.querySelector('.save-btn');
    const themeButtons = document.querySelectorAll('.theme-btn');
    const animationsToggle = document.getElementById('animations-toggle');
    const historyLimit = document.getElementById('history-limit');
    const ollamaConfigBtn = document.getElementById('open-ollama-config');

    // Załaduj aktualne ustawienia
    ipcRenderer.invoke('get-settings').then(settings => {
        // Ustaw theme
        themeButtons.forEach(btn => {
            if (btn.dataset.theme === settings.theme) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });

        // Ustaw pozostałe opcje
        animationsToggle.checked = settings.animations;
        historyLimit.value = settings.historyLimit;
    });

    // Obsługa wyboru motywu
    themeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            themeButtons.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });

    // Obsługa przycisku konfiguracji Ollama
    ollamaConfigBtn.addEventListener('click', () => {
        ipcRenderer.send('open-config');
        // Nie zamykamy okna ustawień od razu
    });

    // Obsługa zamykania okna
    closeBtn.addEventListener('click', () => {
        window.close();
    });

    // Obsługa zapisywania ustawień
    saveBtn.addEventListener('click', async () => {
        const newSettings = {
            theme: document.querySelector('.theme-btn.selected').dataset.theme,
            animations: animationsToggle.checked,
            historyLimit: parseInt(historyLimit.value, 10)
        };

        await ipcRenderer.invoke('save-settings', newSettings);
        window.close();
    });

    // Obsługa klawisza Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            window.close();
        }
    });
}); 
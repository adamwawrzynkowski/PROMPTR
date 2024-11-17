const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', async () => {
    // Pobierz aktualne ustawienia
    const settings = await ipcRenderer.invoke('get-settings');
    
    // Ustaw wartości kontrolek
    document.getElementById('theme-select').value = settings.theme;
    document.getElementById('prompt-translation').checked = settings.promptTranslation;
    document.getElementById('tag-generation').checked = settings.tagGeneration;
    document.getElementById('slow-mode').checked = settings.slowMode;
    document.getElementById('delay-input').value = settings.slowModeDelay;
    document.getElementById('delay-input').disabled = !settings.slowMode;

    // Draw Things Integration
    const drawThingsEnabled = document.getElementById('draw-things-enabled');
    const drawThingsAutoSend = document.getElementById('draw-things-auto-send');
    const drawThingsPort = document.getElementById('draw-things-port');
    const drawThingsSettings = document.querySelectorAll('.draw-things-settings');

    // Ustaw początkowe wartości
    drawThingsEnabled.checked = settings.drawThingsIntegration.enabled;
    drawThingsAutoSend.checked = settings.drawThingsIntegration.autoSend;
    drawThingsPort.value = settings.drawThingsIntegration.port;

    // Pokaż/ukryj dodatkowe ustawienia
    drawThingsSettings.forEach(element => {
        element.style.display = settings.drawThingsIntegration.enabled ? 'flex' : 'none';
    });

    // Event listenery dla zmian
    document.getElementById('theme-select').addEventListener('change', async (e) => {
        const newSettings = await ipcRenderer.invoke('save-settings', {
            theme: e.target.value
        });
    });

    document.getElementById('prompt-translation').addEventListener('change', async (e) => {
        const newSettings = await ipcRenderer.invoke('save-settings', {
            promptTranslation: e.target.checked
        });
    });

    document.getElementById('tag-generation').addEventListener('change', async (e) => {
        const newSettings = await ipcRenderer.invoke('save-settings', {
            tagGeneration: e.target.checked
        });
    });

    document.getElementById('slow-mode').addEventListener('change', async (e) => {
        const delayInput = document.getElementById('delay-input');
        delayInput.disabled = !e.target.checked;
        
        const newSettings = await ipcRenderer.invoke('save-settings', {
            slowMode: e.target.checked,
            slowModeDelay: parseInt(delayInput.value)
        });
    });

    document.getElementById('delay-input').addEventListener('change', async (e) => {
        const value = Math.min(Math.max(parseInt(e.target.value), 500), 5000);
        e.target.value = value;
        
        if (document.getElementById('slow-mode').checked) {
            const newSettings = await ipcRenderer.invoke('save-settings', {
                slowModeDelay: value
            });
        }
    });

    // Event listener dla włączenia/wyłączenia integracji
    drawThingsEnabled.addEventListener('change', async (e) => {
        drawThingsSettings.forEach(element => {
            element.style.display = e.target.checked ? 'flex' : 'none';
        });
        
        const newSettings = await ipcRenderer.invoke('save-settings', {
            drawThingsIntegration: {
                ...settings.drawThingsIntegration,
                enabled: e.target.checked
            }
        });
    });

    // Event listener dla auto-send
    drawThingsAutoSend.addEventListener('change', async (e) => {
        const newSettings = await ipcRenderer.invoke('save-settings', {
            drawThingsIntegration: {
                ...settings.drawThingsIntegration,
                autoSend: e.target.checked
            }
        });
    });

    // Event listener dla portu
    drawThingsPort.addEventListener('change', async (e) => {
        const value = Math.min(Math.max(parseInt(e.target.value), 1), 65535);
        e.target.value = value;
        
        const newSettings = await ipcRenderer.invoke('save-settings', {
            drawThingsIntegration: {
                ...settings.drawThingsIntegration,
                port: value
            }
        });
    });

    // Dodaj na początku pliku
    document.getElementById('close-btn')?.addEventListener('click', () => {
        window.close();
    });
}); 
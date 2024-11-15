const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    const statusIndicator = document.querySelector('.status-indicator');
    const statusText = document.getElementById('connection-status');
    const modelSelect = document.getElementById('model-select');
    const refreshBtn = document.getElementById('refresh-btn');
    const saveBtn = document.getElementById('save-btn');

    // Natychmiast sprawdź status
    ipcRenderer.send('refresh-connection');

    ipcRenderer.on('connection-status', (event, status) => {
        if (status.isConnected) {
            statusIndicator.classList.add('connected');
            statusIndicator.classList.remove('disconnected');
            statusText.textContent = 'Connected to Ollama';
            
            // Aktualizuj listę modeli
            if (status.availableModels && status.availableModels.length > 0) {
                modelSelect.innerHTML = status.availableModels
                    .map(model => `<option value="${model.name}" ${status.currentModel === model.name ? 'selected' : ''}>${model.name}</option>`)
                    .join('');
                modelSelect.disabled = false;
            } else {
                modelSelect.innerHTML = '<option value="">No models available</option>';
                modelSelect.disabled = true;
            }
        } else {
            statusIndicator.classList.add('disconnected');
            statusIndicator.classList.remove('connected');
            statusText.textContent = status.error || 'Disconnected from Ollama';
            modelSelect.innerHTML = '<option value="">Connection required</option>';
            modelSelect.disabled = true;
        }
    });

    refreshBtn.addEventListener('click', () => {
        statusText.textContent = 'Checking connection...';
        modelSelect.disabled = true;
        ipcRenderer.send('refresh-connection');
    });

    saveBtn.addEventListener('click', () => {
        const selectedModel = modelSelect.value;
        if (selectedModel) {
            ipcRenderer.send('save-config', { model: selectedModel });
            window.close();
        }
    });

    // Dodana obsługa klawisza Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            window.close();
        }
    });
}); 
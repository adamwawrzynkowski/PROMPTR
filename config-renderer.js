const { ipcRenderer } = require('electron');

const modelSelect = document.getElementById('model-select');
const visionModelSelect = document.getElementById('vision-model-select');
const saveBtn = document.getElementById('save-btn');
const refreshBtn = document.getElementById('refresh-btn');
const statusText = document.getElementById('status-text');
const statusIcon = document.querySelector('.status-indicator i');
const closeBtn = document.getElementById('close-btn');

const VISION_MODELS = ['llava'];

async function updateStatus() {
    try {
        console.log('Refreshing Ollama status...');
        const status = await ipcRenderer.invoke('refresh-ollama-status');
        console.log('Received status:', status);

        const statusIndicator = document.querySelector('.status-indicator');
        
        if (status.isConnected) {
            statusIndicator.classList.add('connected');
            statusIndicator.classList.remove('error');
            statusText.textContent = 'Connected to Ollama';
            statusIcon.className = 'fas fa-plug';
            
            // Update models lists
            const models = status.availableModels || [];
            
            // Filter models
            const textModels = models.filter(model => 
                !VISION_MODELS.some(vm => model.name.toLowerCase().includes(vm.toLowerCase()))
            );
            const visionModels = models.filter(model => 
                VISION_MODELS.some(vm => model.name.toLowerCase().includes(vm.toLowerCase()))
            );
            
            // Update text models select
            modelSelect.innerHTML = '<option value="">Select a model</option>' +
                textModels.map(model => 
                    `<option value="${model.name}" ${status.currentModel === model.name ? 'selected' : ''}>
                        ${model.name}
                    </option>`
                ).join('');
            
            // Update vision models select
            visionModelSelect.innerHTML = '<option value="">Select a vision model</option>' +
                visionModels.map(model => 
                    `<option value="${model.name}" ${status.visionModel === model.name ? 'selected' : ''}>
                        ${model.name}
                    </option>`
                ).join('');
            
            modelSelect.disabled = false;
            visionModelSelect.disabled = false;
            saveBtn.disabled = false;
        } else {
            statusIndicator.classList.remove('connected');
            statusIndicator.classList.add('error');
            statusText.textContent = status.error || 'Not connected to Ollama';
            statusIcon.className = 'fas fa-exclamation-triangle';
            
            modelSelect.disabled = true;
            visionModelSelect.disabled = true;
            saveBtn.disabled = true;
        }
    } catch (error) {
        console.error('Error updating status:', error);
        const statusIndicator = document.querySelector('.status-indicator');
        statusIndicator.classList.remove('connected');
        statusIndicator.classList.add('error');
        statusText.textContent = `Error: ${error.message}`;
        statusIcon.className = 'fas fa-exclamation-triangle';
    }
}

saveBtn.addEventListener('click', async () => {
    try {
        saveBtn.disabled = true;
        const config = {
            model: modelSelect.value,
            visionModel: visionModelSelect.value
        };
        
        console.log('Saving configuration:', config);
        await ipcRenderer.invoke('save-config', config);
        window.close();
    } catch (error) {
        console.error('Error saving configuration:', error);
        alert('Error saving configuration: ' + error.message);
        saveBtn.disabled = false;
    }
});

refreshBtn.addEventListener('click', () => {
    statusIcon.className = 'fas fa-sync-alt fa-spin';
    updateStatus();
});

closeBtn.addEventListener('click', () => {
    window.close();
});

// Initial status check
updateStatus(); 
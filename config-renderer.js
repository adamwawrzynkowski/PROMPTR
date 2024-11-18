const { ipcRenderer } = require('electron');

const modelSelect = document.getElementById('model-select');
const visionModelSelect = document.getElementById('vision-model-select');
const saveBtn = document.getElementById('save-btn');
const refreshBtn = document.getElementById('refresh-btn');
const statusText = document.getElementById('status-text');
const statusIcon = document.querySelector('.status-indicator i');
const closeBtn = document.getElementById('close-btn');

const VISION_MODELS = ['llava'];

let availableModels = [];
let installedModels = [];

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded');
    await updateStatus();
    await refreshModels();
});

async function updateStatus() {
    try {
        console.log('Updating status...');
        const status = await ipcRenderer.invoke('refresh-ollama-status');
        console.log('Received status:', status);

        const statusIndicator = document.querySelector('.status-indicator');
        
        if (status.isConnected) {
            statusIndicator.classList.add('connected');
            statusIndicator.classList.remove('error');
            statusText.textContent = 'Connected to Ollama';
            statusIcon.className = 'fas fa-plug';
            
            // Pobierz listę modeli
            const models = await ipcRenderer.invoke('get-available-models');
            console.log('Available models:', models);
            
            // Filtruj modele na tekstowe i wizyjne oraz tylko zainstalowane
            const textModels = models.filter(model => 
                model.type === 'Text' && model.installed
            );
            const visionModels = models.filter(model => 
                model.type === 'Vision' && model.installed
            );
            
            // Aktualizuj select dla modeli tekstowych
            modelSelect.innerHTML = '<option value="">Select a model</option>';
            textModels.forEach(model => {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = model.name;
                option.selected = status.currentModel === model.id;
                modelSelect.appendChild(option);
            });
            
            // Aktualizuj select dla modeli wizyjnych
            visionModelSelect.innerHTML = '<option value="">Select a vision model</option>';
            visionModels.forEach(model => {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = model.name;
                option.selected = status.visionModel === model.id;
                visionModelSelect.appendChild(option);
            });
            
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

async function refreshModels() {
    try {
        console.log('Refreshing models list...');
        const modelsListElement = document.getElementById('models-list');
        modelsListElement.innerHTML = ''; // Wyczyść listę

        // Pobierz listę dostępnych modeli
        const models = await ipcRenderer.invoke('get-available-models');
        console.log('Received models:', models);

        if (!models || models.length === 0) {
            console.warn('No models received');
            modelsListElement.innerHTML = '<div class="no-models">No models available</div>';
            return;
        }

        // Dla każdego modelu stwórz element
        for (const model of models) {
            console.log('Processing model:', model);
            
            const modelElement = document.createElement('div');
            modelElement.className = 'model-item';
            modelElement.dataset.model = model.id;
            
            const modelInfo = document.createElement('div');
            modelInfo.className = 'model-info';
            
            const modelName = document.createElement('span');
            modelName.className = 'model-name';
            modelName.textContent = model.name;
            
            const modelTag = document.createElement('span');
            modelTag.className = `model-tag tag-${model.type.toLowerCase()}`;
            modelTag.textContent = model.type;
            
            modelInfo.appendChild(modelName);
            modelInfo.appendChild(modelTag);
            
            const actionContainer = document.createElement('div');
            actionContainer.className = 'model-action';
            
            if (model.installed) {
                const deleteButton = document.createElement('button');
                deleteButton.className = 'download-button delete-button';
                deleteButton.innerHTML = '<i class="fas fa-trash"></i> Delete';
                deleteButton.onclick = () => deleteModel(model.id);
                actionContainer.appendChild(deleteButton);
            } else {
                const downloadButton = document.createElement('button');
                downloadButton.className = 'download-button';
                downloadButton.innerHTML = '<i class="fas fa-download"></i> Download';
                downloadButton.onclick = () => downloadModel(model.id);
                actionContainer.appendChild(downloadButton);
            }
            
            modelElement.appendChild(modelInfo);
            modelElement.appendChild(actionContainer);
            modelsListElement.appendChild(modelElement);
        }

        // Odśwież też listy wyboru modeli
        await updateStatus();
    } catch (error) {
        console.error('Error refreshing models:', error);
        const modelsListElement = document.getElementById('models-list');
        modelsListElement.innerHTML = `<div class="error-message">Error loading models: ${error.message}</div>`;
    }
}

async function downloadModel(modelName) {
    try {
        const modelItem = document.querySelector(`[data-model="${modelName}"]`);
        const actionContainer = modelItem.querySelector('.model-action');
        
        // Stwórz elementy postępu
        actionContainer.innerHTML = `
            <div class="progress-container">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%"></div>
                </div>
                <span class="progress-text">0%</span>
            </div>
        `;
        
        // Nasłuchuj na aktualizacje postępu
        ipcRenderer.on('model-download-progress', (event, { model, progress }) => {
            if (model === modelName) {
                const progressFill = actionContainer.querySelector('.progress-fill');
                const progressText = actionContainer.querySelector('.progress-text');
                progressFill.style.width = `${progress}%`;
                progressText.textContent = `${Math.round(progress)}%`;
            }
        });
        
        // Rozpocznij pobieranie
        await ipcRenderer.invoke('install-model', modelName);
        
        // Po zakończeniu odśwież listę
        await refreshModels();
        await updateStatus();
        
    } catch (error) {
        console.error('Error downloading model:', error);
        alert(`Error downloading model: ${error.message}`);
    }
}

async function deleteModel(modelName) {
    if (confirm(`Are you sure you want to delete ${modelName}?`)) {
        try {
            await ipcRenderer.invoke('delete-model', modelName);
            await refreshModels();
            await updateStatus();
        } catch (error) {
            console.error('Error deleting model:', error);
            alert(`Error deleting model: ${error.message}`);
        }
    }
}

refreshBtn.addEventListener('click', async () => {
    statusIcon.className = 'fas fa-sync-alt fa-spin';
    await updateStatus();
    await refreshModels();
});

closeBtn.addEventListener('click', () => {
    window.close();
});

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

async function loadModels() {
    try {
        const models = await window.electron.invoke('get-available-models');
        console.log('Received models:', models);
        
        // Podziel modele na tekstowe i wizyjne
        const textModels = models.filter(model => model.type === 'Text');
        const visionModels = models.filter(model => model.type === 'Vision');

        // Zaktualizuj listy wyboru
        updateModelSelect(textModelSelect, textModels);
        updateModelSelect(visionModelSelect, visionModels);
    } catch (error) {
        console.error('Error loading models:', error);
        showError('Failed to load models: ' + error.message);
    }
}

function updateModelSelect(select, models) {
    select.innerHTML = '<option value="">Select a model</option>';
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = `${model.name}${model.installed ? ' (installed)' : ''}`;
        option.disabled = !model.installed;
        select.appendChild(option);
    });
} 
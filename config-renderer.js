const { ipcRenderer } = require('electron');
const Store = require('electron-store');

// Initialize electron store
const store = new Store();

// Get current theme
const currentTheme = store.get('settings.theme', 'purple');
document.body.className = `theme-${currentTheme.toLowerCase()}`;

// Get current model from store
const currentModel = store.get('settings.currentModel') || store.get('currentModel');
console.log('Current model from store:', currentModel);

// Predefined text models
const textModels = [
    {
        name: 'PROMPTR Default',
        description: 'A balanced model optimized for everyday use. Offers good performance and reasonable response times, making it suitable for most text generation tasks.',
        modelName: 'llama3.2:3b',
        type: 'Base Model'
    },
    {
        name: 'PROMPTR Fast',
        description: 'An ultra-lightweight model designed for quick responses and minimal resource usage.',
        modelName: 'qwen2.5:0.5b',
        type: 'Fast Model',
        warning: 'This model prioritizes speed over quality and may produce less accurate results. Recommended for systems with limited resources.'
    },
    {
        name: 'PROMPTR High Quality',
        description: 'A high-performance model that delivers exceptional quality and nuanced responses. Ideal for complex tasks requiring detailed and accurate outputs.',
        modelName: 'mistral:7b',
        type: 'High Quality Model'
    },
    {
        name: 'PROMPTR Gemma',
        description: 'A state-of-the-art model based on Google\'s Gemma architecture. Offers excellent performance across a wide range of tasks with strong reasoning capabilities.',
        modelName: 'gemma:7b',
        type: 'High Quality Model'
    },
    {
        name: 'PROMPTR NSFW',
        description: 'An unrestricted model capable of handling mature and sensitive content.',
        modelName: 'dolphin-llama3:8b',
        type: 'Specialized Model',
        warning: 'This model is intended for personal use only. Please ensure ethical usage and comply with all applicable laws and regulations.'
    }
];

// List of models that should keep their parameters
const MODELS_WITH_PARAMS = [
    'qwen2.5',
    'mistral',
    'gemma',
    'dolphin-llama3',
    'llama3.2'
];

// Elements
const closeButton = document.querySelector('.close-button');
const refreshButton = document.querySelector('.refresh-btn');
const statusText = document.querySelector('.status-text');
const modelsList = document.querySelector('.models-list');
const textModelTemplate = document.getElementById('text-model-template');

// Create text model item
function createTextModelItem(model) {
    const item = textModelTemplate.content.cloneNode(true);
    const modelItem = item.querySelector('.model-item');
    
    modelItem.setAttribute('data-model', model.modelName);
    modelItem.querySelector('.model-name').textContent = model.name;
    modelItem.querySelector('.model-type').textContent = model.type;
    modelItem.querySelector('.model-description').textContent = model.description;
    modelItem.querySelector('.model-tag').textContent = model.modelName;
    
    // Remove warning section if no warning exists
    if (!model.warning) {
        modelItem.querySelector('.model-warning').remove();
    } else {
        const warningElement = modelItem.querySelector('.model-warning');
        warningElement.querySelector('.warning-text').textContent = model.warning;
        warningElement.style.display = 'flex';
    }
    
    const downloadButton = modelItem.querySelector('.download-button');
    const removeButton = modelItem.querySelector('.remove-button');
    
    // Check if model is installed
    const isInstalled = store.get(`installedModels.${model.modelName}`, false);
    if (isInstalled) {
        modelItem.setAttribute('data-installed', 'true');
    }
    
    // Add visual indicator for currently selected model
    const baseModelName = model.modelName.split(':')[0];
    const currentBaseModel = currentModel ? currentModel.split(':')[0] : null;
    
    if (baseModelName === currentBaseModel) {
        modelItem.classList.add('current-model');
        const currentBadge = document.createElement('div');
        currentBadge.className = 'current-model-badge';
        currentBadge.innerHTML = '<i class="fas fa-check-circle"></i> Current Model';
        modelItem.querySelector('.model-header').appendChild(currentBadge);
        downloadButton.querySelector('span').textContent = 'Current Model';
    } else {
        downloadButton.querySelector('span').textContent = 'Choose';
    }
    
    downloadButton.addEventListener('click', () => installModel(model.modelName, modelItem));
    removeButton.addEventListener('click', () => removeModel(model.modelName, modelItem));
    
    return modelItem;
}

// Add progress handler
ipcRenderer.on('model-install-progress', (event, { progress, status }) => {
    console.log('Received progress update:', progress, status);
    const progressElements = document.querySelectorAll('.model-progress');
    const statusElements = document.querySelectorAll('.model-status');
    
    progressElements.forEach(progressElement => {
        if (progressElement) {
            console.log('Updating progress element:', progress);
            progressElement.value = progress;
        }
    });
    
    statusElements.forEach(statusElement => {
        if (statusElement) {
            console.log('Updating status element:', status);
            statusElement.textContent = status;
        }
    });
});

// Install model
async function installModel(modelName, modelItem) {
    try {
        console.log('Starting model installation:', modelName);
        const downloadButton = modelItem.querySelector('.download-button');
        const progressElement = modelItem.querySelector('.model-progress');
        const statusText = modelItem.querySelector('.model-status');

        console.log('UI elements:', { 
            downloadButton: !!downloadButton, 
            progressElement: !!progressElement, 
            statusText: !!statusText 
        });

        downloadButton.disabled = true;
        progressElement.style.display = 'block';
        progressElement.value = 0; // Reset progress
        statusText.textContent = 'Starting installation...';

        // Wait for model installation
        console.log('Invoking install-model');
        await ipcRenderer.invoke('install-model', modelName);
        console.log('Model installation complete');

        // Check if this model should keep its parameters
        const baseModelName = modelName.split(':')[0];
        const shouldKeepParams = MODELS_WITH_PARAMS.includes(baseModelName);
        const modelNameForConfig = shouldKeepParams ? modelName : baseModelName;

        // Update the store with the new model
        store.set('currentModel', modelNameForConfig);
        store.set('settings.currentModel', modelNameForConfig);
        store.set(`installedModels.${modelName}`, true);

        // Notify the main process about model change
        ipcRenderer.send('model-changed', modelNameForConfig);

        // Update UI to show current model
        document.querySelectorAll('.model-item').forEach(item => {
            item.classList.remove('current-model');
            const badge = item.querySelector('.current-model-badge');
            if (badge) {
                badge.remove();
            }
            const btn = item.querySelector('.download-button');
            btn.querySelector('span').textContent = 'Choose';
        });

        modelItem.classList.add('current-model');
        const currentBadge = document.createElement('div');
        currentBadge.className = 'current-model-badge';
        currentBadge.innerHTML = '<i class="fas fa-check-circle"></i> Current Model';
        modelItem.querySelector('.model-header').appendChild(currentBadge);
        downloadButton.querySelector('span').textContent = 'Current Model';

        progressElement.style.display = 'none';
        downloadButton.disabled = false;

        // Show restart dialog
        const dialog = document.createElement('div');
        dialog.className = 'modal-overlay';
        dialog.innerHTML = `
            <div class="modal-content">
                <h2>Restart Required</h2>
                <p>The application needs to restart to apply the new model changes.</p>
                <div class="modal-buttons">
                    <button class="modal-button modal-ok">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        // Add event listener for OK button
        dialog.querySelector('.modal-ok').addEventListener('click', async () => {
            await ipcRenderer.invoke('restart-app');
        });

    } catch (error) {
        console.error('Error installing model:', error);
        const errorElement = modelItem.querySelector('.model-warning');
        if (errorElement) {
            errorElement.style.display = 'flex';
            errorElement.querySelector('.warning-text').textContent = 'Error installing model. Please try again.';
        }
        progressElement.style.display = 'none';
        downloadButton.disabled = false;
    }
}

// Remove model
async function removeModel(modelName, modelItem) {
    try {
        console.log('Starting model removal:', modelName);
        const removeButton = modelItem.querySelector('.remove-button');
        removeButton.disabled = true;

        // Always use base model name for removal in Ollama
        const baseModelName = modelName.split(':')[0];
        console.log('Using base model name for removal:', baseModelName);
        await ipcRenderer.invoke('remove-model', baseModelName);

        // Update the store
        store.delete(`installedModels.${modelName}`);
        
        // Update UI
        const downloadButton = modelItem.querySelector('.download-button');
        downloadButton.style.display = 'block';
        downloadButton.disabled = false;
        downloadButton.querySelector('span').textContent = 'Choose';
        removeButton.style.display = 'none';
        
        // Remove current model badge if this was the current model
        const currentBadge = modelItem.querySelector('.current-model-badge');
        if (currentBadge) {
            currentBadge.remove();
        }
        modelItem.classList.remove('current-model');

        // If this was the current model, clear it from the store
        const currentModel = store.get('currentModel');
        const currentBaseModel = currentModel ? currentModel.split(':')[0] : null;
        
        if (currentBaseModel === baseModelName) {
            store.delete('currentModel');
            store.delete('settings.currentModel');
            // Notify about model change
            ipcRenderer.send('model-changed', null);
        }

    } catch (error) {
        console.error('Error removing model:', error);
        const removeButton = modelItem.querySelector('.remove-button');
        removeButton.disabled = false;
        const errorElement = modelItem.querySelector('.model-warning');
        if (errorElement) {
            errorElement.style.display = 'flex';
            errorElement.querySelector('.warning-text').textContent = 'Error removing model. Please try again.';
        }
    }
}

// Check connection status
async function checkConnection() {
    try {
        statusText.innerHTML = '<i class="fas fa-circle"></i> Connected to Ollama';
        document.querySelector('.status-item').classList.add('connected');
    } catch (error) {
        statusText.innerHTML = '<i class="fas fa-circle"></i> Not connected to Ollama';
        document.querySelector('.status-item').classList.add('disconnected');
    }
}

// Load models
function loadModels() {
    // Clear existing models
    modelsList.innerHTML = '';
    
    // Add text models
    textModels.forEach(model => {
        const modelItem = createTextModelItem(model);
        modelsList.appendChild(modelItem);
        
        // Check if model is installed
        if (store.get(`installedModels.${model.modelName}`)) {
            const downloadButton = modelItem.querySelector('.download-button');
            const removeButton = modelItem.querySelector('.remove-button');
            
            modelItem.setAttribute('data-installed', 'true');
            downloadButton.style.display = 'none';
            removeButton.style.display = 'inline-flex';
        }
    });
}

// Initialize
function initialize() {
    checkConnection();
    loadModels();
    
    closeButton.addEventListener('click', () => {
        window.close();
    });
    
    refreshButton.addEventListener('click', () => {
        checkConnection();
    });
}

initialize();

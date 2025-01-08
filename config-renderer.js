const { ipcRenderer } = require('electron');
const Store = require('electron-store');

// Initialize electron store
const store = new Store();

// Get current theme
const currentTheme = store.get('settings.theme', 'purple');
document.body.className = `theme-${currentTheme.toLowerCase()}`;

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
        modelName: 'qwen:0.5b',
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
    
    downloadButton.addEventListener('click', () => installModel(model.modelName, modelItem));
    removeButton.addEventListener('click', () => removeModel(model.modelName, modelItem));
    
    return modelItem;
}

// Install model
async function installModel(modelName, modelItem) {
    try {
        const downloadButton = modelItem.querySelector('.download-button');
        const removeButton = modelItem.querySelector('.remove-button');
        const progressElement = modelItem.querySelector('.model-progress');
        const progressFill = modelItem.querySelector('.progress-fill');
        const progressText = modelItem.querySelector('.progress-text');
        const statusText = modelItem.querySelector('.model-status');

        downloadButton.disabled = true;
        progressElement.style.display = 'block';
        statusText.textContent = 'Installing...';

        modelItem.classList.add('installing');

        // Simulate progress updates
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress > 100) progress = 100;
            
            progressFill.style.width = `${progress}%`;
            progressText.textContent = `${Math.round(progress)}%`;
            
            if (progress === 100) {
                clearInterval(interval);
                modelItem.classList.remove('installing');
                modelItem.classList.add('installed');
                progressElement.style.display = 'none';
                downloadButton.style.display = 'none';
                removeButton.style.display = 'block';
                store.set(`installedModels.${modelName}`, true);
            }
        }, 500);

    } catch (error) {
        console.error('Error installing model:', error);
        modelItem.classList.remove('installing');
        statusText.textContent = 'Installation failed';
        statusText.style.color = 'var(--error)';
    }
}

// Remove model
async function removeModel(modelName, modelItem) {
    try {
        const downloadButton = modelItem.querySelector('.download-button');
        const removeButton = modelItem.querySelector('.remove-button');
        
        removeButton.disabled = true;
        
        // Simulate removal
        setTimeout(() => {
            modelItem.classList.remove('installed');
            downloadButton.style.display = 'block';
            removeButton.style.display = 'none';
            downloadButton.disabled = false;
            removeButton.disabled = false;
            store.delete(`installedModels.${modelName}`);
        }, 1000);

    } catch (error) {
        console.error('Error removing model:', error);
        removeButton.disabled = false;
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
            
            modelItem.classList.add('installed');
            downloadButton.style.display = 'none';
            removeButton.style.display = 'block';
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

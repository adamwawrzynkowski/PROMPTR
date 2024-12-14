const { ipcRenderer } = require('electron');

// Elements
const closeBtn = document.getElementById('close-btn');
const connectionPanel = document.getElementById('connection-panel');
const connectionStatus = document.getElementById('connection-status');
const connectionDetails = document.getElementById('connection-details');
const textModelsGrid = document.getElementById('text-models-grid');
const visionModelsGrid = document.getElementById('vision-models-grid');
const textModelCount = document.getElementById('text-model-count');
const visionModelCount = document.getElementById('vision-model-count');
const modelCardTemplate = document.getElementById('model-card-template');

// Close button handler
closeBtn.addEventListener('click', () => {
    ipcRenderer.send('close-config');
});

// Format file size
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

// Create model card
function createModelCard(model) {
    const card = modelCardTemplate.content.cloneNode(true);
    const cardElement = card.querySelector('.model-card');
    
    // Set model info
    cardElement.querySelector('.model-name').textContent = model.name;
    const tagElement = cardElement.querySelector('.model-tag');
    tagElement.textContent = model.tag;
    tagElement.setAttribute('data-tag', model.tag);
    
    // Show size only for installed models
    const sizeElement = cardElement.querySelector('.model-size');
    if (model.installed && model.size) {
        sizeElement.querySelector('span').textContent = formatSize(model.size);
        sizeElement.style.display = 'block';
    } else {
        sizeElement.style.display = 'none';
    }
    
    // Update card state based on installation status
    if (model.installed) {
        cardElement.classList.add('installed');
    }
    
    // Set up buttons
    const installBtn = cardElement.querySelector('.install-button');
    const removeBtn = cardElement.querySelector('.remove-button');
    
    // Button handlers
    installBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
            updateProgress(cardElement, 1);
            
            // Start the installation
            await ipcRenderer.invoke('install-model', model.name);
            
            // Listen for progress updates
            ipcRenderer.on('model-install-progress', (event, data) => {
                if (data.modelName === model.name) {
                    updateProgress(cardElement, data.progress, data.downloadSize, data.totalSize);
                }
            });
            
            model.installed = true;
            cardElement.classList.add('installed');
            updateModelCard(cardElement, model);
            updateProgress(cardElement, 100);
        } catch (error) {
            console.error('Failed to install model:', error);
            updateProgress(cardElement, 0);
            
            // Show error notification
            const notification = document.createElement('div');
            notification.className = 'error-notification';
            notification.innerHTML = `<i class="fas fa-exclamation-circle"></i> Failed to install model. Please make sure Ollama is running.`;
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.remove();
            }, 5000);
        }
    });
    
    removeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
            updateProgress(cardElement, 1);
            
            await ipcRenderer.invoke('remove-model', model.name);
            
            model.installed = false;
            cardElement.classList.remove('installed');
            updateModelCard(cardElement, model);
            updateProgress(cardElement, 100);
        } catch (error) {
            console.error('Failed to remove model:', error);
            updateProgress(cardElement, 0);
            
            // Show error notification
            const notification = document.createElement('div');
            notification.className = 'error-notification';
            notification.innerHTML = `<i class="fas fa-exclamation-circle"></i> Failed to remove model. Please make sure Ollama is running.`;
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.remove();
            }, 5000);
        }
    });
    
    return cardElement;
}

// Update model card state
function updateModelCard(cardElement, model) {
    const installBtn = cardElement.querySelector('.install-button');
    const removeBtn = cardElement.querySelector('.remove-button');
    
    cardElement.classList.toggle('installed', model.installed);
    installBtn.style.display = model.installed ? 'none' : 'flex';
    removeBtn.style.display = model.installed ? 'flex' : 'none';
    
    installBtn.classList.remove('loading');
    removeBtn.classList.remove('loading');
    installBtn.innerHTML = '<i class="fas fa-download"></i> Install';
    removeBtn.innerHTML = '<i class="fas fa-trash"></i> Remove';
    
    // Update size display
    const sizeElement = cardElement.querySelector('.model-size');
    if (model.installed && model.size) {
        sizeElement.querySelector('span').textContent = formatSize(model.size);
        sizeElement.style.display = 'block';
    } else {
        sizeElement.style.display = 'none';
    }
}

// Update progress
function updateProgress(cardElement, progress, downloadSize = 0, totalSize = 0) {
    const progressContainer = cardElement.querySelector('.progress-container');
    const progressElement = progressContainer.querySelector('.progress');
    const progressText = progressContainer.querySelector('.progress-text');
    const downloadSizeText = progressContainer.querySelector('.download-size');
    
    if (progress === 0 || progress === 100) {
        progressContainer.style.display = 'none';
        cardElement.classList.remove('loading');
    } else {
        progressContainer.style.display = 'block';
        cardElement.classList.add('loading');
        
        // Update progress bar and percentage
        progressElement.style.width = `${progress}%`;
        progressText.textContent = `${Math.round(progress)}%`;
        
        // Update size info if available
        if (totalSize > 0) {
            downloadSizeText.textContent = `${formatSize(downloadSize)} / ${formatSize(totalSize)}`;
        }
    }
}

// Check if model is a vision model
function isVisionModel(model) {
    const name = model.name.toLowerCase();
    return name.includes('llava') || 
           name.includes('vision') || 
           name.includes('bakllava');
}

// Update connection status
async function updateConnectionStatus() {
    try {
        const isConnected = await ipcRenderer.invoke('check-ollama-connection');
        connectionPanel.classList.toggle('connected', isConnected);
        connectionStatus.textContent = isConnected ? 'Connected to Ollama' : 'Not connected to Ollama';
        connectionDetails.textContent = isConnected 
            ? 'Ollama service is running and ready to use'
            : 'Unable to connect to Ollama service. Please make sure it is running.';
    } catch (error) {
        console.error('Failed to check connection:', error);
        connectionPanel.classList.remove('connected');
        connectionStatus.textContent = 'Connection Error';
        connectionDetails.textContent = 'Failed to check Ollama service status';
    }
}

// Load and display models
async function loadModels() {
    try {
        const { models } = await ipcRenderer.invoke('list-models');
        console.log('Received models:', models);
        
        // Clear grids
        textModelsGrid.innerHTML = '';
        visionModelsGrid.innerHTML = '';
        
        // Sort and filter models
        const textModels = models.filter(m => !isVisionModel(m));
        const visionModels = models.filter(m => isVisionModel(m));
        
        // Update counters
        textModelCount.textContent = `${textModels.length} model${textModels.length !== 1 ? 's' : ''}`;
        visionModelCount.textContent = `${visionModels.length} model${visionModels.length !== 1 ? 's' : ''}`;
        
        // Display models
        updateModelsGrid(textModelsGrid, textModels);
        updateModelsGrid(visionModelsGrid, visionModels);
    } catch (error) {
        console.error('Failed to load models:', error);
    }
}

// Update models grid
function updateModelsGrid(grid, models) {
    grid.innerHTML = '';
    
    // Sort models - installed first, then alphabetically
    const sortedModels = models.sort((a, b) => {
        if (a.installed && !b.installed) return -1;
        if (!a.installed && b.installed) return 1;
        return a.name.localeCompare(b.name);
    });
    
    sortedModels.forEach(model => {
        const card = createModelCard(model);
        grid.appendChild(card);
    });
}

// Initialize
async function initialize() {
    await updateConnectionStatus();
    await loadModels();
    
    // Set up periodic connection check
    setInterval(updateConnectionStatus, 5000);
}

initialize();

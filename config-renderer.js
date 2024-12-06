const { ipcRenderer } = require('electron');

const modelSelect = document.getElementById('model-select');
const visionModelSelect = document.getElementById('vision-model-select');
const saveBtn = document.getElementById('save-btn');
const refreshBtn = document.getElementById('refresh-btn');
const statusText = document.getElementById('status-text');
const statusIcon = document.querySelector('.status-indicator i');
const closeBtn = document.getElementById('close-btn');
const importModelBtn = document.getElementById('import-model-btn');

const VISION_MODELS = ['llava'];

let availableModels = [];
let installedModels = [];

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded');
    await updateStatus();
    await refreshModels();
    await loadCustomModels();

    // Dodaj bezpośrednią obsługę przycisku importu
    if (importModelBtn) {
        importModelBtn.addEventListener('click', () => {
            console.log('Import model button clicked');
            ipcRenderer.send('open-model-import');
        });
        
        // Upewnij się, że przycisk jest aktywny
        importModelBtn.disabled = false;
        importModelBtn.style.cursor = 'pointer';
        importModelBtn.style.opacity = '1';
    }

    // Dodaj obsługę zwijania/rozwijania dla wszystkich sekcji
    document.querySelectorAll('.section-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const icon = header.querySelector('i');
            
            header.classList.toggle('collapsed');
            content.classList.toggle('expanded');
            
            // Zapisz stan w localStorage
            const sectionId = header.textContent.trim();
            localStorage.setItem(`section-${sectionId}`, content.classList.contains('expanded'));
        });

        // Przywróć stan z localStorage
        const sectionId = header.textContent.trim();
        const isExpanded = localStorage.getItem(`section-${sectionId}`) !== 'false';
        if (!isExpanded) {
            header.classList.add('collapsed');
            header.nextElementSibling.classList.remove('expanded');
        }
    });

    // Dodaj obsługę rozwijanych kategorii
    document.querySelectorAll('.category-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling.nextElementSibling;
            const icon = header.querySelector('.fas.fa-chevron-down');
            
            content.classList.toggle('expanded');
            if (!content.classList.contains('expanded')) {
                icon.style.transform = 'rotate(-90deg)';
            } else {
                icon.style.transform = 'rotate(0deg)';
            }
        });
    });

    initializeCollapsibleSections();

    // Znajdź status-indicator i dodaj przycisk refresh
    const statusIndicator = document.querySelector('.status-indicator');
    const refreshButton = document.createElement('button');
    refreshButton.className = 'refresh-button';
    refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i>';
    statusIndicator.appendChild(refreshButton);

    // Dodaj obsługę przycisku refresh
    refreshButton.addEventListener('click', async () => {
        refreshButton.classList.add('spinning');
        await updateStatus();
        await refreshModels();
        setTimeout(() => {
            refreshButton.classList.remove('spinning');
        }, 1000);
    });

    // Usuń stary przycisk save i jego obsługę
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
        saveBtn.remove();
    }

    // Zaktualizuj obsługę wyboru modelu aby automatycznie zapisywać zmiany
    modelSelect.addEventListener('change', async () => {
        try {
            await ipcRenderer.invoke('save-config', {
                model: modelSelect.value,
                visionModel: visionModelSelect.value
            });
        } catch (error) {
            console.error('Error saving model selection:', error);
        }
    });

    visionModelSelect.addEventListener('change', async () => {
        try {
            await ipcRenderer.invoke('save-config', {
                model: modelSelect.value,
                visionModel: visionModelSelect.value
            });
        } catch (error) {
            console.error('Error saving vision model selection:', error);
        }
    });
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
            
            // Aktualizuj selecty bez zmiany stanu disabled
            await updateModelSelects(status);
        } else {
            statusIndicator.classList.remove('connected');
            statusIndicator.classList.add('error');
            statusText.textContent = status.error || 'Not connected to Ollama';
            statusIcon.className = 'fas fa-exclamation-triangle';
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
        const models = await ipcRenderer.invoke('get-available-models');
        console.log('Available models:', models);
        updateModelTags(models);
        return models;
    } catch (error) {
        console.error('Error refreshing models:', error);
        statusText.textContent = 'Error refreshing models';
        statusIcon.className = 'fas fa-exclamation-triangle';
        return [];
    }
}

// Function to update model tags
function updateModelTags(models) {
    const modelTagsContainer = document.querySelector('.model-tags');
    if (!modelTagsContainer) {
        console.warn('Model tags container not found');
        return;
    }

    // Clear existing tags
    modelTagsContainer.innerHTML = '';

    if (!models || models.length === 0) {
        console.log('No models available');
        modelTagsContainer.innerHTML = '<div class="no-models">No models available</div>';
        return;
    }

    // Sort models by category
    const modelsByCategory = {
        'text': [],
        'vision': [],
        'other': []
    };

    models.forEach(model => {
        const category = getModelCategory(model.id);
        if (modelsByCategory[category]) {
            modelsByCategory[category].push(model);
        } else {
            modelsByCategory.other.push(model);
        }
    });

    // Create tags for each category
    Object.entries(modelsByCategory).forEach(([category, categoryModels]) => {
        if (categoryModels.length > 0) {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = `model-category ${category}`;
            
            const categoryTitle = document.createElement('div');
            categoryTitle.className = 'category-title';
            categoryTitle.textContent = category.charAt(0).toUpperCase() + category.slice(1);
            categoryDiv.appendChild(categoryTitle);

            const modelsGrid = document.createElement('div');
            modelsGrid.className = 'models-grid';

            categoryModels.forEach(model => {
                const modelCard = document.createElement('div');
                modelCard.className = `model-card ${category} ${model.installed ? 'installed' : ''}`;
                
                const modelInfo = document.createElement('div');
                modelInfo.className = 'model-info';
                
                const modelName = document.createElement('div');
                modelName.className = 'model-name';
                modelName.textContent = model.id;
                
                const modelSize = document.createElement('div');
                modelSize.className = 'model-size';
                modelSize.textContent = formatSize(model.size);

                const modelStatus = document.createElement('div');
                modelStatus.className = 'model-status';
                modelStatus.innerHTML = model.installed ? 
                    '<i class="fas fa-check"></i> Installed' : 
                    '<i class="fas fa-download"></i> Available';

                modelInfo.appendChild(modelName);
                modelInfo.appendChild(modelSize);
                modelInfo.appendChild(modelStatus);

                const actionButton = document.createElement('button');
                actionButton.className = 'model-action';
                actionButton.innerHTML = model.installed ? 
                    '<i class="fas fa-trash"></i>' : 
                    '<i class="fas fa-download"></i>';
                
                actionButton.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        if (model.installed) {
                            await deleteModel(model.id);
                        } else {
                            await downloadModel(model.id);
                        }
                    } catch (error) {
                        console.error('Error managing model:', error);
                        showToast(`Error: ${error.message}`);
                    }
                });

                modelCard.appendChild(modelInfo);
                modelCard.appendChild(actionButton);
                modelsGrid.appendChild(modelCard);
            });

            categoryDiv.appendChild(modelsGrid);
            modelTagsContainer.appendChild(categoryDiv);
        }
    });
}

// Add styles for model cards
document.head.insertAdjacentHTML('beforeend', `
    <style>
        .models-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 15px;
            margin-top: 10px;
        }

        .model-card {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            transition: all 0.2s ease;
            border-left: 3px solid transparent;
        }

        .model-card:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .model-card.text { border-left-color: #4CAF50; }
        .model-card.vision { border-left-color: #2196F3; }
        .model-card.other { border-left-color: #9C27B0; }

        .model-info {
            flex: 1;
        }

        .model-name {
            font-weight: 500;
            margin-bottom: 4px;
        }

        .model-size {
            color: #888;
            font-size: 0.9em;
            margin-bottom: 4px;
        }

        .model-status {
            font-size: 0.9em;
            color: #666;
        }

        .model-status i {
            margin-right: 4px;
        }

        .model-action {
            background: none;
            border: none;
            color: #888;
            padding: 8px;
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.2s ease;
        }

        .model-action:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
        }

        .model-card.installed .model-status {
            color: #4CAF50;
        }

        .no-models {
            text-align: center;
            padding: 20px;
            color: #888;
            font-style: italic;
        }
    </style>
`);

// Dodaj funkcję do aktualizacji postępu
function updateDownloadProgress(modelElement, progress, downloadedSize, totalSize) {
    const progressContainer = modelElement.querySelector('.progress-container');
    if (!progressContainer) return;

    const progressFill = progressContainer.querySelector('.progress-fill');
    const progressText = progressContainer.querySelector('.progress-text');

    if (progressFill) {
        progressFill.style.width = `${progress}%`;
    }

    if (progressText) {
        const downloadedGB = (downloadedSize / (1024 * 1024 * 1024)).toFixed(2);
        const totalGB = (totalSize / (1024 * 1024 * 1024)).toFixed(2);
        progressText.textContent = `${progress.toFixed(1)}% (${downloadedGB}GB / ${totalGB}GB)`;
    }
}

// Zaktualizuj funkcję downloadModel
async function downloadModel(modelId) {
    try {
        console.log('Starting download for model:', modelId);
        
        // Znajdź element modelu
        const modelElement = document.querySelector(`[data-model="${modelId}"]`);
        if (!modelElement) {
            throw new Error('Model element not found');
        }

        // Znajdź kontener akcji
        const actionsContainer = modelElement.querySelector('.model-actions');
        if (!actionsContainer) {
            throw new Error('Actions container not found');
        }

        // Stwórz kontener postępu
        actionsContainer.innerHTML = `
            <div class="progress-container">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%"></div>
                </div>
                <span class="progress-text">Starting download...</span>
            </div>
        `;

        // Nasłuchuj na postęp
        ipcRenderer.on('model-install-progress', (event, data) => {
            if (data.modelName === modelId) {
                const progress = (data.downloadedSize / data.totalSize) * 100;
                updateDownloadProgress(modelElement, progress, data.downloadedSize, data.totalSize);
            }
        });

        // Nasłuchuj na zakończenie
        ipcRenderer.once('model-install-complete', async (event, data) => {
            if (data.modelName === modelId) {
                updateDownloadProgress(modelElement, 100, 100, 100);
                await refreshModels();
                await updateStatus();
            }
        });

        // Nasłuchuj na błędy
        ipcRenderer.once('model-install-error', (event, error) => {
            if (error.modelName === modelId) {
                actionsContainer.innerHTML = `
                    <button class="model-button install-button" data-model="${modelId}">
                        <i class="fas fa-download"></i> Retry Install
                    </button>
                `;
                alert(`Error downloading model: ${error.error}`);
            }
        });

        // Rozpocznij pobieranie
        await ipcRenderer.invoke('install-model', modelId);
        
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

importModelBtn.addEventListener('click', () => {
    ipcRenderer.send('open-model-import');
});

// Dodaj funkcję do ładowania custom modeli
async function loadCustomModels() {
    try {
        const customModels = await ipcRenderer.invoke('get-custom-models');
        const customModelsListElement = document.getElementById('custom-models-list');
        customModelsListElement.innerHTML = '';

        if (customModels.length === 0) {
            customModelsListElement.innerHTML = '<div class="no-models">No custom models imported</div>';
            return;
        }

        for (const model of customModels) {
            const modelElement = document.createElement('div');
            modelElement.className = 'model-item';
            
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
            
            const deleteButton = document.createElement('button');
            deleteButton.className = 'download-button delete-button';
            deleteButton.innerHTML = '<i class="fas fa-trash"></i> Delete';
            deleteButton.onclick = () => deleteCustomModel(model.name);
            
            actionContainer.appendChild(deleteButton);
            modelElement.appendChild(modelInfo);
            modelElement.appendChild(actionContainer);
            customModelsListElement.appendChild(modelElement);
        }
    } catch (error) {
        console.error('Error loading custom models:', error);
    }
}

// Dodaj funkcję usuwania custom modelu
async function deleteCustomModel(modelName) {
    if (confirm(`Are you sure you want to delete ${modelName}?`)) {
        try {
            await ipcRenderer.invoke('delete-custom-model', modelName);
            await loadCustomModels();
            await refreshModels();
        } catch (error) {
            console.error('Error deleting custom model:', error);
            alert(`Error deleting model: ${error.message}`);
        }
    }
}

// Funkcja do aktualizacji postępu pobierania modelu
function updateModelProgress(modelName, progress, status) {
    console.log('Updating progress for model:', modelName, progress, status);
    
    const modelItem = document.querySelector(`[data-model="${modelName}"]`);
    if (!modelItem) {
        console.error('Model item not found:', modelName);
        return;
    }

    const progressSection = modelItem.querySelector('.model-progress');
    const progressFill = modelItem.querySelector('.progress-fill');
    const progressText = modelItem.querySelector('.progress-text');
    const statusText = modelItem.querySelector('.model-status');
    const downloadButton = modelItem.querySelector('.download-button');

    // Pokaż sekcję postępu
    if (progressSection) {
        progressSection.style.display = 'block';
    }

    // Aktualizuj pasek postępu
    if (progressFill) {
        progressFill.style.width = `${progress}%`;
    }

    // Aktualizuj tekst procentowy
    if (progressText) {
        progressText.textContent = `${Math.round(progress)}%`;
    }

    // Aktualizuj status
    if (statusText && status) {
        statusText.textContent = status;
    }

    // Wycz przycisk podczas pobierania
    if (downloadButton) {
        downloadButton.disabled = progress > 0 && progress < 100;
    }

    // Jeśli pobieranie zakończone
    if (progress >= 100) {
        setTimeout(() => {
            refreshModels(); // Odśwież listę modeli
        }, 1000);
    }
}

// Nasłuchiwanie na postęp instalacji
ipcRenderer.on('model-install-progress', (event, data) => {
    console.log('Model installation progress:', data);
    if (data.modelName) {
        const progress = Math.round((data.downloadedSize / data.totalSize) * 100);
        const status = `Downloading: ${(data.downloadedSize / 1024 / 1024 / 1024).toFixed(2)}GB / ${(data.totalSize / 1024 / 1024 / 1024).toFixed(2)}GB`;
        updateModelProgress(data.modelName, progress, status);
    }
});

// Nasłuchiwanie na zakończenie instalacji
ipcRenderer.on('model-install-complete', (event, data) => {
    console.log('Model installation completed:', data);
    if (data.modelName) {
        updateModelProgress(data.modelName, 100, 'Installation completed');
    }
});

// Nasłuchiwanie na błędy instalacji
ipcRenderer.on('model-install-error', (event, error) => {
    console.error('Model installation error:', error);
    if (error.modelName) {
        updateModelProgress(error.modelName, 0, `Error: ${error.message}`);
    }
});

// Dodaj obsługę przycisku importu
document.getElementById('import-model-btn').addEventListener('click', () => {
    ipcRenderer.send('open-model-import');
});

// Dodaj nasłuchiwanie na status importu
ipcRenderer.on('import-status', (event, data) => {
    showToast(data.message);
});

// Dodaj obsługę błędów
ipcRenderer.on('import-error', (event, error) => {
    showToast(`Import error: ${error}`, 'error');
});

// Dodaj obsługę odpowiedzi z procesu importu
ipcRenderer.on('model-import-ready', () => {
    console.log('Model import window ready');
    setupImportWindowCloseHandler();
});

ipcRenderer.on('import-status', (event, data) => {
    console.log('Import status:', data);
    // Możesz dodać tutaj aktualizację UI pokazującą status importu
});

ipcRenderer.on('import-complete', () => {
    console.log('Import completed');
    refreshModels(); // Odśwież listę modeli po zakończeniu importu
});

ipcRenderer.on('import-error', (event, error) => {
    console.error('Import error:', error);
    // Możesz dodać tutaj obsługę błędów
});

// Dodaj funkcję do formatowania rozmiaru
function formatSize(bytes) {
    if (!bytes) return 'Unknown size';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = (bytes / Math.pow(1024, i)).toFixed(1);
    return `${size} ${sizes[i]}`;
}

// Zaktualizuj funkcję getSizeFromModelName
function getSizeFromModelName(modelName) {
    // Sprawdź różne formaty rozmiaru w nazwie modelu
    const sizePatterns = [
        /[:\-](\d+(?:\.\d+)?[bB])/, // standardowy format (np. :7b)
        /(\d+(?:\.\d+)?[bB])/, // sam rozmiar (np. 7b)
        /(\d+x\d+[bB])/ // format z mnożeniem (np. 8x7b)
    ];

    for (const pattern of sizePatterns) {
        const match = modelName.match(pattern);
        if (match) {
            // Konwertuj do jednolitego formatu
            let size = match[1].toUpperCase();
            
            // Obsłuż format z mnożeniem (np. 8x7B -> 56B)
            if (size.includes('X')) {
                const [a, b] = size.toLowerCase().replace('b', '').split('x').map(Number);
                size = `${a * b}B`;
            }
            
            return size;
        }
    }
    
    // Mapowanie znanych modeli na ich rozmiary
    const knownModelSizes = {
        'llama2': '7B',
        'mistral': '7B',
        'llava': '7B',
        'gemma': '7B',
        'phi3': '3B',
        'qwen': '7B',
        'vicuna': '7B',
        'yi': '6B'
    };

    // Sprawdź czy model jest w znanej liście
    for (const [baseModel, size] of Object.entries(knownModelSizes)) {
        if (modelName.toLowerCase().includes(baseModel.toLowerCase())) {
            return size;
        }
    }

    return null;
}

// Dodaj funkcję do renderowania kafelków modeli
async function renderModelTiles(models) {
    const textTilesContainer = document.getElementById('text-model-tiles');
    const visionTilesContainer = document.getElementById('vision-model-tiles');
    
    textTilesContainer.innerHTML = '';
    visionTilesContainer.innerHTML = '';

    // Pobierz aktualny status aby wiedzieć, które modele są wybrane
    const status = await ipcRenderer.invoke('refresh-ollama-status');
    
    for (const [category, modelsList] of Object.entries(models)) {
        for (const model of modelsList) {
            if (!model.installed) continue;

            let modelInfo;
            try {
                modelInfo = await ipcRenderer.invoke('get-model-info', model.id);
            } catch (error) {
                console.error(`Error getting info for model ${model.id}:`, error);
                modelInfo = {
                    parameters: getSizeFromModelName(model.id)
                };
            }

            const metadata = getModelMetadata(model.name);
            const modelSize = modelInfo.parameters || getSizeFromModelName(model.id) || 'Unknown size';
            
            const tile = document.createElement('div');
            tile.className = 'model-tile';
            
            // Sprawdź czy model jest aktualnie wybrany
            if ((metadata.category === 'Vision' && model.id === status.visionModel) ||
                (metadata.category !== 'Vision' && model.id === status.currentModel)) {
                tile.classList.add('selected');
            }
            
            tile.dataset.modelId = model.id;
            
            tile.innerHTML = `
                <div class="model-tile-header">
                    <div class="model-tile-icon">
                        <i class="fas ${metadata.icon}"></i>
                    </div>
                    <div class="model-tile-content">
                        <div class="model-tile-name">${model.name}</div>
                        <div class="model-tile-params">${modelSize}</div>
                    </div>
                    <div class="model-tile-tag ${model.category}">${model.category}</div>
                </div>
                <div class="model-tile-actions">
                    <button class="model-tile-delete" title="Delete model">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            // Dodaj obsługę kliknięcia
            tile.addEventListener('click', async (e) => {
                // Ignoruj kliknięcie w przycisk usuwania
                if (e.target.closest('.model-tile-delete')) return;

                const isVisionModel = metadata.category === 'Vision';
                const select = isVisionModel ? visionModelSelect : modelSelect;
                
                // Odznacz inne kafelki
                const container = isVisionModel ? visionTilesContainer : textTilesContainer;
                container.querySelectorAll('.model-tile').forEach(t => {
                    t.classList.remove('selected');
                });
                
                // Zaznacz wybrany kafelek
                tile.classList.add('selected');
                
                // Ustaw model w select i zapisz konfigurację
                select.value = model.id;
                saveBtn.disabled = false;
                
                // Automatycznie zapisz wybór
                try {
                    await ipcRenderer.invoke('save-config', {
                        model: isVisionModel ? modelSelect.value : model.id,
                        visionModel: isVisionModel ? model.id : visionModelSelect.value
                    });
                } catch (error) {
                    console.error('Error saving model selection:', error);
                }
            });

            // Dodaj obsługę usuwania
            const deleteButton = tile.querySelector('.model-tile-delete');
            deleteButton.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(`Are you sure you want to delete ${model.name}?`)) {
                    try {
                        await deleteModel(model.id);
                        tile.remove();
                    } catch (error) {
                        console.error('Error deleting model:', error);
                    }
                }
            });

            // Dodaj do odpowiedniego kontenera
            if (metadata.category === 'Vision') {
                visionTilesContainer.appendChild(tile);
            } else {
                textTilesContainer.appendChild(tile);
            }
        }
    }
}

// Zaktualizuj funkcj�� getModelFileSize
async function getModelFileSize(modelId) {
    try {
        // Najpierw spróbuj pobrać informacje o rozmiarze pliku poprzez API pull
        const response = await fetch(`${ollamaManager.getBaseUrl()}/api/pull`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: modelId,
                stream: false
            })
        });

        if (response.ok) {
            const data = await response.json();
            console.log(`Pull response for ${modelId}:`, data);
            if (data.total) {
                return data.total;
            }
        }

        // Jeśli nie udało się pobrać z pull, spróbuj z show
        const showResponse = await fetch(`${ollamaManager.getBaseUrl()}/api/show`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: modelId
            })
        });

        if (showResponse.ok) {
            const showData = await showResponse.json();
            console.log(`Show response for ${modelId}:`, showData);
            if (showData.size) {
                return showData.size;
            }
        }

        // Jeśli nie udało się pobrać z API, użyj mapowania
        const modelSizes = {
            'llama2:7b': 3.8 * 1024 * 1024 * 1024,
            'llama2:13b': 7.3 * 1024 * 1024 * 1024,
            'llama2:70b': 39.1 * 1024 * 1024 * 1024,
            // ... (reszta mapowania)
        };

        return modelSizes[modelId] || null;
    } catch (error) {
        console.error(`Error getting file size for model ${modelId}:`, error);
        return null;
    }
}

// Zaktualizuj funkcję estimateModelSize
function estimateModelSize(paramSize) {
    if (!paramSize) return null;
    
    // Wyciągnij liczbę z formatu (np. "7B" -> 7)
    const match = paramSize.toLowerCase().match(/(\d+(?:\.\d+)?)[xb]/);
    if (!match) return null;
    
    const number = parseFloat(match[1]);
    if (isNaN(number)) return null;
    
    // Oblicz rozmiar w GB dla formatu FP16 (2 bajty na parametr)
    // Wzór: (liczba_parametrów * 2 bajty) / (1024^3)
    // Dodajemy 20% na overhead (metadane, optymalizatory, itp.)
    const sizeInGB = Math.round((number * 1000000000 * 2 * 1.2) / (1024 * 1024 * 1024));
    
    // Jeśli rozmiar jest mniejszy niż 1GB, pokaż w MB
    if (sizeInGB < 1) {
        const sizeInMB = Math.round((number * 1000000000 * 2 * 1.2) / (1024 * 1024));
        return `${sizeInMB}MB`;
    }
    
    return `${sizeInGB}GB`;
}

// Zaktualizuj funkcję renderModels aby pokazywać tylko jeden rozmiar
async function renderModels(models) {
    // Sprawdź czy wszystkie potrzebne kontenery istnieją
    const containers = {
        'SFW': document.getElementById('sfw-models'),
        'NSFW': document.getElementById('nsfw-models'),
        'Vision': document.getElementById('vision-models'),
        'Other Models': document.getElementById('other-models')
    };

    // Sprawdź czy wszystkie kontenery istnieją
    for (const [category, container] of Object.entries(containers)) {
        if (!container) {
            console.error(`Container for ${category} not found`);
            return;
        }
    }

    // Wyczyść wszystkie kontenery
    Object.values(containers).forEach(container => {
        container.innerHTML = '';
    });

    // Renderuj modele dla każdej kategorii
    for (const [category, modelsList] of Object.entries(models)) {
        const containerElement = containers[category];
        if (!containerElement || !modelsList.length) continue;

        modelsList.sort((a, b) => a.name.localeCompare(b.name));

        for (const model of modelsList) {
            try {
                // Pobierz rozmiar parametrów
                const paramSize = getSizeFromModelName(model.id);
                console.log(`Parameter size for ${model.id}:`, paramSize);

                // Pobierz rzeczywisty rozmiar pliku
                let fileSize = null;
                if (!model.installed) {
                    const size = await getModelFileSize(model.id);
                    if (size) {
                        fileSize = formatSize(size);
                    }
                }

                // Użyj rzeczywistego rozmiaru pliku jeśli jest dostępny, w przeciwnym razie użyj oszacowanego
                const displaySize = fileSize || estimateModelSize(paramSize) || 'Unknown size';

                const modelElement = document.createElement('div');
                modelElement.className = `model-item ${model.installed ? 'installed' : ''}`;
                modelElement.dataset.model = model.id;
                modelElement.innerHTML = `
                    <div class="model-info">
                        <div class="model-name">
                            ${model.name}
                            ${paramSize ? `<span class="model-size">${paramSize}</span>` : ''}
                            <span class="model-file-size">${displaySize}</span>
                            <span class="category-tag ${model.category}">${model.category}</span>
                        </div>
                        <div class="model-status">
                            ${model.installed ? 'Installed' : 'Available'}
                        </div>
                    </div>
                    <div class="model-actions">
                        ${model.installed ? 
                            `<button class="model-button delete-button" data-model="${model.id}">
                                <i class="fas fa-trash"></i> Delete
                            </button>` :
                            `<button class="model-button install-button" data-model="${model.id}">
                                <i class="fas fa-download"></i> Install
                            </button>`
                        }
                    </div>
                `;

                // Dodaj event listenery
                const actionButton = modelElement.querySelector('.model-button');
                if (actionButton) {
                    actionButton.addEventListener('click', async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                            if (model.installed) {
                                await deleteModel(model.id);
                            } else {
                                await downloadModel(model.id);
                            }
                        } catch (error) {
                            console.error('Error handling model action:', error);
                            alert(`Error: ${error.message}`);
                        }
                    });
                }

                containerElement.appendChild(modelElement);
            } catch (error) {
                console.error(`Error rendering model ${model.id}:`, error);
                continue;
            }
        }
    }
    
    // Renderuj kafelki po zakończeniu renderowania listy
    await renderModelTiles(models);
}

// Dodaj funkcję sprawdzającą czy DOM jest gotowy
function waitForDOM() {
    return new Promise(resolve => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', resolve);
        } else {
            resolve();
        }
    });
}

// Add this function to handle closing the import window
function setupImportWindowCloseHandler() {
    const importWindowCloseBtn = document.getElementById('import-close-btn');
    if (importWindowCloseBtn) {
        importWindowCloseBtn.addEventListener('click', () => {
            window.close();
        });
    }
}

// Dodaj funkcję do obsługi rozwijania sekcji modeli
function initializeCollapsibleSections() {
    document.querySelectorAll('.category-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.parentElement.querySelector('.category-content');
            const icon = header.querySelector('.fas.fa-chevron-down');
            
            // Toggle expanded class
            content.classList.toggle('expanded');
            
            // Rotate icon
            if (content.classList.contains('expanded')) {
                icon.style.transform = 'rotate(0deg)';
            } else {
                icon.style.transform = 'rotate(-90deg)';
            }
        });
    });
}

// Dodaj tę funkcję na początku pliku
function expandAllCategories() {
    document.querySelectorAll('.category-content').forEach(content => {
        content.classList.add('expanded');
        const icon = content.parentElement.querySelector('.fas.fa-chevron-down');
        if (icon) {
            icon.style.transform = 'rotate(0deg)';
        }
    });
}

// Zaktualizuj funkcję getModelMetadata
function getModelMetadata(modelName) {
    const modelLower = modelName.toLowerCase();
    
    // Vision models
    if (modelLower.includes('llava') || 
        modelLower.includes('vision') ||
        modelLower.includes('bakllava')) {
        return { category: 'Vision', icon: 'fa-eye' };
    }
    
    // NSFW models
    if (modelLower.includes('dolphin') || 
        modelLower.includes('uncensored')) {
        return { category: 'NSFW', icon: 'fa-exclamation-triangle' };
    }
    
    // Other models (specific models that don't fit in SFW)
    const otherModels = ['aya', 'vicuna', 'wizardlm', 'yi'];
    if (otherModels.some(m => modelLower.includes(m))) {
        return { category: 'Other Models', icon: 'fa-cube' };
    }
    
    // SFW models (all remaining models including Mistral)
    const sfwModels = [
        'llama', 'mistral', 'mixtral', 
        'gemma', 'phi', 'qwen', 
        'neural', 'stable'
    ];
    if (sfwModels.some(m => modelLower.includes(m)) || 
        !otherModels.some(m => modelLower.includes(m))) {
        return { category: 'SFW', icon: 'fa-shield-alt' };
    }
    
    // Default fallback
    return { category: 'Other Models', icon: 'fa-cube' };
}

// W funkcji renderującej model dodaj tag kategorii
function renderModel(model) {
    const categoryClass = model.category.toLowerCase().replace(' ', '-');
    return `
        <div class="model-item ${model.installed ? 'installed' : ''}">
            <div class="model-info">
                <span class="model-name">${model.name}</span>
                <span class="category-tag ${categoryClass}">${model.category}</span>
                ${model.installed ? '<span class="installed-badge">Installed</span>' : ''}
            </div>
            <!-- reszta kodu renderowania modelu -->
        </div>
    `;
}

// Dodaj nową funkcję do aktualizacji selectów
async function updateModelSelects(status) {
    const models = await ipcRenderer.invoke('get-available-models');
    console.log('Available models:', models);
    
    // Aktualizuj select dla modeli tekstowych
    modelSelect.innerHTML = '<option value="">Select a model</option>';
    
    // Dodaj grupy dla różnych kategorii
    const categories = ['SFW', 'NSFW', 'Other Models'];
    categories.forEach(category => {
        if (models[category] && models[category].length > 0) {
            const group = document.createElement('optgroup');
            group.label = category;
            
            models[category].forEach(model => {
                if (model.installed) {
                    const option = document.createElement('option');
                    option.value = model.id;
                    option.textContent = model.name;
                    option.selected = status.currentModel === model.id;
                    group.appendChild(option);
                }
            });
            
            modelSelect.appendChild(group);
        }
    });
    
    // Aktualizuj select dla modeli wizyjnych
    visionModelSelect.innerHTML = '<option value="">Select a vision model</option>';
    const visionGroup = document.createElement('optgroup');
    visionGroup.label = 'Vision Models';
    
    if (models.Vision) {
        models.Vision.forEach(model => {
            if (model.installed) {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = model.name;
                option.selected = status.visionModel === model.id;
                visionGroup.appendChild(option);
            }
        });
    }
    
    visionModelSelect.appendChild(visionGroup);
}
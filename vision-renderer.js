const { ipcRenderer } = require('electron');

let selectedImage = null;
let analysisSource = 'prompt';
let lastAnalysisResult = null;

// Nasłuchuj na ustawienie źródła
ipcRenderer.on('set-source', (event, source) => {
    console.log('Setting analysis source:', source);
    analysisSource = source;
});

document.querySelector('.close-button').addEventListener('click', () => {
    window.close();
});

const dropZone = document.getElementById('drop-zone');
const previewImg = document.getElementById('preview');
const analyzeButton = document.getElementById('analyze');
const selectButton = document.getElementById('select-image');
const analysisSection = document.querySelector('.analysis-section');
const analysisResult = document.querySelector('.analysis-result');
const regenerateButton = document.getElementById('regenerate');
const regenerateDetailedButton = document.getElementById('regenerate-detailed');
const useButton = document.getElementById('use');
const modelSelect = document.getElementById('model-select');

// Obsługa przeciągania
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        handleImageSelection(file);
    }
});

// Obsługa przycisku wyboru
selectButton.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            handleImageSelection(file);
        }
    };
    input.click();
});

// Funkcja ładowania dostępnych modeli
async function loadAvailableModels() {
    try {
        // Pobierz modele Ollama
        const ollamaModels = await ipcRenderer.invoke('get-available-models');
        const visionModels = ollamaModels.filter(model => 
            model.type === 'Vision' && model.installed
        );
        
        // Pobierz custom modele
        const customModels = await ipcRenderer.invoke('get-custom-models');
        const customVisionModels = customModels.filter(model => model.type === 'Vision');
        
        // Połącz wszystkie modele
        const allModels = [
            ...visionModels.map(model => ({
                ...model,
                isCustom: false,
                displayName: model.name
            })),
            ...customVisionModels.map(model => ({
                id: model.name,
                name: model.displayName,
                type: 'Vision',
                isCustom: true,
                displayName: `${model.displayName} (Custom)`
            }))
        ];
        
        modelSelect.innerHTML = '<option value="">Select analysis model</option>';
        allModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.dataset.isCustom = model.isCustom;
            option.textContent = model.displayName;
            modelSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading models:', error);
    }
}

// Zaktualizuj funkcję analizy obrazu
async function analyzeImage(imageData, type) {
    try {
        const selectedOption = modelSelect.selectedOptions[0];
        if (!selectedOption) {
            throw new Error('Please select a model first');
        }

        const modelId = selectedOption.value;
        const isCustomModel = selectedOption.dataset.isCustom === 'true';
        
        console.log('Analyzing with model:', {
            modelId,
            isCustomModel,
            type
        });
        
        const result = await ipcRenderer.invoke(
            'analyze-image',
            imageData,
            type,
            isCustomModel,
            modelId
        );
        
        return result;
    } catch (error) {
        console.error('Error analyzing image:', error);
        throw error;
    }
}

// Obsługa przycisku analizy
analyzeButton.addEventListener('click', () => analyzeImage(selectedImage, analysisSource));

// Obsługa przycisku Regenerate Detailed
regenerateDetailedButton.addEventListener('click', () => {
    analysisResult.innerHTML = `
        <div class="analyzing">
            <div class="analyzing-spinner"></div>
            <span>Analyzing...</span>
        </div>
    `;
    analyzeImage(selectedImage, analysisSource, true);
});

// Zaktualizuj obsługę zwykłego przycisku Regenerate
regenerateButton.addEventListener('click', () => {
    analysisResult.innerHTML = `
        <div class="analyzing">
            <div class="analyzing-spinner"></div>
            <span>Analyzing...</span>
        </div>
    `;
    analyzeImage(selectedImage, analysisSource, false);
});

// Obsługa przycisku użycia wyniku
useButton.addEventListener('click', async () => {
    if (lastAnalysisResult) {
        if (analysisSource === 'style') {
            // Wyślij wynik do okna edycji stylu
            ipcRenderer.send('vision-analysis-complete', lastAnalysisResult, 'style');
        } else {
            // Wyślij wynik do głównego okna
            await ipcRenderer.invoke('set-prompt', lastAnalysisResult);
        }
        window.close();
    }
});

function handleImageSelection(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        selectedImage = e.target.result;
        previewImg.src = selectedImage;
        previewImg.style.display = 'block';
        dropZone.style.display = 'none';
        analyzeButton.disabled = false;
        analysisSection.style.display = 'none';
        analyzeButton.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

// Dodaj wywołanie loadAvailableModels przy starcie
document.addEventListener('DOMContentLoaded', loadAvailableModels);

// Dodaj obsługę zmiany modelu
modelSelect.addEventListener('change', () => {
    analyzeButton.disabled = !selectedImage || !modelSelect.value;
}); 
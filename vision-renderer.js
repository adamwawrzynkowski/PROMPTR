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

// Funkcja analizy obrazu
async function analyzeImage(detailed = false) {
    if (!selectedImage) return;
    
    try {
        analyzeButton.disabled = true;
        analyzeButton.style.display = 'none';
        analysisSection.style.display = 'block';
        analysisResult.innerHTML = `
            <div class="analyzing">
                <div class="analyzing-spinner"></div>
                <span>Analyzing...</span>
            </div>
        `;
        
        console.log('Sending image for analysis... Source:', analysisSource);
        const result = await ipcRenderer.invoke('analyze-image', selectedImage, detailed);
        console.log('Analysis result:', result);
        
        if (result) {
            lastAnalysisResult = result;
            showAnalysisResult(result);
        } else {
            throw new Error('No analysis result received');
        }
    } catch (error) {
        console.error('Error analyzing image:', error);
        analysisResult.innerHTML = `<div class="error">Error analyzing image: ${error.message}</div>`;
    }
}

// Funkcja pokazująca wynik analizy
function showAnalysisResult(result) {
    analysisResult.textContent = result;
    analysisSection.style.display = 'block';
    analyzeButton.style.display = 'none';
}

// Obsługa przycisku analizy
analyzeButton.addEventListener('click', () => analyzeImage(false));

// Obsługa przycisku Regenerate Detailed
regenerateDetailedButton.addEventListener('click', () => {
    analysisResult.innerHTML = `
        <div class="analyzing">
            <div class="analyzing-spinner"></div>
            <span>Analyzing...</span>
        </div>
    `;
    analyzeImage(true);
});

// Zaktualizuj obsługę zwykłego przycisku Regenerate
regenerateButton.addEventListener('click', () => {
    analysisResult.innerHTML = `
        <div class="analyzing">
            <div class="analyzing-spinner"></div>
            <span>Analyzing...</span>
        </div>
    `;
    analyzeImage(false);
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
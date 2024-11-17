const { ipcRenderer } = require('electron');

let selectedImage = null;

document.querySelector('.close-button').addEventListener('click', () => {
    window.close();
});

const dropZone = document.getElementById('drop-zone');
const previewImg = document.getElementById('preview');
const analyzeButton = document.getElementById('analyze');
const selectButton = document.getElementById('select-image');

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

// Obsługa analizy
analyzeButton.addEventListener('click', async () => {
    if (!selectedImage) return;
    
    try {
        analyzeButton.disabled = true;
        analyzeButton.innerHTML = `
            <i class="fas fa-magic"></i>
            Analyzing...
            <div class="loading-spinner"></div>
        `;
        
        console.log('Sending image for analysis...');
        const result = await ipcRenderer.invoke('analyze-image', selectedImage);
        console.log('Analysis result:', result);
        
        if (result) {
            console.log('Setting prompt:', result);
            await ipcRenderer.invoke('set-prompt', result);
            window.close();
        } else {
            throw new Error('No analysis result received');
        }
    } catch (error) {
        console.error('Error analyzing image:', error);
        alert('Error analyzing image: ' + error.message);
    } finally {
        analyzeButton.disabled = false;
        analyzeButton.innerHTML = '<i class="fas fa-magic"></i> Analyze Image';
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
    };
    reader.readAsDataURL(file);
} 
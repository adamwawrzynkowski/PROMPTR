const { ipcRenderer } = require('electron');

// Close button handler
document.querySelector('.titlebar-close').addEventListener('click', () => {
    window.close();
});

let selectedModel = null;
const progressFill = document.querySelector('.progress-fill');
const progressStatus = document.querySelector('.progress-status');
const continueBtn = document.getElementById('continue-btn');
const modelCards = document.querySelectorAll('.model-card');
const selectButtons = document.querySelectorAll('.select-model-btn');

// Disable all interactions during installation
function setInteractionState(disabled) {
    modelCards.forEach(card => {
        card.style.pointerEvents = disabled ? 'none' : 'auto';
    });
    selectButtons.forEach(button => {
        button.disabled = disabled;
    });
    continueBtn.disabled = disabled;
    document.querySelector('.titlebar-close').style.pointerEvents = disabled ? 'none' : 'auto';
}

// Listen for model installation progress updates
ipcRenderer.on('model-install-progress', (event, { progress, status }) => {
    progressFill.style.width = `${progress}%`;
    progressStatus.textContent = status;
});

// Check Ollama connection
async function checkOllamaConnection() {
    try {
        progressStatus.textContent = 'Checking Ollama connection...';
        progressFill.style.width = '30%';
        
        const isConnected = await ipcRenderer.invoke('check-ollama-connection');
        if (isConnected) {
            progressStatus.textContent = 'Connected to Ollama';
            progressFill.style.width = '100%';
            enableModelSelection();
        } else {
            progressStatus.textContent = 'Failed to connect to Ollama';
            progressFill.style.width = '0%';
        }
    } catch (error) {
        console.error('Error checking Ollama:', error);
        progressStatus.textContent = 'Error connecting to Ollama';
        progressFill.style.width = '0%';
    }
}

// Enable model selection
function enableModelSelection() {
    modelCards.forEach(card => {
        card.style.cursor = 'pointer';
        const selectBtn = card.querySelector('.select-model-btn');
        selectBtn.disabled = false;
    });
}

// Handle model selection
selectButtons.forEach(button => {
    button.addEventListener('click', async (e) => {
        e.stopPropagation();
        const card = e.target.closest('.model-card');
        if (!card) return;
        
        // Reset previous selection
        modelCards.forEach(c => {
            c.classList.remove('selected');
            c.querySelector('.select-model-btn').textContent = 'Select';
        });
        
        // Update new selection
        card.classList.add('selected');
        button.textContent = 'Selected';
        selectedModel = card.dataset.model;
        
        // Enable continue button
        continueBtn.disabled = false;
    });
});

// Handle continue button
continueBtn.addEventListener('click', async () => {
    if (!selectedModel) return;
    
    try {
        // Disable all interactions during installation
        setInteractionState(true);
        progressStatus.textContent = 'Starting model installation...';
        progressFill.style.width = '0%';
        
        const result = await ipcRenderer.invoke('install-model', selectedModel);
        if (result.success) {
            progressStatus.textContent = 'Model installed successfully. Starting application...';
            progressFill.style.width = '100%';
            
            // Complete onboarding and launch startup
            await ipcRenderer.invoke('complete-onboarding');
            window.close();
        } else {
            progressStatus.textContent = 'Failed to install model';
            progressFill.style.width = '0%';
            setInteractionState(false);
        }
    } catch (error) {
        console.error('Error installing model:', error);
        progressStatus.textContent = 'Error installing model';
        progressFill.style.width = '0%';
        setInteractionState(false);
    }
});

// Start checking Ollama connection
checkOllamaConnection();

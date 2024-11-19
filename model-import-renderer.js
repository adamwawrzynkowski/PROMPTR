const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    // Użyj requestAnimationFrame dla płynnych animacji
    let ticking = false;
    
    // Optymalizacja obsługi scroll
    document.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(() => {
                // Tutaj kod obsługi scroll
                ticking = false;
            });
            ticking = true;
        }
    });

    // Optymalizacja aktualizacji postępu
    ipcRenderer.on('import-progress', (event, data) => {
        if (!ticking) {
            requestAnimationFrame(() => {
                updateProgress(data);
                ticking = false;
            });
            ticking = true;
        }
    });

    function updateProgress(data) {
        const progressBar = document.querySelector('.progress-fill');
        const progressText = document.querySelector('.progress-text');
        
        progressBar.style.width = `${data.progress}%`;
        progressText.textContent = `${Math.round(data.progress)}%`;
    }

    // Wyłącz przycisk importu i dodaj informację o wersji beta
    const importButton = document.getElementById('import-btn');
    importButton.disabled = true;
    importButton.title = 'This feature is coming soon in the next version';

    // Obsługa przycisku zamykania
    const closeButton = document.querySelector('.close-button');
    closeButton.addEventListener('click', () => {
        window.close();
    });

    // Obsługa przycisku importowania
    const importStatus = document.querySelector('.import-status');
    const modelUrlInput = document.getElementById('model-url');

    importButton.addEventListener('click', () => {
        const modelUrl = modelUrlInput.value.trim();
        
        if (!modelUrl) {
            alert('Please enter a valid model URL');
            return;
        }

        // Pokazujemy sekcję statusu
        importStatus.style.display = 'block';
        
        // Wysyłamy żądanie do procesu głównego
        ipcRenderer.send('start-model-import', modelUrl);
    });

    // Obsługa aktualizacji statusu
    ipcRenderer.on('import-status', (event, data) => {
        const { step, message, isActive, isComplete } = data;
        
        // Pokaż sekcję statusu
        document.querySelector('.import-status').style.display = 'block';
        
        // Aktualizuj szczegóły statusu
        const statusDetails = document.querySelector('.status-details');
        if (message) {
            statusDetails.textContent = message;
            statusDetails.classList.toggle('error', step === 'error');
        }
        
        // Aktualizuj status kroków
        const steps = ['download', 'dependencies', 'convert'];
        steps.forEach(stepId => {
            const stepElement = document.getElementById(`step-${stepId}`);
            if (stepElement) {
                // Usuń wszystkie możliwe klasy statusu
                stepElement.classList.remove('active', 'completed', 'error');
                
                // Dodaj odpowiednią klasę
                if (stepId === step) {
                    if (isActive) stepElement.classList.add('active');
                    if (isComplete) stepElement.classList.add('completed');
                }
                
                // Aktualizuj ikonę
                const checkIcon = stepElement.querySelector('.fa-check');
                if (checkIcon) {
                    checkIcon.style.display = (stepId === step && isComplete) ? 'inline-block' : 'none';
                }
            }
        });
    });

    // Obsługa błędów
    ipcRenderer.on('import-error', (event, error) => {
        alert(`Import failed: ${error}`);
        importStatus.style.display = 'none';
    });

    // Obsługa zakończenia importu
    ipcRenderer.on('import-complete', () => {
        alert('Model imported successfully!');
        window.close();
    });

    ipcRenderer.on('import-status-update', (event, data) => {
        const { step, status, details } = data;
        
        // Update step status
        const stepElement = document.getElementById(`step-${step}`);
        if (stepElement) {
            // Remove all possible status classes
            stepElement.classList.remove('active', 'completed', 'error');
            
            // Add appropriate status class
            stepElement.classList.add(status);
            
            // Update checkmark visibility
            const checkmark = stepElement.querySelector('.fa-check');
            if (checkmark) {
                checkmark.style.display = status === 'completed' ? 'inline-block' : 'none';
            }
        }
        
        // Update status details if provided
        if (details) {
            const statusDetails = document.querySelector('.status-details');
            if (statusDetails) {
                statusDetails.textContent = details;
                statusDetails.classList.toggle('error', status === 'error');
            }
        }
    });
});

// Dodaj te funkcje do istniejącego pliku JavaScript

async function getRepositoryFiles(repoUrl) {
    // Użyj Hugging Face API do pobrania listy plików
    const apiUrl = `https://huggingface.co/api/models/${repoUrl.split('huggingface.co/')[1]}`;
    const response = await fetch(apiUrl);
    const repoInfo = await response.json();
    return repoInfo.siblings || [];
}

function updateFileStatus(fileName, status) {
    const filesContainer = document.querySelector('.files-container');
    let fileItem = filesContainer.querySelector(`[data-file="${fileName}"]`);
    
    if (!fileItem) {
        fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.setAttribute('data-file', fileName);
        fileItem.innerHTML = `
            <span class="file-name">${fileName}</span>
            <span class="file-status"></span>
        `;
        filesContainer.appendChild(fileItem);
    }
    
    const statusElement = fileItem.querySelector('.file-status');
    statusElement.className = `file-status ${status}`;
    
    switch (status) {
        case 'pending':
            statusElement.innerHTML = '<i class="fas fa-clock"></i>';
            break;
        case 'downloading':
            statusElement.innerHTML = '<i class="fas fa-download"></i>';
            break;
        case 'completed':
            statusElement.innerHTML = '<i class="fas fa-check"></i>';
            break;
        case 'error':
            statusElement.innerHTML = '<i class="fas fa-exclamation-circle"></i>';
            break;
    }
}

async function downloadModelFiles(repoUrl) {
    const files = await getRepositoryFiles(repoUrl);
    document.querySelector('.files-list').style.display = 'block';
    
    for (const file of files) {
        updateFileStatus(file.rfilename, 'pending');
    }
    
    for (const file of files) {
        try {
            updateFileStatus(file.rfilename, 'downloading');
            // Tutaj dodaj właściwą logikę pobierania pliku
            await downloadFile(file.rfilename, file.downloadUrl);
            updateFileStatus(file.rfilename, 'completed');
        } catch (error) {
            updateFileStatus(file.rfilename, 'error');
            console.error(`Error downloading ${file.rfilename}:`, error);
        }
    }
}

// ... (reszta istniejącego kodu) 
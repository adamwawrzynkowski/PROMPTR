const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    const importBtn = document.getElementById('import-btn');
    const modelUrlInput = document.getElementById('model-url');
    const importStatus = document.querySelector('.import-status');
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.querySelector('.progress-text');
    const statusDetails = document.querySelector('.status-details');
    const closeButton = document.querySelector('.close-button');
    const filesContainer = document.querySelector('.files-container');
    const statusMessage = document.querySelector('.status-message');
    const currentFile = document.querySelector('.current-file');
    const progressBar = document.querySelector('.progress-bar');

    // Funkcja do parsowania URL Hugging Face
    function parseHuggingFaceUrl(url) {
        try {
            const cleanUrl = url.trim().replace('https://huggingface.co/', '');
            const [owner, repo] = cleanUrl.split('/');
            return { owner, repo };
        } catch (error) {
            console.error('Error parsing URL:', error);
            return null;
        }
    }

    // Funkcja aktualizująca status kroku
    function updateStepStatus(stepId, status) {
        const step = document.getElementById(stepId);
        const statusIcon = step.querySelector('.step-status i');
        
        step.className = 'step ' + status;
        if (status === 'completed') {
            statusIcon.className = 'fas fa-check';
        } else if (status === 'error') {
            statusIcon.className = 'fas fa-times';
        } else if (status === 'active') {
            statusIcon.className = 'fas fa-spinner fa-spin';
        }
    }

    // Funkcja do aktualizacji statusu pliku
    function updateFileStatus(fileName, status, progress = null) {
        let fileItem = filesContainer.querySelector(`[data-file="${fileName}"]`);
        
        if (!fileItem) {
            fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.setAttribute('data-file', fileName);
            fileItem.innerHTML = `
                <span class="file-name">${fileName}</span>
                <span class="file-status"></span>
                ${progress !== null ? `<span class="file-progress">${progress}%</span>` : ''}
            `;
            filesContainer.appendChild(fileItem);
        }
        
        const statusElement = fileItem.querySelector('.file-status');
        statusElement.className = `file-status ${status}`;
        
        switch (status) {
            case 'pending':
                statusElement.innerHTML = '<i class="fas fa-clock"></i> Waiting';
                break;
            case 'downloading':
                statusElement.innerHTML = '<i class="fas fa-download"></i> Downloading';
                if (progress !== null) {
                    fileItem.querySelector('.file-progress').textContent = `${progress}%`;
                }
                break;
            case 'completed':
                statusElement.innerHTML = '<i class="fas fa-check"></i> Complete';
                break;
            case 'error':
                statusElement.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error';
                break;
        }
    }

    // Nasłuchuj na zmiany w polu URL
    modelUrlInput.addEventListener('input', () => {
        const url = modelUrlInput.value.trim();
        importBtn.disabled = !url.includes('huggingface.co/');
    });

    // Obsługa przycisku importu
    importBtn.addEventListener('click', async () => {
        const modelUrl = modelUrlInput.value.trim();
        if (!modelUrl) return;

        try {
            const repoInfo = parseHuggingFaceUrl(modelUrl);
            if (!repoInfo) {
                throw new Error('Invalid Hugging Face URL');
            }

            // Pokaż status importu
            importStatus.style.display = 'block';
            importBtn.disabled = true;
            filesContainer.innerHTML = ''; // Wyczyść listę plików

            // Reset statusów
            updateStepStatus('step-download', 'active');
            updateStepStatus('step-dependencies', '');
            updateStepStatus('step-convert', '');
            progressFill.style.width = '0%';
            progressText.textContent = '0%';
            statusDetails.textContent = 'Starting download...';

            // Rozpocznij import modelu
            ipcRenderer.send('start-model-import', modelUrl);
        } catch (error) {
            console.error('Error starting import:', error);
            statusDetails.textContent = `Error: ${error.message}`;
            statusDetails.className = 'status-details error';
        }
    });

    // Obsługa postępu pobierania plików
    ipcRenderer.on('file-download-progress', (event, data) => {
        const { fileName, progress } = data;
        updateFileStatus(fileName, 'downloading', progress);
    });

    // Obsługa zakończenia pobierania pliku
    ipcRenderer.on('file-download-complete', (event, data) => {
        const { fileName } = data;
        updateFileStatus(fileName, 'completed');
    });

    // Obsługa błędu pobierania pliku
    ipcRenderer.on('file-download-error', (event, data) => {
        const { fileName, error } = data;
        updateFileStatus(fileName, 'error');
        console.error(`Error downloading ${fileName}:`, error);
    });

    // Obsługa postępu importu
    ipcRenderer.on('import-progress', (event, data) => {
        progressFill.style.width = `${data.progress}%`;
        progressText.textContent = `${Math.round(data.progress)}%`;
    });

    // Obsługa statusu importu
    ipcRenderer.on('import-status', (event, status) => {
        const statusMessage = document.querySelector('.status-message');
        const statusDetails = document.querySelector('.status-details');
        const currentFile = document.querySelector('.current-file');
        const progressBar = document.querySelector('.progress-bar');

        // Aktualizuj status kroków na podstawie etapu
        switch(status.step) {
            case 'initialize':
                updateStep('step-download', 'active');
                updateStep('step-dependencies', '');
                updateStep('step-convert', '');
                break;
            case 'download':
                updateStep('step-download', 'active');
                break;
            case 'dependencies':
                updateStep('step-download', 'completed');
                updateStep('step-dependencies', 'active');
                break;
            case 'convert':
                updateStep('step-dependencies', 'completed');
                updateStep('step-convert', 'active');
                break;
            case 'complete':
                updateStep('step-download', 'completed');
                updateStep('step-dependencies', 'completed');
                updateStep('step-convert', 'completed');
                break;
        }

        // Aktualizuj informacje o statusie
        statusMessage.textContent = status.message;
        if (status.details) {
            statusDetails.textContent = status.details;
            statusDetails.style.display = 'block';
        } else {
            statusDetails.style.display = 'none';
        }
        
        if (status.currentFile) {
            currentFile.textContent = status.currentFile;
            currentFile.style.display = 'block';
        } else {
            currentFile.style.display = 'none';
        }

        if (status.progress !== undefined) {
            progressBar.style.width = `${status.progress}%`;
        }
    });

    // Obsługa zakończenia importu
    ipcRenderer.on('import-complete', () => {
        updateStepStatus('step-convert', 'completed');
        statusDetails.textContent = 'Import completed successfully!';
        importBtn.disabled = false;
    });

    // Obsługa błędów
    ipcRenderer.on('import-error', (event, error) => {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = error.message;
        document.body.appendChild(errorDiv);
    });

    // Obsługa przycisku zamykania
    closeButton.addEventListener('click', () => {
        ipcRenderer.send('close-model-import-window');
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

// Dodaj funkcję do aktualizacji kroków
function updateStep(stepId, status) {
    const step = document.getElementById(stepId);
    const icon = step.querySelector('.step-icon i');
    
    // Usuń wszystkie klasy statusu
    step.classList.remove('active', 'completed', 'error');
    
    // Dodaj odpowiednią klasę
    if (status) {
        step.classList.add(status);
    }
    
    // Zaktualizuj ikonę
    switch(status) {
        case 'active':
            icon.className = 'fas fa-spinner fa-spin';
            break;
        case 'completed':
            icon.className = 'fas fa-check';
            break;
        case 'error':
            icon.className = 'fas fa-times';
            break;
        default:
            // Przywróć domyślną ikonę
            switch(stepId) {
                case 'step-download':
                    icon.className = 'fas fa-download';
                    break;
                case 'step-dependencies':
                    icon.className = 'fas fa-cogs';
                    break;
                case 'step-convert':
                    icon.className = 'fas fa-sync';
                    break;
            }
    }
}

// ... (reszta istniejącego kodu) 
const { ipcRenderer } = require('electron');

// Theme synchronization
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
    
    // Request current theme on load
    console.log('Requesting current theme...');
    ipcRenderer.send('get-current-theme');
    
    // Listen for theme changes
    ipcRenderer.on('theme-changed', (_, theme) => {
        console.log('Theme changed event received:', theme);
        
        // Remove any existing theme classes from both html and body
        const themeClasses = Array.from(document.body.classList)
            .filter(className => className.startsWith('theme-'));
        themeClasses.forEach(className => {
            document.documentElement.classList.remove(className);
            document.body.classList.remove(className);
        });
        
        // Make sure theme has the correct prefix
        const themeClass = theme.startsWith('theme-') ? theme : `theme-${theme}`;
        console.log('Applying theme class:', themeClass);
        
        // Add new theme class to both html and body
        document.documentElement.classList.add(themeClass);
        document.body.classList.add(themeClass);
        
        // Log final state
        console.log('Final HTML class:', document.documentElement.className);
        console.log('Final body class:', document.body.className);
        console.log('Computed styles:', {
            themeColor: getComputedStyle(document.documentElement).getPropertyValue('--theme-color'),
            themeColorBack: getComputedStyle(document.documentElement).getPropertyValue('--theme-color-back'),
            accentPrimary: getComputedStyle(document.documentElement).getPropertyValue('--accent-primary')
        });
    });
});

// Window controls
document.getElementById('minimize-button').addEventListener('click', () => {
    ipcRenderer.send('minimize-vision');
});

document.getElementById('maximize-button').addEventListener('click', () => {
    ipcRenderer.send('maximize-vision');
});

document.getElementById('close-button').addEventListener('click', () => {
    ipcRenderer.send('close-vision');
});

// File handling
const dropZone = document.getElementById('vision-drop-zone');
const fileInput = document.getElementById('file-input');
const previewImage = document.getElementById('preview-image');
const selectBtn = document.getElementById('select-btn');
const visionBtn = document.getElementById('vision-btn');
let currentFile = null;

// Handle drag & drop
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
        handleFile(file);
    }
});

// Handle file selection via button
selectBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
});

function handleFile(file) {
    currentFile = file;
    
    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        previewImage.hidden = false;
        document.querySelector('.drop-zone-content').style.display = 'none';
        visionBtn.disabled = false;
    };
    reader.readAsDataURL(file);
}

// Vision button
visionBtn.addEventListener('click', async () => {
    if (!currentFile) {
        return;
    }

    visionBtn.disabled = true;
    visionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    try {
        // Read file as base64
        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64Image = e.target.result.split(',')[1];
            
            // Send to main process
            const result = await ipcRenderer.invoke('analyze-image', base64Image);
            
            // Handle result
            if (result) {
                // Send result back to main window
                ipcRenderer.send('vision-result', result);
                
                // Close vision window
                ipcRenderer.send('close-vision');
            }
        };
        reader.readAsDataURL(currentFile);
    } catch (error) {
        console.error('Error processing image:', error);
    } finally {
        visionBtn.disabled = false;
        visionBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Analyze Image';
    }
});
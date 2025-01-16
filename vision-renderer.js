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

    // Window controls
    document.getElementById('minimize-button')?.addEventListener('click', () => {
        ipcRenderer.send('minimize-vision');
    });

    document.getElementById('maximize-button')?.addEventListener('click', () => {
        ipcRenderer.send('maximize-vision');
    });

    document.getElementById('close-button')?.addEventListener('click', () => {
        ipcRenderer.send('close-vision');
    });

    // File handling
    const dropZone = document.getElementById('vision-drop-zone');
    const fileInput = document.getElementById('file-input');
    const previewImage = document.getElementById('preview-image');
    const selectBtn = document.getElementById('select-button');
    let currentFile = null;

    // Handle drag & drop
    if (dropZone) {
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
    }

    // Handle file selection via button
    if (selectBtn && fileInput) {
        selectBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleFile(file);
            }
        });
    }

    // Event listeners for feature buttons
    document.querySelectorAll('.run-btn').forEach(button => {
        button.addEventListener('click', async () => {
            console.log('Run button clicked, feature:', button.getAttribute('data-feature'));
            const feature = button.getAttribute('data-feature');
            
            if (!window.currentImage) {
                alert('Please upload an image first');
                return;
            }
            
            if (feature === 'interpreter') {
                console.log('Opening style selector...');
                // Open style selector window
                ipcRenderer.send('open-style-selector');
                return;
            }
            
            // Get the instructions
            const instructions = document.getElementById('vision-prompt')?.value || '';
            
            // Show loading state
            button.disabled = true;
            const originalText = button.innerHTML;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            
            try {
                console.log('Analyzing image with feature:', feature);
                // Analyze the image
                const result = await ipcRenderer.invoke('analyze-image', {
                    image: window.currentImage,
                    instructions: instructions,
                    feature: feature
                });
                
                // Update result area
                const resultContent = document.getElementById('result-content');
                if (resultContent) {
                    resultContent.textContent = result;
                    
                    // Show result area
                    const analysisResult = document.getElementById('analysis-result');
                    if (analysisResult) {
                        analysisResult.style.display = 'block';
                    }
                }
            } catch (error) {
                console.error('Error analyzing image:', error);
                alert('Error analyzing image: ' + error.message);
            } finally {
                // Restore button state
                button.disabled = false;
                button.innerHTML = originalText;
            }
        });
    });

    // Handle style selection for interpreter
    ipcRenderer.on('style-selected-for-interpreter', async (event, style) => {
        console.log('Style selected:', style);
        // Get the interpreter button
        const interpreterButton = document.querySelector('.run-btn[data-feature="interpreter"]');
        
        if (!interpreterButton) {
            console.error('Interpreter button not found');
            return;
        }
        
        // Show loading state
        interpreterButton.disabled = true;
        const originalText = interpreterButton.innerHTML;
        interpreterButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        
        try {
            // Use the style's instructions for interpretation
            const instructions = `Interpret this image in the style of: ${style.name}\n${style.description || ''}`;
            
            console.log('Analyzing image with style:', style.name);
            // Analyze the image with the selected style
            const result = await ipcRenderer.invoke('analyze-image', {
                image: window.currentImage,
                instructions: instructions,
                feature: 'interpreter'
            });
            
            // Update result area
            const resultContent = document.getElementById('result-content');
            if (resultContent) {
                resultContent.textContent = result;
                
                // Show result area
                const analysisResult = document.getElementById('analysis-result');
                if (analysisResult) {
                    analysisResult.style.display = 'block';
                }
            }
        } catch (error) {
            console.error('Error analyzing image:', error);
            alert('Error analyzing image: ' + error.message);
        } finally {
            // Restore button state
            interpreterButton.disabled = false;
            interpreterButton.innerHTML = originalText;
        }
    });
});

// Handle file upload
function handleFile(file) {
    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        const previewImage = document.getElementById('preview-image');
        if (previewImage) {
            previewImage.src = e.target.result;
            previewImage.hidden = false;
            
            const dropZoneContent = document.querySelector('.drop-zone-content');
            if (dropZoneContent) {
                dropZoneContent.style.display = 'none';
            }
            
            // Store the base64 image
            window.currentImage = e.target.result;
            
            // Enable all run buttons
            document.querySelectorAll('.run-btn').forEach(button => {
                button.disabled = false;
            });
        }
    };
    reader.readAsDataURL(file);
}
const { ipcRenderer } = require('electron');
const Store = require('electron-store');
const store = new Store();

let currentStyleId = null;
let selectedIcon = 'paint-brush';
let nameInput, descriptionInput, prefixInput, suffixInput, systemInstructionsInput, tagsInput;
let temperatureInput, topKInput, topPInput, temperatureValue, topKValue, topPValue;
let pendingStyleData = null;

// Function to populate form with style data
function populateFormWithStyle(style) {
    console.log('Populating form with style:', style);
    if (style && style.id) {
        currentStyleId = style.id;
        document.getElementById('window-title').textContent = 'Edit Style';
        
        if (nameInput) nameInput.value = style.name || '';
        if (descriptionInput) descriptionInput.value = style.description || '';
        if (prefixInput) prefixInput.value = style.prefix || '';
        if (suffixInput) suffixInput.value = style.suffix || '';
        if (systemInstructionsInput) systemInstructionsInput.value = style.systemInstructions || '';
        if (tagsInput) tagsInput.value = (style.fixedTags || []).join(', ');
        selectedIcon = style.icon || 'paint-brush';
        
        // Check both modelParams and modelParameters for compatibility
        const params = style.modelParams || style.modelParameters || {};
        if (temperatureInput) {
            temperatureInput.value = params.temperature || 0.7;
            updateParamValue(temperatureInput, temperatureValue);
        }
        if (topKInput) {
            topKInput.value = params.top_k || params.topK || 40;
            updateParamValue(topKInput, topKValue);
        }
        if (topPInput) {
            topPInput.value = params.top_p || params.topP || 0.9;
            updateParamValue(topPInput, topPValue);
        }
        
        if (typeof renderIconsGrid === 'function') {
            renderIconsGrid();
        }
    }
}

// Handle receiving style data
ipcRenderer.on('style-data', (event, style) => {
    console.log('Received style data in renderer:', style);
    if (document.readyState === 'complete') {
        console.log('Document ready, populating form');
        populateFormWithStyle(style);
    } else {
        console.log('Document not ready, storing style data');
        pendingStyleData = style;
    }
});

// Also listen for the old event for backward compatibility
ipcRenderer.on('edit-style', async (event, styleId) => {
    console.log('Received edit-style event with ID:', styleId);
    try {
        // Request the style data from the main process
        const style = await ipcRenderer.invoke('get-style', styleId);
        console.log('Retrieved style data:', style);
        if (document.readyState === 'complete') {
            populateFormWithStyle(style);
        } else {
            pendingStyleData = style;
        }
    } catch (error) {
        console.error('Error getting style data:', error);
    }
});

// Update parameter value displays
function updateParamValue(input, display) {
    if (input && display) {
        display.textContent = input.value;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded');
    // Initialize theme
    const theme = store.get('settings.theme', 'purple');
    document.body.className = `theme-${theme}`;

    // Initialize UI elements
    const closeBtn = document.getElementById('close-btn');
    const saveBtn = document.getElementById('save-btn');
    nameInput = document.getElementById('style-name');
    descriptionInput = document.getElementById('style-description');
    prefixInput = document.getElementById('style-prefix');
    suffixInput = document.getElementById('style-suffix');
    systemInstructionsInput = document.getElementById('system-instructions');
    tagsInput = document.getElementById('style-tags');
    const iconsGrid = document.getElementById('icons-grid');
    const generateInstructionsBtn = document.getElementById('generate-instructions-btn');
    
    // Model parameters elements
    temperatureInput = document.getElementById('temperature');
    topKInput = document.getElementById('top-k');
    topPInput = document.getElementById('top-p');
    temperatureValue = document.getElementById('temperature-value');
    topKValue = document.getElementById('top-k-value');
    topPValue = document.getElementById('top-p-value');

    // If we received style data before DOM was ready, populate it now
    if (pendingStyleData) {
        populateFormWithStyle(pendingStyleData);
        pendingStyleData = null;
    }

    // Lista dostępnych ikon
    const availableIcons = [
        'paint-brush', 'palette', 'image', 'camera', 'film', 'video',
        'magic', 'wand-magic-sparkles', 'star', 'sparkles', 'sun',
        'moon', 'cloud', 'fire', 'bolt', 'heart', 'diamond',
        'gem', 'crown', 'dragon', 'feather', 'leaf', 'tree',
        'mountain', 'water', 'wind', 'eye', 'brush', 'pen',
        'pencil', 'paintbrush', 'spray-can', 'swatchbook'
    ];

    // Render icons grid
    function renderIconsGrid() {
        iconsGrid.innerHTML = availableIcons
            .map(icon => `
                <div class="icon-option ${icon === selectedIcon ? 'selected' : ''}" 
                     data-icon="${icon}" 
                     title="${icon}">
                    <i class="fas fa-${icon}"></i>
                </div>
            `)
            .join('');

        // Add event listeners to icons
        document.querySelectorAll('.icon-option').forEach(option => {
            option.addEventListener('click', () => {
                document.querySelectorAll('.icon-option').forEach(opt => 
                    opt.classList.remove('selected'));
                option.classList.add('selected');
                selectedIcon = option.dataset.icon;
            });
        });
    }

    temperatureInput.addEventListener('input', () => updateParamValue(temperatureInput, temperatureValue));
    topKInput.addEventListener('input', () => updateParamValue(topKInput, topKValue));
    topPInput.addEventListener('input', () => updateParamValue(topPInput, topPValue));

    // Handle generating instructions
    generateInstructionsBtn.addEventListener('click', async () => {
        try {
            const description = descriptionInput.value.trim();
            if (!description) {
                await ipcRenderer.invoke('show-message', {
                    type: 'error',
                    message: 'Error',
                    detail: 'Please enter a description first.'
                });
                return;
            }

            // Update loading state
            generateInstructionsBtn.disabled = true;
            document.getElementById('generate-loading').classList.add('active');

            const instructions = await ipcRenderer.invoke('generate-system-instructions', description);
            if (instructions) {
                systemInstructionsInput.value = instructions;
            }
        } catch (error) {
            console.error('Error generating instructions:', error);
            await ipcRenderer.invoke('show-message', {
                type: 'error',
                message: 'Error',
                detail: 'Failed to generate instructions. Please try again.'
            });
        } finally {
            // Reset loading state
            generateInstructionsBtn.disabled = false;
            document.getElementById('generate-loading').classList.remove('active');
        }
    });

    // Handle saving style
    saveBtn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        const description = descriptionInput.value.trim();
        const prefix = prefixInput.value.trim();
        const suffix = suffixInput.value.trim();
        const systemInstructions = systemInstructionsInput.value.trim();
        const tags = tagsInput.value.split(',').map(tag => tag.trim()).filter(tag => tag);

        if (!name) {
            await ipcRenderer.invoke('show-message', {
                type: 'error',
                message: 'Error',
                detail: 'Please enter a style name.'
            });
            return;
        }

        if (!prefix) {
            await ipcRenderer.invoke('show-message', {
                type: 'error',
                message: 'Error',
                detail: 'Please enter a prompt prefix.'
            });
            return;
        }

        if (!suffix) {
            await ipcRenderer.invoke('show-message', {
                type: 'error',
                message: 'Error',
                detail: 'Please enter a prompt suffix.'
            });
            return;
        }

        const style = {
            id: currentStyleId,
            name,
            description,
            prefix,
            suffix,
            icon: selectedIcon,
            systemInstructions,
            fixedTags: tags,
            modelParams: {
                temperature: parseFloat(temperatureInput.value),
                topK: parseInt(topKInput.value),
                topP: parseFloat(topPInput.value)
            },
            custom: true
        };

        try {
            await ipcRenderer.invoke('save-style', style);
            ipcRenderer.send('styles-updated');
            window.close();
        } catch (error) {
            console.error('Error saving style:', error);
            await ipcRenderer.invoke('show-message', {
                type: 'error',
                message: 'Error',
                detail: 'Failed to save style. Please try again.'
            });
        }
    });

    // Close button handler
    closeBtn.addEventListener('click', () => {
        window.close();
    });

    // Initial render
    renderIconsGrid();
});
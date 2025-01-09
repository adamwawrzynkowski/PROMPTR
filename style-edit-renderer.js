const { ipcRenderer } = require('electron');
const Store = require('electron-store');
const store = new Store();

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize theme
    const theme = store.get('settings.theme', 'purple');
    document.body.className = `theme-${theme}`;

    // Initialize UI elements
    const closeBtn = document.getElementById('close-btn');
    const saveBtn = document.getElementById('save-btn');
    const nameInput = document.getElementById('style-name');
    const descriptionInput = document.getElementById('style-description');
    const prefixInput = document.getElementById('style-prefix');
    const suffixInput = document.getElementById('style-suffix');
    const systemInstructionsInput = document.getElementById('system-instructions');
    const tagsInput = document.getElementById('style-tags');
    const iconsGrid = document.getElementById('icons-grid');
    const generateInstructionsBtn = document.getElementById('generate-instructions-btn');
    
    // Model parameters elements
    const temperatureInput = document.getElementById('temperature');
    const topKInput = document.getElementById('top-k');
    const topPInput = document.getElementById('top-p');
    const temperatureValue = document.getElementById('temperature-value');
    const topKValue = document.getElementById('top-k-value');
    const topPValue = document.getElementById('top-p-value');

    let currentStyleId = null;
    let selectedIcon = 'paint-brush';

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

    // Update parameter value displays
    function updateParamValue(input, display) {
        display.textContent = input.value;
    }

    temperatureInput.addEventListener('input', () => updateParamValue(temperatureInput, temperatureValue));
    topKInput.addEventListener('input', () => updateParamValue(topKInput, topKValue));
    topPInput.addEventListener('input', () => updateParamValue(topPInput, topPValue));

    // Generate system instructions from description
    generateInstructionsBtn.addEventListener('click', async () => {
        const description = descriptionInput.value.trim();
        if (!description) {
            await ipcRenderer.invoke('show-message', {
                type: 'error',
                message: 'Error',
                detail: 'Please enter a description first.'
            });
            return;
        }

        try {
            const instructions = await ipcRenderer.invoke('generate-system-instructions', description);
            systemInstructionsInput.value = instructions;
        } catch (error) {
            console.error('Error generating instructions:', error);
            await ipcRenderer.invoke('show-message', {
                type: 'error',
                message: 'Error',
                detail: 'Failed to generate instructions. Please try again.'
            });
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

    // Handle editing existing style
    ipcRenderer.on('edit-style', async (event, styleId) => {
        currentStyleId = styleId;
        document.getElementById('window-title').textContent = 'Edit Style';
        
        try {
            const style = await ipcRenderer.invoke('get-style', styleId);
            if (style) {
                nameInput.value = style.name || '';
                descriptionInput.value = style.description || '';
                prefixInput.value = style.prefix || '';
                suffixInput.value = style.suffix || '';
                systemInstructionsInput.value = style.systemInstructions || '';
                tagsInput.value = (style.fixedTags || []).join(', ');
                selectedIcon = style.icon || 'paint-brush';
                
                if (style.modelParams) {
                    temperatureInput.value = style.modelParams.temperature || 0.7;
                    topKInput.value = style.modelParams.topK || 40;
                    topPInput.value = style.modelParams.topP || 0.9;
                    
                    updateParamValue(temperatureInput, temperatureValue);
                    updateParamValue(topKInput, topKValue);
                    updateParamValue(topPInput, topPValue);
                }
                
                renderIconsGrid();
            }
        } catch (error) {
            console.error('Error loading style:', error);
            await ipcRenderer.invoke('show-message', {
                type: 'error',
                message: 'Error',
                detail: 'Failed to load style. Please try again.'
            });
            window.close();
        }
    });

    // Close button handler
    closeBtn.addEventListener('click', () => {
        window.close();
    });

    // Initial render
    renderIconsGrid();
});
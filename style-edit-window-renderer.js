const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    const styleNameInput = document.getElementById('style-name');
    const styleDescriptionInput = document.getElementById('style-description');
    const stylePrefixInput = document.getElementById('style-prefix');
    const styleSuffixInput = document.getElementById('style-suffix');
    const systemInstructionsInput = document.getElementById('system-instructions');
    const iconsGrid = document.getElementById('icons-grid');
    const windowTitle = document.getElementById('window-title');
    const saveBtn = document.getElementById('save-btn');
    const closeBtn = document.getElementById('close-btn');
    const generateInstructionsBtn = document.getElementById('generate-instructions-btn');

    let currentStyle = null;
    let selectedIcon = null;

    // Lista dostępnych ikon
    const availableIcons = [
        'paint-brush', 'palette', 'image', 'camera', 'film', 'video',
        'magic', 'wand-magic-sparkles', 'star', 'sparkles', 'sun',
        'moon', 'cloud', 'heart', 'circle', 'square', 'diamond',
        'pen', 'pencil', 'brush', 'pen-nib', 'pen-fancy', 'marker'
    ];

    // Tworzenie siatki ikon
    function createIconsGrid() {
        iconsGrid.innerHTML = '';
        availableIcons.forEach(iconName => {
            const iconDiv = document.createElement('div');
            iconDiv.className = 'icon-option';
            iconDiv.innerHTML = `<i class="fas fa-${iconName}"></i>`;
            iconDiv.dataset.icon = iconName;
            
            iconDiv.addEventListener('click', () => {
                document.querySelectorAll('.icon-option').forEach(el => el.classList.remove('selected'));
                iconDiv.classList.add('selected');
                selectedIcon = iconName;
            });

            iconsGrid.appendChild(iconDiv);
        });
    }

    // Nasłuchiwanie na dane stylu
    ipcRenderer.on('style-data', (event, style) => {
        console.log('Received style data:', style);
        currentStyle = style;
        
        // Aktualizacja tytułu okna
        windowTitle.textContent = style.id ? 'Edit Style' : 'New Style';
        
        // Wypełnianie pól formularza
        if (style.id) {
            styleNameInput.value = style.name || '';
            styleDescriptionInput.value = style.description || '';
            stylePrefixInput.value = style.prefix || '';
            styleSuffixInput.value = style.suffix || '';
            systemInstructionsInput.value = style.systemInstructions || '';
            
            // Zaznaczanie wybranej ikony
            if (style.icon) {
                selectedIcon = style.icon;
                setTimeout(() => {
                    const iconElement = document.querySelector(`[data-icon="${style.icon}"]`);
                    if (iconElement) {
                        iconElement.classList.add('selected');
                    }
                }, 100);
            }
        }
    });

    // Zapisywanie stylu
    async function saveStyle() {
        const styleData = {
            ...(currentStyle || {}),
            name: styleNameInput.value,
            description: styleDescriptionInput.value,
            prefix: stylePrefixInput.value,
            suffix: styleSuffixInput.value,
            systemInstructions: systemInstructionsInput.value,
            icon: selectedIcon,
            custom: true
        };

        try {
            console.log('Saving style:', styleData);
            await ipcRenderer.invoke('save-style', styleData);
            window.close();
        } catch (error) {
            console.error('Error saving style:', error);
        }
    }

    // Generowanie instrukcji systemowych
    async function generateInstructions() {
        const description = styleDescriptionInput.value;
        if (!description) {
            console.log('Description is required to generate instructions');
            return;
        }

        try {
            const instructions = await ipcRenderer.invoke('generate-system-instructions', description);
            if (instructions) {
                systemInstructionsInput.value = instructions;
            }
        } catch (error) {
            console.error('Error generating instructions:', error);
        }
    }

    // Event listeners
    if (saveBtn) {
        saveBtn.addEventListener('click', saveStyle);
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => window.close());
    }
    
    if (generateInstructionsBtn) {
        generateInstructionsBtn.addEventListener('click', generateInstructions);
    }

    // Inicjalizacja siatki ikon
    createIconsGrid();
    
    // Inicjalizacja Store i motywu
    const store = new Store();
    const theme = store.get('settings.theme', 'purple');
    document.body.className = `theme-${theme}`;
});

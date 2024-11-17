const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', async () => {
    const closeBtn = document.getElementById('close-btn');
    const saveBtn = document.getElementById('save-btn');
    const nameInput = document.getElementById('style-name');
    const descriptionInput = document.getElementById('style-description');
    const tagsInput = document.getElementById('style-tags');
    const iconsGrid = document.getElementById('icons-grid');
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

    // Funkcja do renderowania siatki ikon
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

        // Dodaj event listenery do ikon
        document.querySelectorAll('.icon-option').forEach(option => {
            option.addEventListener('click', () => {
                document.querySelectorAll('.icon-option').forEach(opt => 
                    opt.classList.remove('selected'));
                option.classList.add('selected');
                selectedIcon = option.dataset.icon;
            });
        });
    }

    // Obsługa edycji istniejącego stylu
    ipcRenderer.on('edit-style', async (event, styleId) => {
        currentStyleId = styleId;
        document.getElementById('window-title').textContent = 'Edit Style';
        
        try {
            const style = await ipcRenderer.invoke('get-style', styleId);
            if (style) {
                nameInput.value = style.name;
                descriptionInput.value = style.description;
                tagsInput.value = style.fixedTags.join(', ');
                selectedIcon = style.icon;
                renderIconsGrid();
            }
        } catch (error) {
            console.error('Error loading style:', error);
        }
    });

    // Obsługa przycisku Save
    saveBtn.addEventListener('click', async () => {
        const style = {
            name: nameInput.value.trim(),
            description: descriptionInput.value.trim(),
            icon: selectedIcon,
            fixedTags: tagsInput.value.split(',').map(tag => tag.trim()).filter(Boolean)
        };

        try {
            if (currentStyleId) {
                await ipcRenderer.invoke('update-style', currentStyleId, style);
            } else {
                await ipcRenderer.invoke('add-style', style);
            }
            // Wyślij event odświeżenia do okna zarządzania stylami
            ipcRenderer.send('refresh-styles');
            window.close();
        } catch (error) {
            console.error('Error saving style:', error);
        }
    });

    // Obsługa przycisku Close
    closeBtn.addEventListener('click', () => {
        window.close();
    });

    // Inicjalizacja siatki ikon
    renderIconsGrid();
}); 
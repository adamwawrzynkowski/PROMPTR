const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    const stylesList = document.querySelector('.styles-list');
    const addStyleBtn = document.querySelector('.add-style-btn');
    const styleEditor = document.querySelector('.style-editor');
    const closeBtn = document.querySelector('.close-btn');
    let currentEditingId = null;

    // Lista dostępnych ikon
    const availableIcons = [
        'camera', 'film', 'dragon', 'palette', 'pencil-ruler', 'star',
        'wand-magic-sparkles', 'mountain', 'fire', 'water', 'wind',
        'brush', 'image', 'eye', 'sun', 'moon', 'cloud', 'heart',
        'bolt', 'crown', 'gem', 'feather', 'leaf', 'tree', 'flower'
    ];

    // Funkcja do renderowania listy stylów
    async function renderStyles() {
        const styles = await ipcRenderer.invoke('get-styles');
        stylesList.innerHTML = Object.entries(styles).map(([id, style]) => `
            <div class="style-card ${style.custom ? 'custom' : ''}" data-id="${id}">
                <div class="style-header">
                    <div class="style-title">
                        <i class="fas fa-${style.icon || 'paint-brush'}"></i>
                        <h3 class="style-name">${style.name}</h3>
                    </div>
                    <button class="favorite-btn" title="Add to favorites">
                        <i class="far fa-star"></i>
                    </button>
                </div>
                <p class="style-description">${style.description}</p>
                <div class="style-tags">
                    ${style.fixedTags.map(tag => `
                        <span class="style-tag">${tag}</span>
                    `).join('')}
                </div>
                <div class="style-card-actions">
                    <div class="prompt-type-selector">
                        <button class="prompt-type-button" title="Select prompt detail level">
                            <span class="prompt-type-text">Standard</span>
                            <i class="fas fa-chevron-down"></i>
                        </button>
                        <select class="prompt-type">
                            <option value="simple">Simple</option>
                            <option value="standard" selected>Standard</option>
                            <option value="detailed">Long and Detailed</option>
                        </select>
                    </div>
                    <button class="generate-btn" type="button">
                        <i class="fas fa-wand-magic-sparkles"></i> Generate
                    </button>
                </div>
                ${style.custom ? `
                    <div class="style-actions">
                        <button class="style-action-btn edit" title="Edit style">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="style-action-btn delete" title="Delete style">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                ` : ''}
            </div>
        `).join('');

        // Po wyrenderowaniu, dodaj obsługę zdarzeń dla przycisków typu promptu
        document.querySelectorAll('.prompt-type-button').forEach(button => {
            const select = button.parentElement.querySelector('.prompt-type');
            const text = button.querySelector('.prompt-type-text');

            // Aktualizuj tekst przycisku przy zmianie selecta
            select.addEventListener('change', () => {
                text.textContent = select.options[select.selectedIndex].text;
            });

            // Pokaż/ukryj select przy kliknięciu w przycisk
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                select.style.display = select.style.display === 'none' ? 'block' : 'none';
            });

            // Ukryj select po wybraniu opcji
            select.addEventListener('change', () => {
                select.style.display = 'none';
            });

            // Ukryj select przy kliknięciu poza nim
            document.addEventListener('click', () => {
                select.style.display = 'none';
            });
        });

        // Dodaj obsługę przycisków
        addStyleCardListeners();
    }

    // Funkcja do inicjalizacji selektora ikon
    function initializeIconSelector() {
        const iconSelector = document.querySelector('.icon-selector');
        iconSelector.innerHTML = availableIcons.map(icon => `
            <div class="icon-option" data-icon="${icon}">
                <i class="fas fa-${icon}"></i>
            </div>
        `).join('');

        // Dodaj obsługę wyboru ikony
        iconSelector.querySelectorAll('.icon-option').forEach(option => {
            option.addEventListener('click', () => {
                iconSelector.querySelectorAll('.icon-option').forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
            });
        });
    }

    // Obsługa przycisków w kartach stylów
    function addStyleCardListeners() {
        document.querySelectorAll('.style-card.custom').forEach(card => {
            const id = card.dataset.id;
            
            card.querySelector('.edit')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                currentEditingId = id;
                const style = await ipcRenderer.invoke('get-style', id);
                openEditor(style);
            });

            card.querySelector('.delete')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('Are you sure you want to delete this style?')) {
                    await ipcRenderer.invoke('delete-style', id);
                    renderStyles();
                }
            });
        });
    }

    // Funkcja otwierająca edytor
    function openEditor(style = null) {
        const form = document.getElementById('style-form');
        if (style) {
            form.name.value = style.name;
            form.description.value = style.description;
            form.fixedTags.value = style.fixedTags.join(', ');
            document.querySelector(`[data-icon="${style.icon}"]`)?.classList.add('selected');
        } else {
            form.reset();
            document.querySelectorAll('.icon-option').forEach(opt => opt.classList.remove('selected'));
        }
        styleEditor.classList.add('visible');
    }

    // Obsługa formularza
    document.getElementById('style-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const selectedIcon = document.querySelector('.icon-option.selected')?.dataset.icon || 'star';
        
        const styleData = {
            name: formData.get('name'),
            icon: selectedIcon,
            description: formData.get('description'),
            fixedTags: formData.get('fixedTags').split(',').map(tag => tag.trim()).filter(Boolean),
            custom: true
        };

        if (currentEditingId) {
            await ipcRenderer.invoke('update-style', currentEditingId, styleData);
        } else {
            await ipcRenderer.invoke('add-style', styleData);
        }

        currentEditingId = null;
        styleEditor.classList.remove('visible');
        renderStyles();
    });

    // Event Listeners
    addStyleBtn.addEventListener('click', () => {
        currentEditingId = null;
        openEditor();
    });

    closeBtn.addEventListener('click', () => {
        window.close();
    });

    document.querySelector('.cancel-btn')?.addEventListener('click', () => {
        styleEditor.classList.remove('visible');
    });

    // Inicjalizacja
    initializeIconSelector();
    renderStyles();
}); 
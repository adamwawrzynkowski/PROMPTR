const { ipcRenderer } = require('electron');

let currentStyle = null;

// Lista dostępnych ikon
const availableIcons = [
    'paint-brush', 'palette', 'wand-magic-sparkles', 'image', 'camera', 'pencil',
    'pen', 'brush', 'fill-drip', 'swatchbook', 'vector-square', 'crop',
    'layer-group', 'object-group', 'shapes', 'magic', 'star', 'heart'
];

// Inicjalizacja interfejsu
document.addEventListener('DOMContentLoaded', () => {
    // Przyciski
    const closeBtn = document.getElementById('close-btn');
    const saveBtn = document.getElementById('save-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const currentIconBtn = document.getElementById('current-icon');
    const iconDropdown = document.getElementById('icon-dropdown');

    // Pola formularza
    const nameInput = document.getElementById('style-name');
    const descriptionInput = document.getElementById('style-description');
    const promptInput = document.getElementById('style-prompt');

    // Wypełnij dropdown z ikonami
    availableIcons.forEach(iconName => {
        const iconOption = document.createElement('div');
        iconOption.className = 'icon-option';
        iconOption.innerHTML = `<i class="fas fa-${iconName}"></i>`;
        iconOption.onclick = () => {
            currentIconBtn.innerHTML = `<i class="fas fa-${iconName}"></i>`;
            currentStyle.icon = iconName;
            iconDropdown.classList.remove('show');
        };
        iconDropdown.appendChild(iconOption);
    });

    // Toggle dropdown ikon
    currentIconBtn.onclick = () => {
        iconDropdown.classList.toggle('show');
    };

    // Zamknij dropdown przy kliknięciu poza nim
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.icon-selector')) {
            iconDropdown.classList.remove('show');
        }
    });

    // Obsługa przycisków
    closeBtn.onclick = () => {
        ipcRenderer.send('close-style-settings');
    };

    cancelBtn.onclick = () => {
        ipcRenderer.send('close-style-settings');
    };

    saveBtn.onclick = () => {
        const updatedStyle = {
            ...currentStyle,
            name: nameInput.value,
            description: descriptionInput.value,
            prompt: promptInput.value
        };
        ipcRenderer.send('save-style-settings', updatedStyle);
    };

    // Nasłuchuj na dane stylu
    ipcRenderer.on('style-data', (event, style) => {
        currentStyle = style;
        nameInput.value = style.name;
        descriptionInput.value = style.description || '';
        promptInput.value = style.prompt || '';
        currentIconBtn.innerHTML = `<i class="fas fa-${style.icon}"></i>`;
    });
});

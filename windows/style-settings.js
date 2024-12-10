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

    // Parametry modelu
    const temperatureInput = document.getElementById('temperature');
    const temperatureValue = document.getElementById('temperature-value');
    const topPInput = document.getElementById('top-p');
    const topPValue = document.getElementById('top-p-value');
    const topKInput = document.getElementById('top-k');
    const topKValue = document.getElementById('top-k-value');
    const repeatPenaltyInput = document.getElementById('repeat-penalty');
    const repeatPenaltyValue = document.getElementById('repeat-penalty-value');

    // Aktualizacja wartości parametrów
    function updateParameterValue(input, valueDisplay) {
        input.addEventListener('input', () => {
            valueDisplay.textContent = input.value;
        });
    }

    updateParameterValue(temperatureInput, temperatureValue);
    updateParameterValue(topPInput, topPValue);
    updateParameterValue(topKInput, topKValue);
    updateParameterValue(repeatPenaltyInput, repeatPenaltyValue);

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
            prompt: promptInput.value,
            modelParameters: {
                temperature: parseFloat(temperatureInput.value),
                top_p: parseFloat(topPInput.value),
                top_k: parseInt(topKInput.value),
                repeat_penalty: parseFloat(repeatPenaltyInput.value)
            }
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

        // Ustaw wartości parametrów modelu
        if (style.modelParameters) {
            temperatureInput.value = style.modelParameters.temperature || 0.7;
            temperatureValue.textContent = temperatureInput.value;
            topPInput.value = style.modelParameters.top_p || 0.9;
            topPValue.textContent = topPInput.value;
            topKInput.value = style.modelParameters.top_k || 40;
            topKValue.textContent = topKInput.value;
            repeatPenaltyInput.value = style.modelParameters.repeat_penalty || 1.1;
            repeatPenaltyValue.textContent = repeatPenaltyInput.value;
        }
    });
});

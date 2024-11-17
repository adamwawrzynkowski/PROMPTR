const { ipcRenderer } = require('electron');

let currentTags = new Set();
const nameInput = document.getElementById('style-name');
const descriptionInput = document.getElementById('style-description');
const tagsContainer = document.getElementById('tags-container');
const addTagInput = document.getElementById('add-tag-input');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');
const closeBtn = document.getElementById('close-btn');

// Funkcja do renderowania tagów
function renderTags() {
    const tagElements = Array.from(currentTags).map(tag => {
        const tagElement = document.createElement('div');
        tagElement.className = 'tag';
        tagElement.innerHTML = `
            ${tag}
            <span class="remove-tag" data-tag="${tag}">
                <i class="fas fa-times"></i>
            </span>
        `;
        return tagElement;
    });

    // Wyczyść kontener (zachowując input)
    const input = tagsContainer.querySelector('.add-tag-input');
    tagsContainer.innerHTML = '';
    tagElements.forEach(tag => tagsContainer.appendChild(tag));
    tagsContainer.appendChild(input);

    // Dodaj obsługę usuwania tagów
    document.querySelectorAll('.remove-tag').forEach(button => {
        button.addEventListener('click', (e) => {
            const tag = e.currentTarget.dataset.tag;
            currentTags.delete(tag);
            renderTags();
        });
    });
}

// Obsługa dodawania tagów
addTagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && addTagInput.value.trim()) {
        const newTag = addTagInput.value.trim();
        currentTags.add(newTag);
        addTagInput.value = '';
        renderTags();
    }
});

// Obsługa zapisywania
saveBtn.addEventListener('click', () => {
    const styleData = {
        name: nameInput.value,
        description: descriptionInput.value,
        fixedTags: Array.from(currentTags)
    };

    ipcRenderer.invoke('save-style', styleData)
        .then(() => window.close())
        .catch(error => {
            console.error('Error saving style:', error);
            alert('Error saving style: ' + error.message);
        });
});

// Obsługa anulowania i zamykania
cancelBtn.addEventListener('click', () => window.close());
closeBtn.addEventListener('click', () => window.close());

// Obsługa edycji istniejącego stylu
ipcRenderer.on('edit-style', (event, styleData) => {
    if (styleData) {
        nameInput.value = styleData.name || '';
        descriptionInput.value = styleData.description || '';
        currentTags = new Set(styleData.fixedTags || []);
        renderTags();
    }
});

// Obsługa parsowania tagów z promptu
ipcRenderer.on('parse-tags', (event, prompt) => {
    // Podziel prompt na słowa i dodaj je jako tagi
    const words = prompt.split(/[,\s]+/).filter(word => word.length > 0);
    words.forEach(word => currentTags.add(word.trim()));
    renderTags();
}); 
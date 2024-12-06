const { ipcRenderer } = require('electron');

// Dodaj na początku pliku
const HISTORY_LIMIT = 10;
const styleHistories = new Map(); // Przechowuje historię promptów dla każdego stylu

// Dodaj na początku pliku, po innych importach
const DEFAULT_STYLES = {
    'realistic': { name: 'Realistic', description: 'Ultra-realistic photography with meticulous attention to detail', icon: 'camera', active: true },
    'cinematic': { name: 'Cinematic', description: 'Epic movie scene aesthetics with dramatic cinematography', icon: 'film', active: true },
    'vintage': { name: 'Vintage', description: 'Nostalgic retro photography with authentic period characteristics', icon: 'clock-rotate-left', active: true },
    'artistic': { name: 'Artistic', description: 'Expressive fine art with bold artistic interpretation', icon: 'palette', active: true },
    'abstract': { name: 'Abstract', description: 'Non-representational art focusing on form and emotion', icon: 'shapes', active: true },
    'poetic': { name: 'Poetic', description: 'Dreamy, ethereal atmosphere with soft, romantic qualities', icon: 'feather', active: true },
    'anime': { name: 'Anime', description: 'Stylized Japanese anime art with characteristic features', icon: 'star', active: true },
    'cartoon': { name: 'Cartoon', description: 'Bold, stylized cartoon with exaggerated features', icon: 'pen-nib', active: true },
    'cute': { name: 'Cute', description: 'Adorable kawaii style with charming, playful elements', icon: 'heart', active: true },
    'scifi': { name: 'Sci-Fi', description: 'Futuristic science fiction with advanced technology', icon: 'rocket', active: true }
};

// Dodaj na początku pliku
const DEFAULT_TAGS = [
    'realistic',
    'detailed',
    'quality',
    'cinematic',
    'sharp',
    'hd',
    'masterpiece',
    'professional',
    'vibrant',
    'dramatic'
];

// Dodaj na początku pliku
window.addEventListener('error', (event) => {
    console.error('Renderer error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled rejection in renderer:', event.reason);
});

// Funkcja do zarządzania historią promptów
function addToStyleHistory(styleId, prompt) {
    if (!styleHistories.has(styleId)) {
        styleHistories.set(styleId, {
            prompts: [],
            currentIndex: -1
        });
    }

    const history = styleHistories.get(styleId);
    
    // Usuń wszystkie prompty po aktualnym indeksie
    history.prompts = history.prompts.slice(0, history.currentIndex + 1);
    
    // Dodaj nowy prompt
    history.prompts.push(prompt);
    
    // Zachowaj limit historii
    if (history.prompts.length > HISTORY_LIMIT) {
        history.prompts.shift();
    }
    
    history.currentIndex = history.prompts.length - 1;
}

// Funkcja do nawigacji w historii
function navigateHistory(styleId, direction) {
    const history = styleHistories.get(styleId);
    if (!history) return null;

    const newIndex = history.currentIndex + direction;
    if (newIndex >= 0 && newIndex < history.prompts.length) {
        history.currentIndex = newIndex;
        return history.prompts[newIndex];
    }
    return null;
}

// Funkcja do tworzenia karty stylu
function createStyleCard(style) {
    const card = document.createElement('div');
    card.className = 'style-card';
    card.dataset.styleId = style.id;

    // Create header section with title, description and toggle
    const headerSection = document.createElement('div');
    headerSection.className = 'header-section';

    // Create title line with icon, name and toggle
    const titleLine = document.createElement('div');
    titleLine.className = 'title-line';
    titleLine.innerHTML = `
        <div class="title-with-icon">
            <i class="fas fa-${style.icon}"></i>
            <span>${style.name}</span>
        </div>
        <div class="style-toggle">
            <label class="switch">
                <input type="checkbox" ${style.active ? 'checked' : ''}>
                <span class="slider"></span>
            </label>
        </div>
    `;

    // Add description directly under title
    const description = document.createElement('div');
    description.className = 'description';
    description.textContent = style.description;

    headerSection.appendChild(titleLine);
    headerSection.appendChild(description);

    // Create prompt container with animation support
    const promptContainer = document.createElement('div');
    promptContainer.className = 'prompt-container';
    
    // Create loading animation container
    const loadingContainer = document.createElement('div');
    loadingContainer.className = 'generating-container';
    loadingContainer.style.display = 'none';
    loadingContainer.innerHTML = `
        <div class="generating-tiles">
            ${Array(9).fill('<div class="generating-tile"></div>').join('')}
        </div>
        <div class="generating-icon">
            <i class="fas fa-magic"></i>
        </div>
        <div class="generating-text">
            ${Array.from('Generating...').map(char => `<span>${char}</span>`).join('')}
        </div>
    `;
    
    // Create prompt display (empty by default)
    const promptDisplay = document.createElement('div');
    promptDisplay.className = 'prompt-text';
    
    promptContainer.appendChild(loadingContainer);
    promptContainer.appendChild(promptDisplay);

    // Create controls
    const controls = document.createElement('div');
    controls.className = 'card-controls';
    controls.innerHTML = `
        <div class="left-controls">
            <div class="history-group">
                <button class="history-btn prev-btn" title="Previous prompt">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <button class="history-btn next-btn" title="Next prompt">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
            <button class="refresh-btn" title="Generate new prompt">
                <i class="fas fa-sync-alt"></i>
            </button>
            <button class="copy-btn" title="Copy prompt">
                <i class="fas fa-copy"></i>
            </button>
        </div>
        <div class="right-controls">
            <button class="draw-things-btn" title="Send to Draw Things">
                <span>Send to Draw Things</span>
                <i class="fas fa-arrow-right"></i>
            </button>
        </div>
    `;

    // Append all elements to card
    card.appendChild(headerSection);
    card.appendChild(promptContainer);
    card.appendChild(controls);

    // Add event listeners
    setupStyleCardEventListeners(card, style);

    return card;
}

function setupStyleCardEventListeners(card, style) {
    const generateBtn = card.querySelector('.refresh-btn');
    const copyBtn = card.querySelector('.copy-btn');
    const drawThingsBtn = card.querySelector('.draw-things-btn');
    const toggleInput = card.querySelector('input[type="checkbox"]');
    const prevBtn = card.querySelector('.history-btn.prev-btn');
    const nextBtn = card.querySelector('.history-btn.next-btn');
    const promptContainer = card.querySelector('.prompt-container');
    const loadingContainer = card.querySelector('.generating-container');
    const promptDisplay = card.querySelector('.prompt-text');

    generateBtn.addEventListener('click', async () => {
        // Show loading animation
        promptDisplay.style.display = 'none';
        loadingContainer.style.display = 'flex';
        
        try {
            const prompt = await ipcRenderer.invoke('generate-prompt', style.id);
            
            // Hide loading and show prompt with animation
            loadingContainer.style.display = 'none';
            promptDisplay.style.display = 'block';
            revealPrompt(prompt, promptDisplay);
            
            addToStyleHistory(style.id, prompt);
            updateHistoryButtons(style.id);
        } catch (error) {
            console.error('Error generating prompt:', error);
            promptDisplay.textContent = 'Error generating prompt';
            loadingContainer.style.display = 'none';
            promptDisplay.style.display = 'block';
        }
    });

    copyBtn.addEventListener('click', () => copyStylePrompt(style.id));
    drawThingsBtn.addEventListener('click', () => sendToDrawThings(style.id));
    toggleInput.addEventListener('change', (e) => toggleStyle(style.id, e.target.checked));
    prevBtn.addEventListener('click', () => {
        const prompt = navigateHistory(style.id, -1);
        if (prompt) {
            revealPrompt(prompt, promptDisplay);
            updateHistoryButtons(style.id);
        }
    });
    nextBtn.addEventListener('click', () => {
        const prompt = navigateHistory(style.id, 1);
        if (prompt) {
            revealPrompt(prompt, promptDisplay);
            updateHistoryButtons(style.id);
        }
    });
}

function revealPrompt(promptText, container) {
    container.innerHTML = '';
    const words = promptText.split(' ');
    
    words.forEach((word, index) => {
        const wordSpan = document.createElement('span');
        wordSpan.textContent = word;
        wordSpan.className = 'prompt-word';
        wordSpan.style.animationDelay = `${index * 0.03}s`;
        container.appendChild(wordSpan);
        
        // Add space after word (except for last word)
        if (index < words.length - 1) {
            container.appendChild(document.createTextNode(' '));
        }
    });
}

// Funkcja do aktualizacji przycisków historii
function updateHistoryButtons(styleId) {
    const history = styleHistories.get(styleId);
    if (!history) return;

    const card = document.querySelector(`[data-style-id="${styleId}"]`);
    if (!card) return;

    const [prevButton, nextButton] = card.querySelectorAll('.history-btn');
    
    prevButton.disabled = history.currentIndex <= 0;
    nextButton.disabled = history.currentIndex >= history.prompts.length - 1;
}

// Funkcja do aktualizacji przycisku Draw Things
function updateDrawThingsButton(button) {
    checkDrawThingsConnection().then(isConnected => {
        button.disabled = !isConnected;
        button.title = isConnected ? 
            'Send to Draw Things' : 
            'Draw Things not connected';
    });
}

// Funkcja do przełączania aktywności stylu
function toggleStyle(styleId, active) {
    const card = document.querySelector(`[data-style-id="${styleId}"]`);
    if (!card) return;

    card.classList.add('moving');
    
    if (active) {
        document.getElementById('activeStyles').appendChild(card);
    } else {
        document.getElementById('inactiveStyles').appendChild(card);
    }

    setTimeout(() => card.classList.remove('moving'), 300);
    
    // Zapisz stan w konfiguracji
    saveStyleState(styleId, active);
}

// Dodaj pozostałe funkcje pomocnicze...

// Funkcja do ładowania stylów
async function loadStyles() {
    console.log('Loading styles...');
    const activeContainer = document.getElementById('activeStyles');
    const inactiveContainer = document.getElementById('inactiveStyles');
    
    if (!activeContainer || !inactiveContainer) {
        console.error('Style containers not found');
        return;
    }

    try {
        const styles = await ipcRenderer.invoke('get-styles');
        console.log('Received styles:', styles);

        if (!styles || typeof styles !== 'object') {
            console.error('Invalid styles data received:', styles);
            return;
        }

        // Wyczyść kontenery
        activeContainer.innerHTML = '';
        inactiveContainer.innerHTML = '';

        // Utwórz i dodaj karty dla każdego stylu
        Object.entries(styles).forEach(([id, style]) => {
            if (!style || typeof style !== 'object') {
                console.error('Invalid style data:', style);
                return;
            }

            const styleData = {
                id,
                ...style,
                active: style.active !== false
            };
            
            try {
                const card = createStyleCard(styleData);
                const container = styleData.active ? activeContainer : inactiveContainer;
                container.appendChild(card);
            } catch (error) {
                console.error('Error creating style card:', error);
            }
        });

        console.log('Styles loaded successfully');
    } catch (error) {
        console.error('Error loading styles:', error);
        showToast('Error loading styles');
    }
}

// Dodaj funkcję do aktualizacji promptu w karcie stylu
function updateStylePrompt(styleId, prompt) {
    const promptOutput = document.querySelector(`#prompt-${styleId}`);
    if (promptOutput) {
        promptOutput.textContent = prompt;
    }
}

// Dodaj funkcję do kopiowania promptu
function copyStylePrompt(styleId) {
    const promptOutput = document.querySelector(`#prompt-${styleId}`);
    if (promptOutput && promptOutput.textContent) {
        navigator.clipboard.writeText(promptOutput.textContent);
        showToast('Prompt copied to clipboard');
    }
}

// Dodaj funkcję do wysyłania do Draw Things
async function sendToDrawThings(styleId) {
    const promptOutput = document.querySelector(`#prompt-${styleId}`);
    if (!promptOutput || !promptOutput.textContent) return;

    try {
        await ipcRenderer.invoke('send-to-draw-things', promptOutput.textContent);
        showToast('Prompt sent to Draw Things');
    } catch (error) {
        showToast(error.message);
    }
}

// Dodaj funkcję do sprawdzania połączenia z Draw Things
async function checkDrawThingsConnection() {
    try {
        return await ipcRenderer.invoke('check-draw-things');
    } catch (error) {
        console.error('Error checking Draw Things connection:', error);
        return false;
    }
}

// Dodaj funkcję do zapisywania stanu stylu
async function saveStyleState(styleId, active) {
    try {
        await ipcRenderer.invoke('save-style-state', { styleId, active });
    } catch (error) {
        console.error('Error saving style state:', error);
    }
}

// Dodaj funkcję do wyświetlania powiadomień
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }, 100);
}

// Usuń poprzednie nasłuchiwacze DOMContentLoaded i zastąp jednym głównym
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded - Initializing application...');

    // Inicjalizacja kontrolek okna
    initializeWindowControls();
    
    // Załaduj style
    await loadStyles();
    
    // Inicjalizacja pola promptu
    initializePromptInput();
    
    // Inicjalizacja przycisków
    initializeButtons();
    
    // Get initial Ollama status
    try {
        const status = await ipcRenderer.invoke('check-ollama-status');
        updateConnectionStatus(status);
        updateModelTags(status);
    } catch (error) {
        console.error('Error getting initial Ollama status:', error);
    }
    
    console.log('Application initialized');
});

// Funkcja inicjalizująca kontrolki okna
function initializeWindowControls() {
    document.getElementById('minimize-btn')?.addEventListener('click', () => {
        ipcRenderer.send('minimize-window');
    });

    document.getElementById('maximize-btn')?.addEventListener('click', () => {
        ipcRenderer.send('maximize-window');
    });

    document.getElementById('close-btn')?.addEventListener('click', () => {
        ipcRenderer.send('close-window');
    });
}

// Funkcja inicjalizująca pole promptu
function initializePromptInput() {
    const promptInput = document.getElementById('promptInput');
    if (!promptInput) return;

    // Pokaż domyślne tagi na starcie
    displayTags([]);

    promptInput.addEventListener('input', debounce(async (e) => {
        const text = e.target.value.trim();
        if (text) {
            try {
                displayTags('generating');
                const translatedText = await handleTranslation(text);
                if (translatedText) {
                    // Użyj nowej funkcji generowania tagów w pakietach
                    await generateTagsInBatches(translatedText);
                }
            } catch (error) {
                console.error('Error:', error);
                displayTags([]);
                showToast('Error: ' + error.message);
            }
        } else {
            // Pokaż domyślne tagi gdy pole jest puste
            displayTags([]);
        }
    }, 500));
}

// Funkcja inicjalizująca przyciski
function initializeButtons() {
    // Przycisk generowania promptów
    document.getElementById('generatePrompts')?.addEventListener('click', async () => {
        const promptInput = document.getElementById('promptInput');
        if (!promptInput) return;
        
        const text = promptInput.value.trim();
        if (!text) {
            showToast('Please enter a prompt first');
            return;
        }

        try {
            await generatePromptsSequentially(text);
        } catch (error) {
            console.error('Error generating prompts:', error);
            showToast('Error generating prompts: ' + error.message);
        }
    });

    // Przycisk Draw Things
    const drawThingsBtn = document.getElementById('draw-things-btn');
    if (drawThingsBtn) {
        updateDrawThingsButton(drawThingsBtn);
        setInterval(() => updateDrawThingsButton(drawThingsBtn), 5000);
    }

    // Przycisk Vision
    document.getElementById('visionBtn')?.addEventListener('click', () => {
        ipcRenderer.send('open-vision');
    });

    // Przycisk kopiowania promptu
    document.getElementById('copyPromptBtn')?.addEventListener('click', () => {
        const promptInput = document.getElementById('promptInput');
        if (promptInput.value.trim()) {
            navigator.clipboard.writeText(promptInput.value);
            showToast('Prompt copied to clipboard');
        }
    });

    // Przycisk czyszczenia promptu
    document.getElementById('clearPromptBtn')?.addEventListener('click', () => {
        const promptInput = document.getElementById('promptInput');
        promptInput.value = '';
        displayTags([]);
        document.querySelectorAll('.prompt-output').forEach(output => {
            output.textContent = '';
        });
    });

    // Przycisk Manage Styles
    document.getElementById('manageStyles')?.addEventListener('click', () => {
        ipcRenderer.send('open-styles');
    });

    // Title bar buttons
    document.getElementById('connection-btn')?.addEventListener('click', () => {
        ipcRenderer.send('open-config');
    });

    document.getElementById('history-btn')?.addEventListener('click', () => {
        const historyPanel = document.querySelector('.history-panel');
        if (historyPanel) {
            historyPanel.classList.toggle('open');
            updateHistoryDisplay();
        }
    });

    document.getElementById('settings-btn')?.addEventListener('click', () => {
        ipcRenderer.send('open-settings');
    });

    document.getElementById('credits-btn')?.addEventListener('click', () => {
        ipcRenderer.send('open-credits');
    });

    // Coffee button
    document.querySelector('.coffee-button')?.addEventListener('click', () => {
        require('electron').shell.openExternal('https://buymeacoffee.com/a_wawrzynkowski');
    });
}

// Funkcja debounce (jeśli jeszcze nie jest zdefiniowana)
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Zmodyfikuj funkcję displayTags
function displayTags(tags) {
    const tagsContainer = document.getElementById('tags-container');
    if (!tagsContainer) return;
    
    if (tags === 'waiting') {
        tagsContainer.innerHTML = `
            <div class="generating-text">
                <i class="fas fa-hourglass generating-icon"></i>
                ${Array.from('Waiting for input...').map(char => `<span>${char}</span>`).join('')}
            </div>`;
        return;
    }
    
    if (tags === 'generating') {
        tagsContainer.innerHTML = `
            <div class="generating-text">
                <i class="fas fa-sparkles generating-icon"></i>
                ${Array.from('Generating tags...').map(char => 
                    char === ' ' ? '<span>&nbsp;</span>' : `<span>${char}</span>`
                ).join('')}
            </div>`;
        return;
    }
    
    // Jeśli nie ma tagów lub pusty prompt, pokaż domyślne
    if (!Array.isArray(tags) || tags.length === 0) {
        tagsContainer.innerHTML = DEFAULT_TAGS
            .map((tag, index) => `
                <div class="generating-tag" style="animation-delay: ${index * 0.1}s">
                    <i class="fas fa-tag"></i>${tag}
                </div>`)
            .join('');
    } else {
        // Sortuj tagi po długości (krótsze pierwsze) i alfabetycznie
        const sortedTags = [...tags].sort((a, b) => {
            if (a.length !== b.length) return a.length - b.length;
            return a.localeCompare(b);
        });
        
        tagsContainer.innerHTML = sortedTags
            .map((tag, index) => `
                <div class="generating-tag" style="animation-delay: ${index * 0.1}s">
                    <i class="fas fa-tag"></i>${tag}
                </div>`)
            .join('');
    }

    // Dodaj event listenery do tagów
    document.querySelectorAll('.generating-tag').forEach(tagElement => {
        tagElement.addEventListener('click', () => {
            const tag = tagElement.textContent.trim();
            const promptInput = document.getElementById('promptInput');
            const currentPromptText = promptInput.value.trim();
            promptInput.value = currentPromptText ? `${currentPromptText}, ${tag}` : tag;
            promptInput.dispatchEvent(new Event('input'));
        });
    });
}

// Zmodyfikuj funkcję generateTagsInBatches
async function generateTagsInBatches(text, batchSize = 6, totalBatches = 5) {
    if (!text || !text.trim()) {
        displayTags([]);
        return;
    }

    try {
        displayTags('generating');
        const response = await ipcRenderer.invoke('generate-tags', { text: text.trim() });
        
        if (response && Array.isArray(response)) {
            // Filter out empty tags and limit to a reasonable number
            const validTags = response
                .filter(tag => tag && tag.trim().length > 0)
                .slice(0, 15); // Limit to 15 tags
            
            if (validTags.length > 0) {
                displayTags(validTags);
            } else {
                console.warn('No valid tags received');
                displayTags([]);
            }
        } else {
            console.warn('Invalid response format:', response);
            displayTags([]);
        }
    } catch (error) {
        console.error('Error generating tags:', error);
        displayTags([]);
    }
}

// Dodaj style dla domyślnych tagów
document.head.insertAdjacentHTML('beforeend', `
    <style>
        .tag.default-tag {
            background: var(--button-background);
            opacity: 0.7;
        }
        
        .tag.default-tag:hover {
            opacity: 1;
            background: var(--button-hover);
        }
    </style>
`);

// Dodaj funkcję handleTranslation
async function handleTranslation(text) {
    try {
        // Najpierw sprawdź ustawienia
        const settings = await ipcRenderer.invoke('get-settings');
        console.log('Current settings:', settings);
        
        if (!settings.autoTranslate) {
            console.log('Translation is disabled in settings');
            return text;
        }

        // Pokaż overlay tłumaczenia
        const overlay = document.getElementById('translation-overlay');
        const statusText = document.getElementById('translation-status-text');
        const progressFill = document.querySelector('.translation-progress .progress-fill');
        
        if (overlay && statusText) {
            overlay.style.display = 'block';
            statusText.textContent = 'Checking language...';
            if (progressFill) {
                progressFill.style.width = '50%';
            }
        }
        
        // Wyślij tekst do tłumaczenia
        const translationResult = await ipcRenderer.invoke('detect-and-translate', text);
        console.log('Translation result:', translationResult);

        if (translationResult.isTranslated) {
            // Aktualizuj status tłumaczenia
            if (statusText) {
                statusText.textContent = `Translating from ${translationResult.originalLanguage.toUpperCase()}...`;
            }
            
            // Aktualizuj pasek postępu
            if (progressFill) {
                progressFill.style.width = '100%';
            }
            
            // Pokaż powiadomienie
            showToast(`Translated from ${translationResult.originalLanguage.toUpperCase()} to English`);
            
            // Ukryj overlay po krótkim opóźnieniu
            setTimeout(() => {
                if (overlay) {
                    overlay.style.display = 'none';
                }
                if (progressFill) {
                    progressFill.style.width = '0%';
                }
            }, 2000);
            
            return translationResult.translatedText;
        }

        // Jeśli nie było tłumaczenia, ukryj overlay
        if (overlay) {
            overlay.style.display = 'none';
        }
        return text;

    } catch (error) {
        console.error('Translation error:', error);
        const overlay = document.getElementById('translation-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
        showToast('Translation error: ' + error.message);
        return text;
    }
}

// Add this to your styles.css
document.head.insertAdjacentHTML('beforeend', `
    <style>
    .error-message {
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--error);
        padding: 10px;
        border-radius: 6px;
        background: rgba(244, 67, 54, 0.1);
    }
    
    .error-message i {
        font-size: 18px;
    }
    
    .tags-container {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }
    
    .tag {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        background: var(--card-background);
        border-radius: 4px;
        opacity: 0;
        transform: translateY(10px);
        animation: fadeInUp 0.3s forwards;
    }
    
    @keyframes fadeInUp {
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    .tag-text {
        color: var(--text);
    }
    
    .tag-button {
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        padding: 2px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.2s;
    }
    
    .tag-button:hover {
        color: var(--text);
    }
    </style>
`);

// Nasłuchuj na zmiany statusu
ipcRenderer.on('ollama-status', (event, status) => {
    console.log('Received ollama status update:', status);
    updateConnectionStatus(status);
});

// Funkcja do sekwencyjnego generowania promptów
async function generatePromptsSequentially(basePrompt) {
    const activeCards = document.querySelectorAll('.style-card');
    for (const card of activeCards) {
        const toggle = card.querySelector('input[type="checkbox"]');
        if (!toggle || !toggle.checked) continue;

        const promptContainer = card.querySelector('.prompt-container');
        const loadingContainer = card.querySelector('.generating-container');
        const promptDisplay = card.querySelector('.prompt-text');
        
        if (!promptContainer || !loadingContainer || !promptDisplay) continue;

        try {
            // Pokaż animację ładowania
            loadingContainer.style.display = 'flex';
            promptDisplay.textContent = '';

            // Generuj prompt
            const styleId = card.dataset.styleId;
            const response = await ipcRenderer.invoke('generate-prompt', {
                basePrompt,
                style: styleId
            });

            // Ukryj animację ładowania
            loadingContainer.style.display = 'none';

            // Pokaż wygenerowany prompt z animacją
            await revealPrompt(response.prompt, promptDisplay);
            
            // Dodaj do historii
            addToStyleHistory(styleId, response.prompt);
            updateHistoryButtons(styleId);

        } catch (error) {
            console.error('Error generating prompt:', error);
            loadingContainer.style.display = 'none';
            promptDisplay.textContent = 'Error generating prompt';
            showToast('Error: ' + error.message);
        }
    }
}

// Funkcja do animacji promptu
function revealPrompt(promptText, container) {
    container.innerHTML = '';
    const words = promptText.split(' ');
    
    words.forEach((word, index) => {
        const wordSpan = document.createElement('span');
        wordSpan.textContent = word;
        wordSpan.className = 'prompt-word';
        wordSpan.style.animationDelay = `${index * 0.03}s`;
        container.appendChild(wordSpan);
        
        // Add space after word (except for last word)
        if (index < words.length - 1) {
            container.appendChild(document.createTextNode(' '));
        }
    });
}
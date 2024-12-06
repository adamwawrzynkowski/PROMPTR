const { ipcRenderer } = require('electron');

// Dodaj na początku pliku
const HISTORY_LIMIT = 10;
const styleHistories = new Map(); // Przechowuje historię promptów dla każdego stylu

// Dodaj na początku pliku, po innych importach
const DEFAULT_STYLES = {
    'realistic': { name: 'Realistic', description: 'Photorealistic style', icon: 'camera', active: true },
    'cinematic': { name: 'Cinematic', description: 'Movie-like quality', icon: 'film', active: true },
    'artistic': { name: 'Artistic', description: 'Artistic interpretation', icon: 'palette', active: true },
    'anime': { name: 'Anime', description: 'Anime/Manga style', icon: 'star', active: true },
    // dodaj więcej domyślnych stylów według potrzeb
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

    const controls = document.createElement('div');
    controls.className = 'controls';

    // Lewa strona kontrolek (historia i kopiowanie)
    const leftControls = document.createElement('div');
    leftControls.className = 'left-controls';
    
    // Historia
    const historyControls = document.createElement('div');
    historyControls.className = 'history-controls';
    
    const prevButton = document.createElement('button');
    prevButton.className = 'history-button';
    prevButton.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevButton.onclick = () => {
        const prompt = navigateHistory(style.id, -1);
        if (prompt) updateStylePrompt(style.id, prompt);
        updateHistoryButtons(style.id);
    };

    const nextButton = document.createElement('button');
    nextButton.className = 'history-button';
    nextButton.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextButton.onclick = () => {
        const prompt = navigateHistory(style.id, 1);
        if (prompt) updateStylePrompt(style.id, prompt);
        updateHistoryButtons(style.id);
    };

    historyControls.appendChild(prevButton);
    historyControls.appendChild(nextButton);

    // Przyciski akcji
    const actionControls = document.createElement('div');
    actionControls.className = 'action-controls';

    const copyButton = document.createElement('button');
    copyButton.className = 'action-button';
    copyButton.innerHTML = '<i class="fas fa-copy"></i>';
    copyButton.title = 'Copy prompt';
    copyButton.onclick = () => copyStylePrompt(style.id);

    const drawThingsButton = document.createElement('button');
    drawThingsButton.className = 'action-button draw-things-btn';
    drawThingsButton.innerHTML = 'Send to Draw Things <i class="fas fa-arrow-right"></i>';
    drawThingsButton.onclick = () => sendToDrawThings(style.id);
    updateDrawThingsButton(drawThingsButton);

    actionControls.appendChild(copyButton);
    actionControls.appendChild(drawThingsButton);

    // Grupa historii i refresh
    const historyGroup = document.createElement('div');
    historyGroup.className = 'history-group';
    
    historyGroup.appendChild(historyControls);
    
    const refreshButton = document.createElement('button');
    refreshButton.className = 'refresh-button';
    refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i>';
    refreshButton.onclick = async () => {
        const promptInput = document.getElementById('promptInput');
        const text = promptInput.value.trim();
        if (text) {
            const promptOutput = card.querySelector('.prompt-output');
            if (promptOutput) {
                promptOutput.innerHTML = '<span class="loading">Generating...</span>';
                try {
                    const generatedPrompt = await ipcRenderer.invoke('generate-prompt', text, style.id);
                    updateStylePrompt(style.id, generatedPrompt);
                    addToStyleHistory(style.id, generatedPrompt);
                    updateHistoryButtons(style.id);
                } catch (error) {
                    promptOutput.innerHTML = '<span class="error">Generation failed</span>';
                }
            }
        }
    };
    historyGroup.appendChild(refreshButton);

    leftControls.appendChild(historyGroup);
    leftControls.appendChild(actionControls);

    controls.appendChild(leftControls);

    // Switch
    const styleSwitch = document.createElement('label');
    styleSwitch.className = 'style-switch';
    styleSwitch.innerHTML = `
        <input type="checkbox" ${style.active ? 'checked' : ''}>
        <span class="slider"></span>
    `;
    styleSwitch.querySelector('input').onchange = (e) => toggleStyle(style.id, e.target.checked);

    // Zawartość
    const content = document.createElement('div');
    content.className = 'style-content';
    
    // Użyj właściwej ścieżki do ikon
    const iconPath = `assets/stylesicons/${style.name.toLowerCase()}.png`;
    content.innerHTML = `
        <h3>
            <img src="${iconPath}" class="style-icon" alt="${style.name} icon" 
                onerror="this.src='assets/stylesicons/default.png'">
            ${style.name}
        </h3>
        <p>${style.description}</p>
        <div class="prompt-output" id="prompt-${style.id}"></div>
    `;

    card.appendChild(controls);
    card.appendChild(styleSwitch);
    card.appendChild(content);

    return card;
}

// Funkcja do aktualizacji przycisków historii
function updateHistoryButtons(styleId) {
    const history = styleHistories.get(styleId);
    if (!history) return;

    const card = document.querySelector(`[data-style-id="${styleId}"]`);
    if (!card) return;

    const [prevButton, nextButton] = card.querySelectorAll('.history-button');
    
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
            const activeCards = document.querySelectorAll('#activeStyles .style-card');
            for (const card of activeCards) {
                const styleId = card.dataset.styleId;
                const promptOutput = card.querySelector('.prompt-output');
                if (promptOutput) {
                    promptOutput.innerHTML = '<span class="loading">Generating...</span>';
                    const generatedPrompt = await ipcRenderer.invoke('generate-prompt', text, styleId);
                    updateStylePrompt(styleId, generatedPrompt);
                    addToStyleHistory(styleId, generatedPrompt);
                    updateHistoryButtons(styleId);
                }
            }
        } catch (error) {
            console.error('Error generating prompts:', error);
            showToast('Error generating prompts');
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
        tagsContainer.innerHTML = '<span class="tag loading">Waiting for input...</span>';
        return;
    }
    
    if (tags === 'generating') {
        tagsContainer.innerHTML = '<span class="tag loading">Generating tags...</span>';
        return;
    }
    
    // Jeśli nie ma tagów lub pusty prompt, pokaż domyślne
    if (!Array.isArray(tags) || tags.length === 0) {
        tagsContainer.innerHTML = DEFAULT_TAGS
            .map(tag => `<span class="tag default-tag" data-tag="${tag}">${tag}</span>`)
            .join('');
    } else {
        // Sortuj tagi po długości (krótsze pierwsze) i alfabetycznie
        const sortedTags = [...tags].sort((a, b) => {
            if (a.length !== b.length) return a.length - b.length;
            return a.localeCompare(b);
        });
        
        tagsContainer.innerHTML = sortedTags
            .map(tag => `<span class="tag" data-tag="${tag}">${tag}</span>`)
            .join('');
    }

    // Dodaj event listenery do tagów
    document.querySelectorAll('.tag').forEach(tagElement => {
        tagElement.addEventListener('click', () => {
            const tag = tagElement.dataset.tag;
            const promptInput = document.getElementById('promptInput');
            const currentPromptText = promptInput.value.trim();
            promptInput.value = currentPromptText ? `${currentPromptText}, ${tag}` : tag;
            promptInput.dispatchEvent(new Event('input'));
        });
    });
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

// Zmodyfikuj funkcję generateTagsInBatches
async function generateTagsInBatches(text, batchSize = 6, totalBatches = 5) {
    let allTags = new Set(); // Użyj Set aby uniknąć duplikatów
    
    // Nie dodawaj domyślnych tagów jeśli jest tekst
    if (!text.trim()) {
        DEFAULT_TAGS.forEach(tag => allTags.add(tag));
        displayTags([...allTags]);
        return [...allTags];
    }

    displayTags('generating');

    // Przygotuj słowa z promptu do porównania
    const promptWords = text.toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 2);

    // Generuj tagi w pakietach
    for (let i = 0; i < totalBatches; i++) {
        try {
            const prompt = `Generate ${batchSize} unique, descriptive tags for this prompt. 
                          Focus on key visual elements and style that are NOT already mentioned in the prompt. 
                          Return only simple tags, separated by commas, no explanations: ${text}`;
            
            const batchTags = await ipcRenderer.invoke('generate-tags', prompt);
            
            if (Array.isArray(batchTags)) {
                batchTags.forEach(tag => {
                    // Usuń spacje na początku i końcu oraz dodaj tylko niepuste tagi
                    const cleanTag = tag.trim().toLowerCase();
                    
                    // Sprawdź czy tag nie zawiera słów z oryginalnego promptu
                    const tagWords = cleanTag.split(' ');
                    const isTagUnique = !tagWords.some(word => 
                        promptWords.includes(word) || 
                        promptWords.some(promptWord => 
                            promptWord.includes(word) || word.includes(promptWord)
                        )
                    );

                    // Sprawdź czy podobny tag już nie istnieje
                    const exists = [...allTags].some(existingTag => {
                        return existingTag.includes(cleanTag) || 
                               cleanTag.includes(existingTag) ||
                               existingTag.split(' ').some(word => 
                                   cleanTag.split(' ').includes(word)
                               );
                    });
                    
                    if (cleanTag && isTagUnique && !exists) {
                        allTags.add(cleanTag);
                    }
                });
            }

            // Aktualizuj wyświetlane tagi po każdym pakiecie
            if (allTags.size > 0) {
                // Sortuj tagi po długości
                const sortedTags = [...allTags].sort((a, b) => {
                    // Najpierw sortuj po liczbie słów
                    const aWords = a.split(' ').length;
                    const bWords = b.split(' ').length;
                    if (aWords !== bWords) return aWords - bWords;
                    // Następnie po długości tekstu
                    return a.length - b.length;
                });
                displayTags(sortedTags);
            }

            // Krótka przerwa między pakietami
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.error(`Error generating batch ${i + 1}:`, error);
        }
    }

    return [...allTags];
}

// Zaktualizuj funkcję renderowania karty stylu
function renderStyleCard(style) {
    const card = document.createElement('div');
    card.className = 'style-card';
    card.dataset.styleId = style.id;

    card.innerHTML = `
        <h2>${style.name}</h2>
        <p>${style.description}</p>
        <!-- reszta zawartości karty -->
    `;

    return card;
}

// Dodaj funkcję do renderowania kafelka stylu z ikoną
function renderStyleTile(style) {
    const tile = document.createElement('div');
    tile.className = 'style-tile';
    tile.setAttribute('data-style-id', style.id);

    // Dodaj kontener dla ikony i nazwy
    const headerContainer = document.createElement('div');
    headerContainer.className = 'style-header';

    // Dodaj ikonę
    const icon = document.createElement('i');
    icon.className = `fas ${style.icon || 'fa-brush'} style-icon`;
    
    // Dodaj nazwę
    const name = document.createElement('span');
    name.className = 'style-name';
    name.textContent = style.name;

    // Połącz elementy
    headerContainer.appendChild(icon);
    headerContainer.appendChild(name);
    tile.appendChild(headerContainer);

    // Dodaj opis jeśli istnieje
    if (style.description) {
        const description = document.createElement('div');
        description.className = 'style-description';
        description.textContent = style.description;
        tile.appendChild(description);
    }

    return tile;
}

// Funkcja aktualizująca status połączenia
function updateConnectionStatus(status) {
    const connectionBtn = document.getElementById('connection-btn');
    if (!connectionBtn) return;

    const icon = connectionBtn.querySelector('i');
    const tooltip = connectionBtn.querySelector('.tooltip');

    if (status.isConnected) {
        connectionBtn.classList.remove('disconnected');
        connectionBtn.classList.add('connected');
        icon.className = 'fas fa-plug';
        tooltip.textContent = `Connected (${status.currentModel || 'No model selected'})`;
    } else {
        connectionBtn.classList.remove('connected');
        connectionBtn.classList.add('disconnected');
        icon.className = 'fas fa-plug-circle-xmark';
        tooltip.textContent = status.error || 'Disconnected';
    }

    // Zawsze aktualizuj tagi modeli
    updateModelTags(status);
}

// Add function to update model tags
function updateModelTags(status) {
    const modelTagsContainer = document.querySelector('.model-tags');
    if (!modelTagsContainer) {
        console.warn('Model tags container not found');
        return;
    }

    // Clear existing tags
    modelTagsContainer.innerHTML = '';

    if (!status || !status.models) {
        console.log('No models available');
        return;
    }

    // Sort models by category
    const modelsByCategory = {
        'text': [],
        'vision': [],
        'other': []
    };

    status.models.forEach(model => {
        const category = getModelCategory(model.id);
        if (modelsByCategory[category]) {
            modelsByCategory[category].push(model);
        } else {
            modelsByCategory.other.push(model);
        }
    });

    // Create tags for each category
    Object.entries(modelsByCategory).forEach(([category, models]) => {
        if (models.length > 0) {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = `model-category ${category}`;
            
            const categoryTitle = document.createElement('div');
            categoryTitle.className = 'category-title';
            categoryTitle.textContent = category.charAt(0).toUpperCase() + category.slice(1);
            categoryDiv.appendChild(categoryTitle);

            models.forEach(model => {
                const modelTag = document.createElement('div');
                modelTag.className = `model-tag ${category}`;
                modelTag.innerHTML = `
                    <span class="model-name">${model.id}</span>
                    <span class="model-size">${formatSize(model.size)}</span>
                `;
                
                // Add click handler for model installation/deletion
                modelTag.addEventListener('click', async () => {
                    try {
                        if (model.installed) {
                            await ipcRenderer.invoke('delete-model', model.id);
                            showToast(`Deleting model: ${model.id}`);
                        } else {
                            await ipcRenderer.invoke('install-model', model.id);
                            showToast(`Installing model: ${model.id}`);
                        }
                    } catch (error) {
                        showToast(`Error: ${error.message}`);
                    }
                });

                categoryDiv.appendChild(modelTag);
            });

            modelTagsContainer.appendChild(categoryDiv);
        }
    });
}

// Helper function to format file size
function formatSize(bytes) {
    if (!bytes) return 'N/A';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// Add styles for model tags
document.head.insertAdjacentHTML('beforeend', `
    <style>
        .model-tags {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 10px;
        }

        .model-category {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }

        .category-title {
            font-weight: bold;
            color: #888;
            margin-bottom: 5px;
        }

        .model-tag {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .model-tag:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .model-name {
            font-weight: 500;
        }

        .model-size {
            color: #888;
            font-size: 0.9em;
        }

        .model-tag.text {
            border-left: 3px solid #4CAF50;
        }

        .model-tag.vision {
            border-left: 3px solid #2196F3;
        }

        .model-tag.other {
            border-left: 3px solid #9C27B0;
        }
    </style>
`);

// Add function to determine model category
function getModelCategory(modelId) {
    if (!modelId) return 'other';
    
    const modelLower = modelId.toLowerCase();
    
    // Check NSFW first
    if (modelLower.includes('dolphin-') || modelLower.includes('uncensored')) {
        return 'NSFW';
    }
    
    // Check Vision models
    if (modelLower.includes('llava') || modelLower.includes('vision') || modelLower.includes('bakllava')) {
        return 'Vision';
    }
    
    // Check SFW models
    const sfwPrefixes = ['llama', 'gemma', 'mistral', 'mixtral', 'phi', 'qwen'];
    if (sfwPrefixes.some(prefix => modelLower.startsWith(prefix))) {
        return 'SFW';
    }
    
    // Default to Other
    return 'Other';
}

// Nasłuchuj na zmiany statusu
ipcRenderer.on('ollama-status', (event, status) => {
    console.log('Received ollama status update:', status);
    updateConnectionStatus(status);
});
const { ipcRenderer } = require('electron');

// Dodaj na początku pliku
const HISTORY_LIMIT = 10;
const styleHistories = new Map(); // Przechowuje historię promptów dla każdego stylu

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
    card.dataset.favorite = localStorage.getItem(`style_${style.id}_favorite`) === 'true' ? 'true' : 'false';

    const header = document.createElement('div');
    header.className = 'style-card-header';
    
    const titleContainer = document.createElement('div');
    titleContainer.className = 'style-card-title-container';
    
    const title = document.createElement('div');
    title.className = 'style-card-title';
    title.innerHTML = `<i class="fas fa-${style.icon}"></i> ${style.name}`;
    
    // Add custom parameters indicator if needed
    if (hasCustomParameters(style)) {
        const customIcon = document.createElement('i');
        customIcon.className = 'fas fa-sliders-h';
        customIcon.style.fontSize = '12px';
        customIcon.style.marginLeft = '8px';
        customIcon.style.color = 'var(--accent)';
        customIcon.title = 'Custom model parameters';
        title.appendChild(customIcon);
    }
    
    const favoriteBtn = document.createElement('button');
    favoriteBtn.className = 'favorite-btn';
    favoriteBtn.innerHTML = '<i class="fas fa-star"></i>';
    favoriteBtn.classList.toggle('active', card.dataset.favorite === 'true');
    favoriteBtn.onclick = (e) => {
        e.stopPropagation();
        const isFavorite = card.dataset.favorite === 'true';
        card.dataset.favorite = (!isFavorite).toString();
        localStorage.setItem(`style_${style.id}_favorite`, (!isFavorite).toString());
        favoriteBtn.classList.toggle('active', !isFavorite);
        updateStyleCounts();
    };
    
    titleContainer.appendChild(title);
    titleContainer.appendChild(favoriteBtn);
    
    const description = document.createElement('div');
    description.className = 'style-card-description';
    description.textContent = style.description || 'No description available';
    
    header.appendChild(titleContainer);
    header.appendChild(description);

    // Controls container (switch and generate button)
    const controls = document.createElement('div');
    controls.className = 'style-card-controls';
    
    const generateBtn = document.createElement('button');
    generateBtn.className = 'generate-btn';
    generateBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Generate';
    generateBtn.onclick = async (e) => {
        e.stopPropagation();
        const promptInput = document.getElementById('promptInput');
        const basePrompt = promptInput.value.trim();
        
        if (!basePrompt) {
            showToast('Please enter a prompt first');
            return;
        }

        try {
            const promptContainer = card.querySelector('.prompt-container');
            const loadingContainer = card.querySelector('.generating-container');
            const promptDisplay = card.querySelector('.prompt-text');
            
            if (!promptContainer || !loadingContainer || !promptDisplay) {
                console.error('Missing required elements for card:', style.id);
                return;
            }

            // Show loading animation
            promptDisplay.style.display = 'none';
            loadingContainer.style.display = 'flex';
            generateBtn.disabled = true;

            // Generate prompt
            console.log('Generating prompt for style:', style.id);
            
            // Get style parameters
            const styleParams = await ipcRenderer.invoke('get-style', style.id);
            console.log('Style parameters:', styleParams);
            
            const response = await ipcRenderer.invoke('generate-prompt', {
                basePrompt: basePrompt,
                styleId: style.id
            });
            
            console.log('Generate prompt response:', response);
            
            // Hide loading animation
            loadingContainer.style.display = 'none';
            promptDisplay.style.display = 'block';

            if (response && response.prompt) {
                // Show generated prompt with animation
                await revealPrompt(response.prompt, promptDisplay);
                
                // Add to history
                addToStyleHistory(style.id, response.prompt);
                updateHistoryButtons(style.id);
            } else {
                console.error('Invalid response format:', response);
                promptDisplay.textContent = 'Error: Invalid response format';
            }
        } catch (error) {
            console.error('Error generating prompt:', error);
            const promptDisplay = card.querySelector('.prompt-text');
            const loadingContainer = card.querySelector('.generating-container');
            loadingContainer.style.display = 'none';
            promptDisplay.style.display = 'block';
            promptDisplay.textContent = `Error: ${error.message || 'Failed to generate prompt'}`;
        } finally {
            generateBtn.disabled = false;
        }
    };
    
    const toggle = document.createElement('div');
    toggle.className = 'style-toggle';
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = localStorage.getItem(`style_${style.id}_active`) === 'true';
    toggle.appendChild(toggleInput);

    // Add change event listener directly to the input
    toggleInput.addEventListener('change', () => {
        toggleStyle(style.id, toggleInput.checked);
    });

    controls.appendChild(generateBtn);
    controls.appendChild(toggle);

    // Create prompt container
    const promptContainer = document.createElement('div');
    promptContainer.className = 'prompt-container';
    
    // Create loading container
    const loadingContainer = document.createElement('div');
    loadingContainer.className = 'generating-container';
    loadingContainer.style.display = 'none';
    loadingContainer.innerHTML = `
        <div class="generating-animation">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
        </div>
        <span>Generating...</span>
    `;
    
    // Create prompt text container
    const promptText = document.createElement('div');
    promptText.className = 'prompt-text';
    promptText.textContent = 'Click Generate to create a prompt...';
    
    promptContainer.appendChild(loadingContainer);
    promptContainer.appendChild(promptText);
    
    const actions = document.createElement('div');
    actions.className = 'prompt-actions';
    
    const leftActions = document.createElement('div');
    leftActions.className = 'prompt-actions-left';
    
    // History buttons group
    const historyButtons = document.createElement('div');
    historyButtons.className = 'history-buttons';
    
    const undoBtn = document.createElement('button');
    undoBtn.className = 'prompt-action-btn';
    undoBtn.innerHTML = '<i class="fas fa-undo"></i>';
    undoBtn.title = 'Previous prompt';
    undoBtn.onclick = () => navigateHistory(style.id, 'prev');
    
    const redoBtn = document.createElement('button');
    redoBtn.className = 'prompt-action-btn';
    redoBtn.innerHTML = '<i class="fas fa-redo"></i>';
    redoBtn.title = 'Next prompt';
    redoBtn.onclick = () => navigateHistory(style.id, 'next');
    
    historyButtons.appendChild(undoBtn);
    historyButtons.appendChild(redoBtn);
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'prompt-action-btn';
    copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
    copyBtn.title = 'Copy prompt';
    copyBtn.onclick = () => copyStylePrompt(style.id);
    
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'prompt-action-btn';
    settingsBtn.innerHTML = '<i class="fas fa-cog"></i>';
    settingsBtn.title = 'Style settings';
    settingsBtn.onclick = (e) => {
        e.stopPropagation();
        openStyleSettings(style.id);
    };
    
    leftActions.appendChild(historyButtons);
    leftActions.appendChild(copyBtn);
    leftActions.appendChild(settingsBtn);
    
    const drawBtn = document.createElement('button');
    drawBtn.className = 'send-to-draw-btn';
    drawBtn.innerHTML = '<i class="fas fa-arrow-right"></i> Send to Draw Things';
    drawBtn.onclick = () => sendToDrawThings(style.id);
    
    actions.appendChild(leftActions);
    actions.appendChild(drawBtn);
    
    card.appendChild(header);
    card.appendChild(controls);
    card.appendChild(promptContainer);
    card.appendChild(actions);
    
    return card;
}

// Funkcja do sprawdzania czy styl ma parametry niestandardowe
function hasCustomParameters(style) {
    if (!style.modelParameters) return false;
    
    const defaultParams = {
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40,
        max_tokens: 2048,
        repeat_penalty: 1.1
    };

    return Object.entries(defaultParams).some(([key, value]) => {
        const paramValue = style.modelParameters[key];
        if (typeof paramValue === 'number' && typeof value === 'number') {
            // Use small epsilon for floating point comparison
            return Math.abs(paramValue - value) > 0.0001;
        }
        return paramValue !== value;
    });
}

// Funkcja do zarządzania zdarzeniami karty stylu
function setupStyleCardEventListeners(card, style) {
    const generateBtn = card.querySelector('.generate-btn');
    const copyBtn = card.querySelector('.copy-btn');
    const drawThingsBtn = card.querySelector('.draw-things-btn');
    const toggleInput = card.querySelector('input[type="checkbox"]');
    const prevBtn = card.querySelector('.history-btn.prev-btn');
    const nextBtn = card.querySelector('.history-btn.next-btn');
    const promptContainer = card.querySelector('.prompt-container');
    const loadingContainer = card.querySelector('.generating-container');
    const promptDisplay = card.querySelector('.prompt-text');

    generateBtn.addEventListener('click', async () => {
        const promptInput = document.getElementById('promptInput');
        const basePrompt = promptInput?.value?.trim() || '';
        
        if (!basePrompt) {
            showToast('Please enter a prompt first');
            return;
        }
        
        // Show loading state
        if (promptContainer) promptContainer.style.display = 'none';
        if (loadingContainer) loadingContainer.style.display = 'flex';
        if (generateBtn) generateBtn.disabled = true;

        try {
            // Pobierz parametry stylu
            const styleParams = await ipcRenderer.invoke('get-style', style.id);
            console.log('Style parameters:', styleParams);
            
            const response = await ipcRenderer.invoke('generate-prompt', {
                basePrompt: basePrompt,
                styleId: style.id
            });
            
            console.log('Generate prompt response:', response);
            
            // Hide loading and show prompt with animation
            loadingContainer.style.display = 'none';
            promptDisplay.style.display = 'block';

            if (response && response.prompt) {
                // Show generated prompt with animation
                await revealPrompt(response.prompt, promptDisplay);
                
                // Add to history
                addToStyleHistory(style.id, response.prompt);
                updateHistoryButtons(style.id);
            } else {
                console.error('Invalid response format:', response);
                promptDisplay.textContent = 'Error: Invalid response format';
            }
        } catch (error) {
            console.error('Error generating prompt:', error);
            promptDisplay.textContent = `Error: ${error.message || 'Failed to generate prompt'}`;
            loadingContainer.style.display = 'none';
            promptDisplay.style.display = 'block';
        } finally {
            generateBtn.disabled = false;
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

// Funkcja do wyświetlania promptu
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

    const card = document.querySelector(`.style-card[data-style-id="${styleId}"]`);
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
    const card = document.querySelector(`.style-card[data-style-id="${styleId}"]`);
    if (!card) return;

    // Save the new state
    localStorage.setItem(`style_${styleId}_active`, active);
    
    // Update the toggle switch in the card
    const toggle = card.querySelector('.style-toggle input[type="checkbox"]');
    if (toggle) {
        toggle.checked = active;
    }

    // Update card appearance
    card.classList.toggle('active', active);
    
    // Get current view state
    const currentView = document.querySelector('.switch-btn.active')?.dataset.view === 'active';
    
    // If the card's new state doesn't match the current view, hide it with animation
    if (currentView !== active) {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.8)';
        setTimeout(() => {
            card.style.display = 'none';
        }, 300);
    }
    
    // If we're in the correct view for this card's new state, make sure it's visible
    if (currentView === active) {
        // If it was hidden, show it with animation
        if (card.style.display === 'none') {
            card.style.display = '';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.8)';
            setTimeout(() => {
                card.style.opacity = '1';
                card.style.transform = 'scale(1)';
            }, 10);
        }
    }

    // Update style counts and Generate Prompts button
    updateStyleCounts();
    updateGeneratePromptsButton();
}

// Funkcja do przełączania widoku aktywnych/nieaktywnych stylów
function toggleStylesView(view) {
    const cards = document.querySelectorAll('.style-card');
    const currentView = view === true ? 'active' : view; // Handle legacy true value

    cards.forEach(card => {
        const isActive = localStorage.getItem(`style_${card.dataset.styleId}_active`) === 'true';
        const isFavorite = card.dataset.favorite === 'true';
        
        if (currentView === 'active') {
            card.style.display = isActive ? 'flex' : 'none';
        } else if (currentView === 'inactive') {
            card.style.display = !isActive ? 'flex' : 'none';
        } else if (currentView === 'favorites') {
            card.style.display = isFavorite ? 'flex' : 'none';
        }

        // Reset transform and opacity for visible cards
        if (card.style.display === 'flex') {
            card.style.opacity = '1';
            card.style.transform = 'scale(1)';
        }
    });

    // Update the Generate Prompts button text
    updateGeneratePromptsButton();
}

// Initialize switch functionality
document.addEventListener('DOMContentLoaded', () => {
    const switchBtns = document.querySelectorAll('.switch-btn');

    // Load styles first
    loadStyles();

    // Handle button clicks for view switching
    switchBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all buttons
            switchBtns.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            btn.classList.add('active');
            // Toggle view based on data-view attribute
            toggleStylesView(btn.dataset.view);
        });
    });

    // Handle style toggle switches
    document.addEventListener('change', (e) => {
        if (e.target.matches('.style-toggle input[type="checkbox"]')) {
            const card = e.target.closest('.style-card');
            if (card) {
                const styleId = card.dataset.styleId;
                toggleStyle(styleId, e.target.checked);
            }
        }
    });

    // Initial state - show active styles
    toggleStylesView('active');
    
    // Update Generate Prompts button after initialization
    updateGeneratePromptsButton();
});

// Funkcja do ładowania stylów
async function loadStyles() {
    try {
        const styles = await ipcRenderer.invoke('get-styles');
        console.log('Loaded styles:', styles);
        
        const stylesList = document.querySelector('.styles-list');
        if (!stylesList) {
            console.error('Styles list container not found');
            return;
        }

        stylesList.innerHTML = '';

        styles.forEach(style => {
            const card = createStyleCard(style);
            stylesList.appendChild(card);
        });
        
        updateStyleCounts();
        updateGeneratePromptsButton();
    } catch (error) {
        console.error('Error loading styles:', error);
        showToast('Error loading styles');
    }
}

// Funkcja do aktualizacji promptu w karcie stylu
function updateStylePrompt(styleId, prompt) {
    const promptOutput = document.querySelector(`#prompt-${styleId}`);
    if (promptOutput) {
        promptOutput.textContent = prompt;
    }
}

// Funkcja do kopiowania promptu
function copyStylePrompt(styleId) {
    const promptOutput = document.querySelector(`#prompt-${styleId}`);
    if (promptOutput && promptOutput.textContent) {
        navigator.clipboard.writeText(promptOutput.textContent);
        showToast('Prompt copied to clipboard');
    }
}

// Funkcja do wysyłania do Draw Things
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

// Funkcja do sprawdzania połączenia z Draw Things
async function checkDrawThingsConnection() {
    try {
        return await ipcRenderer.invoke('check-draw-things');
    } catch (error) {
        console.error('Error checking Draw Things connection:', error);
        return false;
    }
}

// Funkcja do zapisywania stanu stylu
async function saveStyleState(styleId, active) {
    try {
        await ipcRenderer.invoke('save-style-state', { styleId, active });
    } catch (error) {
        console.error('Error saving style state:', error);
    }
}

// Funkcja do wyświetlania powiadomień
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
    const generatePromptsBtn = document.getElementById('generatePrompts');
    if (generatePromptsBtn) {
        generatePromptsBtn.addEventListener('click', async () => {
            const promptInput = document.getElementById('promptInput');
            if (!promptInput) return;
            
            const text = promptInput.value.trim();
            if (!text) {
                showToast('Please enter a prompt first');
                return;
            }

            // Sprawdź aktualny widok
            const currentView = document.querySelector('.switch-btn.active')?.dataset?.view;
            if (!currentView) return;

            // Wyłącz przycisk podczas generowania
            generatePromptsBtn.disabled = true;
            generatePromptsBtn.classList.add('loading');

            try {
                if (currentView === 'inactive') {
                    showToast('Cannot generate prompts in Inactive view');
                    return;
                }
                await generatePromptsSequentially(text, currentView);
            } catch (error) {
                console.error('Error generating prompts:', error);
                showToast('Error generating prompts: ' + error.message);
            } finally {
                generatePromptsBtn.disabled = false;
                generatePromptsBtn.classList.remove('loading');
                updateGeneratePromptsButton();
            }
        });

        // Nasłuchuj zmiany widoku
        document.querySelectorAll('.switch-btn').forEach(btn => {
            btn.addEventListener('click', updateGeneratePromptsButton);
        });

        // Inicjalizuj stan przycisku
        updateGeneratePromptsButton();
    }

    // Przycisk Draw Things
    const drawThingsBtn = document.getElementById('draw-things-btn');
    if (drawThingsBtn) {
        updateDrawThingsButton(drawThingsBtn);
        setInterval(() => updateDrawThingsButton(drawThingsBtn), 5000);
    }

    // Przycisk Settings
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            ipcRenderer.send('open-settings');
        });
    }

    // Przycisk Add Style
    const addStyleBtn = document.getElementById('add-style-btn');
    if (addStyleBtn) {
        addStyleBtn.addEventListener('click', () => {
            ipcRenderer.send('open-add-style');
        });
    }

    // Przyciski historii
    document.querySelectorAll('.history-btn').forEach(btn => {
        const styleId = btn.closest('.style-card')?.dataset?.styleId;
        if (!styleId) return;

        if (btn.classList.contains('prev-btn')) {
            btn.addEventListener('click', () => {
                const prompt = navigateHistory(styleId, -1);
                if (prompt) {
                    const promptDisplay = btn.closest('.style-card').querySelector('.prompt-text');
                    revealPrompt(prompt, promptDisplay);
                    updateHistoryButtons(styleId);
                }
            });
        } else if (btn.classList.contains('next-btn')) {
            btn.addEventListener('click', () => {
                const prompt = navigateHistory(styleId, 1);
                if (prompt) {
                    const promptDisplay = btn.closest('.style-card').querySelector('.prompt-text');
                    revealPrompt(prompt, promptDisplay);
                    updateHistoryButtons(styleId);
                }
            });
        }
    });

    // Przyciski kopiowania
    document.querySelectorAll('.copy-btn').forEach(btn => {
        const styleId = btn.closest('.style-card')?.dataset?.styleId;
        if (!styleId) return;
        
        btn.addEventListener('click', () => copyStylePrompt(styleId));
    });

    // Przyciski ustawień stylu
    document.querySelectorAll('.style-settings-btn').forEach(btn => {
        const styleId = btn.closest('.style-card')?.dataset?.styleId;
        if (!styleId) return;
        
        btn.addEventListener('click', () => openStyleSettings(styleId));
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

// Funkcja do czyszczenia i filtrowania tagów
function cleanTag(tag) {
    if (!tag) return '';
    
    // Usuń tagi kontrolne
    const controlTokens = ['<|', '|>', '_start', '_end', 'system', 'assistant', 'user', 'jim'];
    let cleanedTag = tag.trim();
    
    // Usuń tagi kontrolne
    controlTokens.forEach(token => {
        cleanedTag = cleanedTag.replace(new RegExp(`<\\|?${token}\\|?>`, 'gi'), '');
        cleanedTag = cleanedTag.replace(new RegExp(`${token}`, 'gi'), '');
    });
    
    // Usuń znaki specjalne i nadmiarowe spacje
    cleanedTag = cleanedTag
        .replace(/[<>|]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    
    // Sprawdź czy tag nie jest pusty i ma sensowną długość
    return cleanedTag.length > 1 && cleanedTag.length < 30 ? cleanedTag : '';
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
            // Filtruj i czyść tagi
            const validTags = response
                .map(tag => cleanTag(tag))
                .filter(tag => tag) // usuń puste tagi
                .filter((tag, index, self) => self.indexOf(tag) === index) // usuń duplikaty
                .slice(0, 15); // Limit do 15 tagów
            
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

// Funkcja do sekwencyjnego generowania promptów
async function generatePromptsSequentially(basePrompt, view = 'active') {
    console.log('Starting prompt generation with:', { basePrompt, view });
    
    if (!basePrompt || !basePrompt.trim()) {
        showToast('Please enter a prompt first');
        return;
    }

    // Get active style IDs based on view
    let styleIds;
    if (view === 'favorites') {
        styleIds = Array.from(document.querySelectorAll('.style-card'))
            .filter(card => card.dataset.favorite === 'true' || 
                          localStorage.getItem(`style_${card.dataset.styleId}_favorite`) === 'true')
            .map(card => card.dataset.styleId);
    } else if (view === 'active') {
        styleIds = Array.from(document.querySelectorAll('.style-card'))
            .filter(card => localStorage.getItem(`style_${card.dataset.styleId}_active`) === 'true')
            .map(card => card.dataset.styleId);
    } else {
        styleIds = [];
    }
    
    console.log('Found style IDs:', styleIds);
    
    if (styleIds.length === 0) {
        showToast('No styles available for prompt generation');
        return;
    }

    let generatedCount = 0;

    for (const styleId of styleIds) {
        const card = document.querySelector(`[data-style-id="${styleId}"]`);
        if (!card) continue;

        const promptContainer = card.querySelector('.prompt-container');
        const loadingContainer = card.querySelector('.generating-container');
        const promptDisplay = card.querySelector('.prompt-text');
        const generateBtn = card.querySelector('.generate-btn');

        try {
            // Show loading state
            if (promptContainer) promptContainer.style.display = 'none';
            if (loadingContainer) loadingContainer.style.display = 'flex';
            if (generateBtn) generateBtn.disabled = true;

            // Get the latest style data from the styles manager
            const style = await ipcRenderer.invoke('get-style', styleId);
            if (!style) {
                console.error('Style not found:', styleId);
                continue;
            }

            console.log('Generating with style:', style);

            // Build the complete prompt
            let finalPrompt = basePrompt;
            if (style.prefix) finalPrompt = `${style.prefix}${finalPrompt}`;
            if (style.suffix) finalPrompt = `${finalPrompt}${style.suffix}`;

            // Generate the prompt
            const result = await ipcRenderer.invoke('generate-prompt', {
                basePrompt: finalPrompt,
                styleId: style.id
            });

            // Update UI with result
            if (promptDisplay) {
                promptDisplay.textContent = result.prompt;
                revealPrompt(result.prompt, promptDisplay);
            }

            // Add to history
            addToStyleHistory(styleId, result.prompt);
            updateHistoryButtons(styleId);

            generatedCount++;
        } catch (error) {
            console.error('Error generating prompt:', error);
            if (promptDisplay) {
                promptDisplay.textContent = `Error: ${error.message}`;
                promptDisplay.classList.add('error');
            }
        } finally {
            // Reset UI state
            if (promptContainer) promptContainer.style.display = 'block';
            if (loadingContainer) loadingContainer.style.display = 'none';
            if (generateBtn) generateBtn.disabled = false;
        }
    }

    // Show completion message
    showToast(`Generated ${generatedCount} prompt${generatedCount !== 1 ? 's' : ''}`);
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

// Funkcja do aktualizacji liczników styli
function updateStyleCounts() {
    const cards = document.querySelectorAll('.style-card');
    let activeCount = 0;
    let inactiveCount = 0;
    let favoritesCount = 0;

    cards.forEach(card => {
        const isActive = localStorage.getItem(`style_${card.dataset.styleId}_active`) === 'true';
        const isFavorite = card.dataset.favorite === 'true' || localStorage.getItem(`style_${card.dataset.styleId}_favorite`) === 'true';
        
        if (isActive) activeCount++;
        else inactiveCount++;
        if (isFavorite) favoritesCount++;
    });

    // Update counts in buttons
    document.querySelector('.switch-btn[data-view="active"]').textContent = `Active Styles (${activeCount})`;
    document.querySelector('.switch-btn[data-view="inactive"]').textContent = `Inactive Styles (${inactiveCount})`;
    document.querySelector('.switch-btn[data-view="favorites"]').innerHTML = `<i class="fas fa-star"></i> Favorites (${favoritesCount})`;
}

// Funkcja do aktualizacji tekstu przycisku Generate Prompts
function updateGeneratePromptsButton() {
    const generatePromptsBtn = document.getElementById('generatePrompts');
    if (!generatePromptsBtn) {
        console.error('Generate Prompts button not found');
        return;
    }

    const currentView = document.querySelector('.switch-btn.active')?.dataset?.view;
    if (!currentView) {
        console.error('No active view found');
        return;
    }

    console.log('Updating Generate Prompts button for view:', currentView);

    let cardsCount = 0;
    if (currentView === 'favorites') {
        cardsCount = Array.from(document.querySelectorAll('.style-card')).filter(card => 
            card.dataset.favorite === 'true' || localStorage.getItem(`style_${card.dataset.styleId}_favorite`) === 'true'
        ).length;
    } else if (currentView === 'active') {
        cardsCount = Array.from(document.querySelectorAll('.style-card')).filter(card => 
            localStorage.getItem(`style_${card.dataset.styleId}_active`) === 'true'
        ).length;
    }

    console.log('Cards count:', cardsCount);

    // Zachowaj ikonę podczas aktualizacji tekstu
    generatePromptsBtn.innerHTML = `<i class="fas fa-wand-magic-sparkles"></i><span>Generate Prompts (${cardsCount})</span>`;
    generatePromptsBtn.disabled = currentView === 'inactive' || cardsCount === 0;
    generatePromptsBtn.style.opacity = (currentView === 'inactive' || cardsCount === 0) ? '0.5' : '1';
}

// Funkcja do otwierania ustawień stylu
function openStyleSettings(styleId) {
    console.log('Opening style settings for styleId:', styleId);
    
    // Get style data
    ipcRenderer.invoke('get-style', styleId).then(style => {
        if (!style) {
            console.error('Style not found:', styleId);
            return;
        }
        
        console.log('Retrieved style:', style);
        
        // Define default parameters
        const defaultParams = {
            temperature: 0.7,
            top_p: 0.9,
            top_k: 40,
            repeat_penalty: 1.1,
            max_tokens: 2048
        };
        
        // Merge with actual parameters, ensuring all fields exist
        const parameters = {
            ...defaultParams,
            ...(style.modelParameters || {})
        };
        
        const data = {
            styleId: styleId,  // Use the original styleId, not style.id
            styleName: style.name,
            parameters: parameters
        };
        
        console.log('Opening model tuning with data:', data);
        
        // Open model tuning window with style data
        ipcRenderer.send('open-model-tuning', data);
    }).catch(error => {
        console.error('Error getting style:', error);
    });
}

// Listen for model parameter updates
ipcRenderer.on('model-parameters-updated', (event, data) => {
    // Update style card if needed
    const styleCard = document.querySelector(`[data-style-id="${data.styleId}"]`);
    if (styleCard) {
        // Get the title element that contains the custom indicator
        const title = styleCard.querySelector('.style-card-title');
        if (title) {
            // Remove existing custom indicator if any
            const existingIndicator = title.querySelector('.fa-sliders-h');
            if (existingIndicator) {
                existingIndicator.remove();
            }
            
            // Add custom indicator if needed
            const style = {
                id: data.styleId,
                modelParameters: data.parameters
            };
            
            if (hasCustomParameters(style)) {
                const customIcon = document.createElement('i');
                customIcon.className = 'fas fa-sliders-h';
                customIcon.style.fontSize = '12px';
                customIcon.style.marginLeft = '8px';
                customIcon.style.color = 'var(--accent)';
                customIcon.title = 'Custom model parameters';
                title.appendChild(customIcon);
            }
        }
        
        // Update the style card's data attributes
        styleCard.setAttribute('data-temperature', data.parameters.temperature);
        styleCard.setAttribute('data-top-p', data.parameters.top_p);
        styleCard.setAttribute('data-top-k', data.parameters.top_k);
        styleCard.setAttribute('data-repeat-penalty', data.parameters.repeat_penalty);
        styleCard.setAttribute('data-max-tokens', data.parameters.max_tokens);
        
        console.log(`Model parameters updated for style ${data.styleId}:`, data.parameters);
    }
});

// Model selector functionality
let installedModels = [];

const isVisionModel = (model) => {
    const name = (model.name || '').toLowerCase();
    const isVision = name.includes('llava') || 
                    name.includes('vision') || 
                    name.includes('bakllava');
    console.log('Checking if vision model:', model.name, isVision);
    return isVision;
};

async function initializeModelSelectors() {
    console.log('Initializing model selectors');
    const textModelTag = document.querySelector('.text-model');
    const visionModelTag = document.querySelector('.vision-model');
    
    if (!textModelTag || !visionModelTag) {
        console.error('Could not find model tags:', { textModelTag, visionModelTag });
        return;
    }
    
    // Get installed models
    try {
        console.log('Fetching installed models...');
        const response = await ipcRenderer.invoke('list-models');
        console.log('Got models response:', response);
        installedModels = response.models || [];
        
        // Get current config
        const config = await ipcRenderer.invoke('get-config');
        console.log('Got config:', config);
        
        // Update dropdowns
        updateModelDropdowns(config);
        
        // Add click listeners
        textModelTag.addEventListener('click', (e) => {
            console.log('Text model tag clicked');
            toggleDropdown(e, 'text');
        });
        visionModelTag.addEventListener('click', (e) => {
            console.log('Vision model tag clicked');
            toggleDropdown(e, 'vision');
        });
        
        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.model-tag')) {
                console.log('Clicking outside, closing dropdowns');
                textModelTag.classList.remove('active');
                visionModelTag.classList.remove('active');
            }
        });
    } catch (error) {
        console.error('Error initializing model selectors:', error);
    }
}

function updateModelDropdowns(config) {
    console.log('Updating model dropdowns with config:', config);
    
    const textDropdown = document.getElementById('text-model-dropdown');
    const visionDropdown = document.getElementById('vision-model-dropdown');
    const textModelName = document.getElementById('text-model-name');
    const visionModelName = document.getElementById('vision-model-name');
    
    if (!textDropdown || !visionDropdown || !textModelName || !visionModelName) {
        console.error('Could not find dropdown elements:', { textDropdown, visionDropdown, textModelName, visionModelName });
        return;
    }
    
    // Update model names
    textModelName.textContent = config?.currentModel || 'Not selected';
    visionModelName.textContent = config?.visionModel || 'Not selected';
    
    // Clear existing items
    textDropdown.innerHTML = '';
    visionDropdown.innerHTML = '';
    
    console.log('Available models:', installedModels);
    
    // Filter models by type
    const textModels = installedModels.filter(model => !isVisionModel(model));
    const visionModels = installedModels.filter(model => isVisionModel(model));
    
    console.log('Filtered models:', { textModels, visionModels });
    
    // Populate text models dropdown
    textModels.forEach(model => {
        const item = createDropdownItem(model.name, config?.currentModel === model.name);
        item.addEventListener('click', (e) => {
            console.log('Selected text model:', model.name);
            e.stopPropagation();
            selectModel('text', model.name);
        });
        textDropdown.appendChild(item);
    });
    
    // Populate vision models dropdown
    visionModels.forEach(model => {
        const item = createDropdownItem(model.name, config?.visionModel === model.name);
        item.addEventListener('click', (e) => {
            console.log('Selected vision model:', model.name);
            e.stopPropagation();
            selectModel('vision', model.name);
        });
        visionDropdown.appendChild(item);
    });
}

function createDropdownItem(modelName, isSelected) {
    const item = document.createElement('div');
    item.className = `model-dropdown-item${isSelected ? ' selected' : ''}`;
    item.textContent = modelName;
    return item;
}

function toggleDropdown(event, type) {
    event.stopPropagation();
    const currentTag = event.currentTarget;
    const otherTag = type === 'text' ? 
        document.querySelector('.vision-model') : 
        document.querySelector('.text-model');
    
    console.log('Toggling dropdown for', type, 'model');
    otherTag.classList.remove('active');
    currentTag.classList.toggle('active');
}

async function selectModel(type, modelName) {
    try {
        console.log(`Selecting ${type} model:`, modelName);
        await ipcRenderer.invoke('select-model', { type, modelName });
        
        // Update UI immediately
        const dropdown = document.querySelector(`#${type.toLowerCase()}-model-dropdown`);
        if (dropdown) {
            const button = dropdown.querySelector('.dropdown-button');
            if (button) {
                button.textContent = modelName || 'Select Model';
            }
        }
        
        // Update connection status to reflect the new model
        const status = await ipcRenderer.invoke('get-ollama-status');
        updateConnectionStatus(status);
        
        // Show confirmation
        showToast(`${type} model set to: ${modelName}`);
    } catch (error) {
        console.error('Error selecting model:', error);
        showToast(`Error selecting model: ${error.message}`);
    }
}

// Initialize model selectors when the window loads
window.addEventListener('DOMContentLoaded', initializeModelSelectors);

// Update dropdowns when models change
ipcRenderer.on('model-changed', (event, config) => {
    updateModelDropdowns(config);
});

// Funkcja do aktualizacji statusu połączenia
function updateConnectionStatus(status) {
    const connectionBtn = document.getElementById('connection-btn');
    if (!connectionBtn) return;

    if (status.isConnected) {
        connectionBtn.classList.remove('disconnected');
        connectionBtn.classList.add('connected');
        connectionBtn.title = 'Ollama Connected';
        
        // Update model names when connection is established
        if (status.currentModel) {
            const textModelName = document.getElementById('text-model-name');
            if (textModelName) {
                textModelName.textContent = status.currentModel;
            }
        }
        if (status.visionModel) {
            const visionModelName = document.getElementById('vision-model-name');
            if (visionModelName) {
                visionModelName.textContent = status.visionModel;
            }
        }
    } else {
        connectionBtn.classList.remove('connected');
        connectionBtn.classList.add('disconnected');
        connectionBtn.title = 'Ollama Disconnected';
        
        // Reset model names when disconnected
        const textModelName = document.getElementById('text-model-name');
        const visionModelName = document.getElementById('vision-model-name');
        if (textModelName) textModelName.textContent = 'Not selected';
        if (visionModelName) visionModelName.textContent = 'Not selected';
    }
}

// Funkcja do aktualizacji tagów modelu
function updateModelTags(status) {
    const textModelName = document.getElementById('text-model-name');
    const visionModelName = document.getElementById('vision-model-name');
    
    if (!textModelName || !visionModelName) {
        console.warn('Model tag elements not found');
        return;
    }
    
    // Get current models from config
    ipcRenderer.invoke('get-config').then(config => {
        if (config) {
            // Update text model
            if (config.currentModel) {
                textModelName.textContent = config.currentModel;
                textModelName.title = `Current Text Model: ${config.currentModel}`;
            } else {
                textModelName.textContent = 'Not selected';
                textModelName.title = 'No text model selected';
            }
            
            // Update vision model
            if (config.visionModel) {
                visionModelName.textContent = config.visionModel;
                visionModelName.title = `Current Vision Model: ${config.visionModel}`;
            } else {
                visionModelName.textContent = 'Not selected';
                visionModelName.title = 'No vision model selected';
            }
        }
    }).catch(error => {
        console.error('Error getting config:', error);
        textModelName.textContent = 'Error';
        visionModelName.textContent = 'Error';
    });
}

// Listen for model changes
ipcRenderer.on('model-changed', (event, config) => {
    updateModelTags();
});

// Connection status handling
const connectionStatus = document.querySelector('.connection-status');
if (connectionStatus) {
    connectionStatus.addEventListener('click', () => {
        ipcRenderer.send('show-ollama-config');
    });
}

ipcRenderer.on('ollama-status', (event, isConnected) => {
    if (connectionStatus) {
        connectionStatus.classList.toggle('connected', isConnected);
        connectionStatus.classList.toggle('disconnected', !isConnected);
    }
});

// Funkcja do obsługi tłumaczenia
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

// Nasłuchuj na zmiany statusu
ipcRenderer.on('ollama-status', (event, status) => {
    console.log('Received ollama status update:', status);
    updateConnectionStatus(status);
});

// Nasłuchuj na aktualizacje stylu
ipcRenderer.on('style-updated', (event, updatedStyle) => {
    const card = document.querySelector(`.style-card[data-style-id="${updatedStyle.id}"]`);
    if (card) {
        const titleEl = card.querySelector('.style-card-title');
        const descriptionEl = card.querySelector('.style-card-description');
        
        titleEl.innerHTML = `<i class="fas fa-${updatedStyle.icon}"></i> ${updatedStyle.name}`;
        descriptionEl.textContent = updatedStyle.description || 'No description available';
    }
});

// Startup progress handling
function updateStartupUI(progress, status, message) {
    const progressBar = document.getElementById('startup-progress-bar');
    const statusEl = document.getElementById('startup-status');
    const messageEl = document.getElementById('startup-message');
    
    if (progressBar) progressBar.style.width = `${progress}%`;
    if (statusEl) statusEl.textContent = status;
    if (messageEl) messageEl.textContent = message;
}

ipcRenderer.on('startup-progress', (event, data) => {
    updateStartupUI(data.progress, data.status, data.message);
});

ipcRenderer.on('initialization-complete', () => {
    const startupScreen = document.getElementById('startup-screen');
    if (startupScreen) {
        startupScreen.style.opacity = '0';
        startupScreen.style.transition = 'opacity 0.5s ease';
        setTimeout(() => {
            startupScreen.style.display = 'none';
        }, 500);
    }
});

// Theme handling
const initializeTheme = async () => {
    const themeSelect = document.getElementById('themeSelect');
    if (!themeSelect) return;

    const body = document.body;
    
    try {
        // Load saved theme from electron store
        const savedTheme = await ipcRenderer.invoke('get-setting', 'theme') || 'purple';
        themeSelect.value = savedTheme;
        body.className = `theme-${savedTheme}`;

        // Handle theme changes
        themeSelect.addEventListener('change', async (e) => {
            const selectedTheme = e.target.value;
            body.className = `theme-${selectedTheme}`;
            try {
                await ipcRenderer.invoke('set-setting', 'theme', selectedTheme);
            } catch (error) {
                console.error('Error saving theme:', error);
            }
        });
    } catch (error) {
        console.error('Error loading theme:', error);
        // Set default theme if there's an error
        body.className = 'theme-purple';
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
});
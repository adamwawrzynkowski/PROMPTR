const { ipcRenderer } = require('electron');
const tagGenerator = require('./tag-generator');

// Dodaj na początku pliku
const HISTORY_LIMIT = 100;
const styleHistories = new Map(); // Przechowuje historię promptów dla każdego stylu

// Dodaj na początku pliku
const DEFAULT_TAGS = [
    'test'
];

// Dodaj na początku pliku
const activeGenerations = new Map();

// Dodaj na początku pliku
let markedWords = {
    positive: new Set(),
    negative: new Set()
};

// Flaga do blokowania równoległych generacji sekwencyjnych
let isSequentialGenerationInProgress = false;

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
    const card = document.querySelector(`[data-style-id="${styleId}"]`);
    if (!card) return;

    const history = styleHistories.get(styleId);
    if (!history) return;

    const newIndex = direction === 'prev' ? history.currentIndex - 1 : history.currentIndex + 1;
    
    if (newIndex >= 0 && newIndex < history.prompts.length) {
        history.currentIndex = newIndex;
        const prompt = history.prompts[newIndex];
        
        // Update the prompt display
        const promptText = card.querySelector('.prompt-text');
        if (promptText) {
            promptText.textContent = prompt;
        }
        
        // Update button states
        updateHistoryButtons(styleId);
        return prompt;
    }
    return null;
}

// Funkcja do tworzenia karty stylu
function createStyleCard(style) {
    const card = document.createElement('div');
    card.className = 'style-card';
    card.setAttribute('data-style-id', style.id);
    card.dataset.favorite = localStorage.getItem(`style_${style.id}_favorite`) === 'true' ? 'true' : 'false';

    // Create header
    const header = document.createElement('div');
    header.className = 'style-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'style-header-left';

    const headerRight = document.createElement('div');
    headerRight.className = 'style-header-right';

    const titleContainer = document.createElement('div');
    titleContainer.className = 'style-card-title-container';

    const icon = document.createElement('i');
    icon.className = style.icon || 'fas fa-palette';
    titleContainer.appendChild(icon);

    const title = document.createElement('span');
    title.className = 'style-card-title';
    title.textContent = style.name;
    titleContainer.appendChild(title);

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
    titleContainer.appendChild(favoriteBtn);

    const description = document.createElement('div');
    description.className = 'style-card-description';
    description.textContent = style.description || 'No description available';

    headerLeft.appendChild(titleContainer);
    headerLeft.appendChild(description);

    // Controls container (switch and generate button)
    const controls = document.createElement('div');
    controls.className = 'style-card-controls';

    const generateButtonGroup = document.createElement('div');
    generateButtonGroup.className = 'generate-button-group';

    const generateButton = document.createElement('button');
    generateButton.className = 'style-card-button';
    generateButton.innerHTML = '<span>Generate</span>';

    const dropdownButton = document.createElement('button');
    dropdownButton.className = 'style-card-button dropdown-toggle';
    dropdownButton.innerHTML = '<span class="selected-option">Standard</span><i class="fas fa-chevron-down"></i>';

    const dropdownMenu = document.createElement('div');
    dropdownMenu.className = 'prompt-options-dropdown';
    dropdownMenu.innerHTML = `
        <div class="dropdown-item" data-option="simple">Simple</div>
        <div class="dropdown-item" data-option="standard">Standard</div>
        <div class="dropdown-item" data-option="detailed">Long and Detailed</div>
    `;

    dropdownButton.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('show');
    });

    dropdownMenu.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const selectedOption = e.target.dataset.option;
            dropdownButton.querySelector('.selected-option').textContent = e.target.textContent;
            dropdownMenu.classList.remove('show');
        });
    });

    document.addEventListener('click', () => {
        dropdownMenu.classList.remove('show');
    });

    generateButtonGroup.appendChild(generateButton);
    generateButtonGroup.appendChild(dropdownButton);
    generateButtonGroup.appendChild(dropdownMenu);

    const toggle = document.createElement('div');
    toggle.className = 'style-toggle';
    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = localStorage.getItem(`style_${style.id}_active`) === 'true';
    toggle.appendChild(toggleInput);

    toggleInput.addEventListener('change', () => {
        toggleStyle(style.id, toggleInput.checked);
    });

    controls.appendChild(generateButtonGroup);
    controls.appendChild(toggle);

    headerRight.appendChild(controls);

    header.appendChild(headerLeft);
    header.appendChild(headerRight);
    card.appendChild(header);

    // Create prompt container
    const promptContainer = document.createElement('div');
    promptContainer.className = 'prompt-container';
    
    // Create loading container
    const loadingContainer = document.createElement('div');
    loadingContainer.className = 'generating-container';
    loadingContainer.style.display = 'none';
    
    // Create prompt text container
    const promptText = document.createElement('div');
    promptText.className = 'prompt-text';
    promptText.id = `prompt-${style.id}`;  // Add ID for easier reference
    promptText.textContent = 'Click Generate to create a prompt...';
    
    promptContainer.appendChild(promptText);
    promptContainer.appendChild(loadingContainer);
    
    card.appendChild(promptContainer);
    
    // Create prompt actions container
    const promptActions = document.createElement('div');
    promptActions.className = 'prompt-actions';

    // Create history buttons container
    const historyButtons = document.createElement('div');
    historyButtons.className = 'history-buttons';

    // Create previous button
    const prevButton = document.createElement('button');
    prevButton.className = 'prompt-action-btn prev-btn disabled';
    prevButton.title = 'Previous prompt';
    prevButton.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevButton.onclick = (e) => {
        e.stopPropagation();
        navigateHistory(style.id, 'prev');
    };

    // Create next button
    const nextButton = document.createElement('button');
    nextButton.className = 'prompt-action-btn next-btn disabled';
    nextButton.title = 'Next prompt';
    nextButton.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextButton.onclick = (e) => {
        e.stopPropagation();
        navigateHistory(style.id, 'next');
    };

    // Create copy button
    const copyButton = document.createElement('button');
    copyButton.className = 'prompt-action-btn copy-btn disabled';
    copyButton.title = 'Copy prompt';
    copyButton.innerHTML = '<i class="fas fa-copy"></i>';
    copyButton.onclick = (e) => {
        e.stopPropagation();
        copyStylePrompt(style.id);
    };

    // Create Draw Things button
    const drawBtn = document.createElement('button');
    drawBtn.className = 'prompt-action-btn draw-btn disabled';
    drawBtn.innerHTML = '<i class="fas fa-arrow-right"></i> Send to Draw Things';
    drawBtn.title = 'Send to Draw Things';
    drawBtn.disabled = true;
    drawBtn.onclick = () => sendToDrawThings(style.id);

    // Add tooltip functionality to Draw Things button
    function createDrawThingsTooltip() {
        const tooltip = document.createElement('div');
        tooltip.className = 'custom-tooltip';
        tooltip.innerHTML = `
            <div class="custom-tooltip-title">Draw Things Integration Setup</div>
            <p>PROMPTR integrates seamlessly with the Draw Things app. To activate the integration, follow these steps:</p>
            <ol>
                <li>Open the Draw Things app.</li>
                <li>Switch the settings tab to 'Advanced' or 'All'.</li>
                <li>Locate the 'API Server' option and enable it.</li>
                <li>Ensure the settings are configured as follows:</li>
            </ol>
            <ul>
                <li>Protocol: HTTP</li>
                <li>Port: 3333</li>
                <li>IP: 127.0.0.1</li>
            </ul>
            <div class="custom-tooltip-footer">Once these steps are completed, PROMPTR will be ready to interact with Draw Things! </div>
        `;
        document.body.appendChild(tooltip);
        return tooltip;
    }

    function addDrawThingsTooltip(drawBtn) {
        const tooltip = createDrawThingsTooltip();
        let timeout;

        drawBtn.addEventListener('mouseenter', () => {
            const rect = drawBtn.getBoundingClientRect();
            tooltip.style.left = `${rect.left}px`;
            tooltip.style.top = `${rect.bottom + 10}px`;
            
            clearTimeout(timeout);
            tooltip.classList.add('visible');
            
            const tooltipRect = tooltip.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            if (tooltipRect.right > viewportWidth) {
                tooltip.style.left = `${viewportWidth - tooltipRect.width - 10}px`;
            }
            
            if (tooltipRect.bottom > viewportHeight) {
                tooltip.style.top = `${rect.top - tooltipRect.height - 10}px`;
            }
        });

        drawBtn.addEventListener('mouseleave', () => {
            timeout = setTimeout(() => {
                tooltip.classList.remove('visible');
            }, 200);
        });

        tooltip.addEventListener('mouseenter', () => {
            clearTimeout(timeout);
        });

        tooltip.addEventListener('mouseleave', () => {
            tooltip.classList.remove('visible');
        });
    }

    addDrawThingsTooltip(drawBtn);

    // Observe prompt text changes
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'characterData' || mutation.type === 'childList') {
                const promptContent = promptText.textContent.trim();
                const hasPrompt = promptContent && promptContent !== 'Click Generate to create a prompt...';
                
                drawBtn.disabled = !hasPrompt;
                drawBtn.classList.toggle('disabled', !hasPrompt);
                
                prevButton.disabled = !hasPrompt;
                prevButton.classList.toggle('disabled', !hasPrompt);
                
                nextButton.disabled = !hasPrompt;
                nextButton.classList.toggle('disabled', !hasPrompt);
                
                copyButton.disabled = !hasPrompt;
                copyButton.classList.toggle('disabled', !hasPrompt);
            }
        });
    });

    observer.observe(promptText, { 
        characterData: true, 
        childList: true,
        subtree: true
    });

    // Add buttons to history buttons container
    historyButtons.appendChild(prevButton);
    historyButtons.appendChild(nextButton);
    historyButtons.appendChild(copyButton);

    // Create container for Magic Refiner and Draw Things buttons
    const actionButtons = document.createElement('div');
    actionButtons.className = 'action-buttons';
    actionButtons.appendChild(drawBtn);

    // Add all elements to prompt actions
    promptActions.appendChild(historyButtons);
    promptActions.appendChild(actionButtons);

    // Add prompt actions to card
    card.appendChild(promptActions);
    
    // Generate button click handler
    generateButton.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();

        // Check if already generating
        if (activeGenerations.has(style.id)) {
            return;
        }

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

            // Mark as generating
            activeGenerations.set(style.id, true);

            // Show loading animation
            promptDisplay.style.display = 'none';
            loadingContainer.style.display = 'flex';
            showLoadingAnimation(loadingContainer, 'Generating prompt...');
            generateButton.classList.add('disabled', 'loading');
            generateButton.disabled = true;

            // Get selected prompt type from dropdown
            const promptType = dropdownButton.querySelector('.selected-option').textContent.toLowerCase().replace(/\s+/g, '');
            
            const result = await ipcRenderer.invoke('generate-prompt', {
                basePrompt: style.prefix ? `${style.prefix}${basePrompt}` : basePrompt,
                styleId: style.id,
                promptType
            });

            if (result && result.prompt) {
                // Hide loading animation
                loadingContainer.style.display = 'none';
                promptContainer.style.display = 'block';
                promptDisplay.style.display = 'block';
                promptDisplay.textContent = '';
                await revealPrompt(result.prompt, promptDisplay);
                addToStyleHistory(style.id, result.prompt);
                updateHistoryButtons(style.id);
            } else {
                throw new Error('Empty response from model');
            }
        } catch (error) {
            console.error('Error generating prompt:', error);
            promptDisplay.textContent = `Error: ${error.message}`;
            promptDisplay.style.display = 'block';
        }
        finally {
            // Restore UI state
            const loadingContainer = card.querySelector('.generating-container');
            if (loadingContainer) {
                loadingContainer.style.display = 'none';
            }
            generateButton.classList.remove('disabled', 'loading');
            generateButton.disabled = false;
            // Clear generating flag
            activeGenerations.delete(style.id);
        }
    });

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
    if (!card || !style) {
        console.error('Missing card or style in setupStyleCardEventListeners');
        return;
    }

    const copyBtn = card.querySelector('.copy-btn');
    const drawThingsBtn = card.querySelector('.draw-things-btn');
    const toggleInput = card.querySelector('input[type="checkbox"]');
    const prevBtn = card.querySelector('.history-btn.prev-btn');
    const nextBtn = card.querySelector('.history-btn.next-btn');
    const promptDisplay = card.querySelector('.prompt-text');

    // Only add event listeners if elements exist
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            copyStylePrompt(style.id);
        });
    }
    
    if (drawThingsBtn) {
        drawThingsBtn.addEventListener('click', () => {
            sendToDrawThings(style.id);
        });
    }
    
    if (toggleInput) {
        toggleInput.addEventListener('change', (e) => toggleStyle(style.id, e.target.checked));
    }
    
    if (prevBtn && nextBtn && promptDisplay) {
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
    const card = document.querySelector(`.style-card[data-style-id="${styleId}"]`);
    if (!card) return;

    const prevButton = card.querySelector('.prev-btn');
    const nextButton = card.querySelector('.next-btn');
    if (!prevButton || !nextButton) return;

    const history = styleHistories.get(styleId);
    if (!history || history.prompts.length === 0) {
        prevButton.classList.add('disabled');
        nextButton.classList.add('disabled');
        return;
    }

    // Update previous button state
    if (history.currentIndex <= 0) {
        prevButton.classList.add('disabled');
    } else {
        prevButton.classList.remove('disabled');
    }

    // Update next button state
    if (history.currentIndex >= history.prompts.length - 1) {
        nextButton.classList.add('disabled');
    } else {
        nextButton.classList.remove('disabled');
    }
}

// Funkcja do aktualizacji przycisku Draw Things
function updateDrawThingsButton(button) {
    if (!button) return;
    
    const isConnected = checkDrawThingsConnection();
    if (isConnected) {
        button.classList.remove('disabled');
    } else {
        button.classList.add('disabled');
    }
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
    const styleCards = document.querySelectorAll('.style-card');
    const activeBtn = document.querySelector('.switch-btn[data-view="active"]');
    const inactiveBtn = document.querySelector('.switch-btn[data-view="inactive"]');
    const favoritesBtn = document.querySelector('.switch-btn[data-view="favorites"]');
    
    // Aktualizuj klasy przycisków
    [activeBtn, inactiveBtn, favoritesBtn].forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.switch-btn[data-view="${view}"]`).classList.add('active');

    // Aktualizuj widoczność kart
    styleCards.forEach(card => {
        const isActive = localStorage.getItem(`style_${card.dataset.styleId}_active`) === 'true';
        const isFavorite = localStorage.getItem(`style_${card.dataset.styleId}_favorite`) === 'true';
        
        let shouldDisplay = false;
        if (view === 'active') {
            shouldDisplay = isActive;
        } else if (view === 'inactive') {
            shouldDisplay = !isActive;
        } else if (view === 'favorites') {
            shouldDisplay = isFavorite;
        }
        
        card.style.display = shouldDisplay ? 'block' : 'none';
    });

    // Aktualizuj liczniki i przycisk generowania
    updateStyleCounts();
    updateGeneratePromptsButton();
}

// Initialize switch functionality
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded - Initializing application...');

    try {
        await loadStyles();
        initializeWindowControls();
        initializeButtons();
        initializePromptInput(); // Dodaj inicjalizację pola promptu
        initializeTheme();
        
        // Initialize switch functionality
        const switchBtns = document.querySelectorAll('.switch-btn');
        switchBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                toggleStylesView(view);
            });
        });

        // Initialize with active view
        toggleStylesView('active');
        updateStyleCounts();
        updateGeneratePromptsButton();
        
    } catch (error) {
        console.error('Error during initialization:', error);
        showToast('Error initializing application');
    }
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
        
        // Get current view
        const currentView = document.querySelector('.switch-btn.active')?.dataset?.view || 'active';
        
        // Apply initial filtering
        toggleStylesView(currentView);
        
        updateStyleCounts();
        updateGeneratePromptsButton();
    } catch (error) {
        console.error('Error loading styles:', error);
        showToast('Error loading styles');
    }
}

// Funkcja do aktualizacji promptu w karcie stylu
function updateStylePrompt(styleId, prompt) {
    const card = document.querySelector(`.style-card[data-style-id="${styleId}"]`);
    if (!card) return;

    const promptText = card.querySelector('.prompt-text');
    const drawBtn = card.querySelector('.draw-btn');
    
    if (promptText) {
        promptText.textContent = prompt || 'Click Generate to create a prompt...';
        
        // Update button states
        const hasPrompt = prompt && prompt.trim() !== '' && prompt !== 'Click Generate to create a prompt...';
        
        if (drawBtn) {
            drawBtn.disabled = !hasPrompt;
            drawBtn.classList.toggle('disabled', !hasPrompt);
        }
    }
}

// Funkcja do kopiowania promptu
function copyStylePrompt(styleId) {
    const card = document.querySelector(`[data-style-id="${styleId}"]`);
    if (!card) return;
    
    const promptText = card.querySelector('.prompt-text');
    if (promptText && promptText.textContent && promptText.textContent !== 'Click Generate to create a prompt...') {
        navigator.clipboard.writeText(promptText.textContent);
        showToast('Prompt copied to clipboard');
    } else {
        showToast('No prompt to copy');
    }
}

// Funkcja do wysyłania do Draw Things
async function sendToDrawThings(styleId) {
    try {
        const card = document.querySelector(`.style-card[data-style-id="${styleId}"]`);
        if (!card) return;

        const promptText = card.querySelector('.prompt-text');
        const drawBtn = card.querySelector('.draw-btn');
        
        if (!promptText || !drawBtn) return;
        
        const prompt = promptText.textContent.trim();
        if (!prompt || prompt === 'Click Generate to create a prompt...') {
            showToast('No prompt to send to Draw Things');
            return;
        }

        // Disable button and show loading state
        drawBtn.disabled = true;
        drawBtn.classList.add('disabled');
        const originalContent = drawBtn.innerHTML;
        drawBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

        try {
            // Check Draw Things connection first
            const isConnected = await ipcRenderer.invoke('check-draw-things-connection');
            if (!isConnected) {
                throw new Error('Draw Things is not connected. Please check if the app is running and API Server is enabled.');
            }

            // Send prompt to Draw Things
            await ipcRenderer.invoke('send-to-draw-things', prompt);
            showToast('Successfully sent to Draw Things! ');
        } catch (error) {
            console.error('Error sending to Draw Things:', error);
            showToast(`Error: ${error.message}`);
        } finally {
            // Restore button state
            drawBtn.disabled = false;
            drawBtn.classList.remove('disabled');
            drawBtn.innerHTML = originalContent;
        }
    } catch (error) {
        console.error('Error in sendToDrawThings:', error);
        showToast('An unexpected error occurred');
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

    try {
        await loadStyles();
        initializeWindowControls();
        initializeButtons();
        initializePromptInput(); // Dodaj inicjalizację pola promptu
        initializeTheme();
        
        // Initialize switch functionality
        const switchBtns = document.querySelectorAll('.switch-btn');
        switchBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                toggleStylesView(view);
            });
        });

        // Initialize with active view
        toggleStylesView('active');
        updateStyleCounts();
        updateGeneratePromptsButton();
        
    } catch (error) {
        console.error('Error during initialization:', error);
        showToast('Error initializing application');
    }
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
        
        // Get current view
        const currentView = document.querySelector('.switch-btn.active')?.dataset?.view || 'active';
        
        // Apply initial filtering
        toggleStylesView(currentView);
        
        updateStyleCounts();
        updateGeneratePromptsButton();
    } catch (error) {
        console.error('Error loading styles:', error);
        showToast('Error loading styles');
    }
}

// Funkcja do aktualizacji promptu w karcie stylu
function updateStylePrompt(styleId, prompt) {
    const card = document.querySelector(`.style-card[data-style-id="${styleId}"]`);
    if (!card) return;

    const promptText = card.querySelector('.prompt-text');
    const drawBtn = card.querySelector('.draw-btn');
    
    if (promptText) {
        promptText.textContent = prompt || 'Click Generate to create a prompt...';
        
        // Update button states
        const hasPrompt = prompt && prompt.trim() !== '' && prompt !== 'Click Generate to create a prompt...';
        
        if (drawBtn) {
            drawBtn.disabled = !hasPrompt;
            drawBtn.classList.toggle('disabled', !hasPrompt);
        }
    }
}

// Funkcja do kopiowania promptu
function copyStylePrompt(styleId) {
    const card = document.querySelector(`[data-style-id="${styleId}"]`);
    if (!card) return;
    
    const promptText = card.querySelector('.prompt-text');
    if (promptText && promptText.textContent && promptText.textContent !== 'Click Generate to create a prompt...') {
        navigator.clipboard.writeText(promptText.textContent);
        showToast('Prompt copied to clipboard');
    } else {
        showToast('No prompt to copy');
    }
}

// Funkcja do wysyłania do Draw Things
async function sendToDrawThings(styleId) {
    try {
        const card = document.querySelector(`.style-card[data-style-id="${styleId}"]`);
        if (!card) return;

        const promptText = card.querySelector('.prompt-text');
        const drawBtn = card.querySelector('.draw-btn');
        
        if (!promptText || !drawBtn) return;
        
        const prompt = promptText.textContent.trim();
        if (!prompt || prompt === 'Click Generate to create a prompt...') {
            showToast('No prompt to send to Draw Things');
            return;
        }

        // Disable button and show loading state
        drawBtn.disabled = true;
        drawBtn.classList.add('disabled');
        const originalContent = drawBtn.innerHTML;
        drawBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

        try {
            // Check Draw Things connection first
            const isConnected = await ipcRenderer.invoke('check-draw-things-connection');
            if (!isConnected) {
                throw new Error('Draw Things is not connected. Please check if the app is running and API Server is enabled.');
            }

            // Send prompt to Draw Things
            await ipcRenderer.invoke('send-to-draw-things', prompt);
            showToast('Successfully sent to Draw Things! ');
        } catch (error) {
            console.error('Error sending to Draw Things:', error);
            showToast(`Error: ${error.message}`);
        } finally {
            // Restore button state
            drawBtn.disabled = false;
            drawBtn.classList.remove('disabled');
            drawBtn.innerHTML = originalContent;
        }
    } catch (error) {
        console.error('Error in sendToDrawThings:', error);
        showToast('An unexpected error occurred');
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

    try {
        await loadStyles();
        initializeWindowControls();
        initializeButtons();
        initializePromptInput(); // Dodaj inicjalizację pola promptu
        initializeTheme();
        
        // Initialize switch functionality
        const switchBtns = document.querySelectorAll('.switch-btn');
        switchBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                toggleStylesView(view);
            });
        });

        // Initialize with active view
        toggleStylesView('active');
        updateStyleCounts();
        updateGeneratePromptsButton();
        
    } catch (error) {
        console.error('Error during initialization:', error);
        showToast('Error initializing application');
    }
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
        
        // Get current view
        const currentView = document.querySelector('.switch-btn.active')?.dataset?.view || 'active';
        
        // Apply initial filtering
        toggleStylesView(currentView);
        
        updateStyleCounts();
        updateGeneratePromptsButton();
    } catch (error) {
        console.error('Error loading styles:', error);
        showToast('Error loading styles');
    }
}

// Funkcja do aktualizacji promptu w karcie stylu
function updateStylePrompt(styleId, prompt) {
    const card = document.querySelector(`.style-card[data-style-id="${styleId}"]`);
    if (!card) return;

    const promptText = card.querySelector('.prompt-text');
    const drawBtn = card.querySelector('.draw-btn');
    
    if (promptText) {
        promptText.textContent = prompt || 'Click Generate to create a prompt...';
        
        // Update button states
        const hasPrompt = prompt && prompt.trim() !== '' && prompt !== 'Click Generate to create a prompt...';
        
        if (drawBtn) {
            drawBtn.disabled = !hasPrompt;
            drawBtn.classList.toggle('disabled', !hasPrompt);
        }
    }
}

// Funkcja do kopiowania promptu
function copyStylePrompt(styleId) {
    const card = document.querySelector(`[data-style-id="${styleId}"]`);
    if (!card) return;
    
    const promptText = card.querySelector('.prompt-text');
    if (promptText && promptText.textContent && promptText.textContent !== 'Click Generate to create a prompt...') {
        navigator.clipboard.writeText(promptText.textContent);
        showToast('Prompt copied to clipboard');
    } else {
        showToast('No prompt to copy');
    }
}

// Funkcja do wysyłania do Draw Things
async function sendToDrawThings(styleId) {
    try {
        const card = document.querySelector(`.style-card[data-style-id="${styleId}"]`);
        if (!card) return;

        const promptText = card.querySelector('.prompt-text');
        const drawBtn = card.querySelector('.draw-btn');
        
        if (!promptText || !drawBtn) return;
        
        const prompt = promptText.textContent.trim();
        if (!prompt || prompt === 'Click Generate to create a prompt...') {
            showToast('No prompt to send to Draw Things');
            return;
        }

        // Disable button and show loading state
        drawBtn.disabled = true;
        drawBtn.classList.add('disabled');
        const originalContent = drawBtn.innerHTML;
        drawBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

        try {
            // Check Draw Things connection first
            const isConnected = await ipcRenderer.invoke('check-draw-things-connection');
            if (!isConnected) {
                throw new Error('Draw Things is not connected. Please check if the app is running and API Server is enabled.');
            }

            // Send prompt to Draw Things
            await ipcRenderer.invoke('send-to-draw-things', prompt);
            showToast('Successfully sent to Draw Things! ');
        } catch (error) {
            console.error('Error sending to Draw Things:', error);
            showToast(`Error: ${error.message}`);
        } finally {
            // Restore button state
            drawBtn.disabled = false;
            drawBtn.classList.remove('disabled');
            drawBtn.innerHTML = originalContent;
        }
    } catch (error) {
        console.error('Error in sendToDrawThings:', error);
        showToast('An unexpected error occurred');
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

    // Initialize history functionality
    const historyBtn = document.getElementById('history-btn');
    const historyPanel = document.querySelector('.history-panel');
    const historyCloseBtn = document.querySelector('.history-close');
    const historyClearBtn = document.querySelector('.history-clear-all');

    console.log('History elements:', { 
        historyBtn: !!historyBtn, 
        historyPanel: !!historyPanel, 
        historyCloseBtn: !!historyCloseBtn,
        historyClearBtn: !!historyClearBtn 
    });

    if (historyBtn && historyPanel && historyCloseBtn && historyClearBtn) {
        historyBtn.addEventListener('click', () => {
            console.log('History button clicked');
            historyPanel.classList.toggle('open');
            updateHistoryPanelContent();
        });

        historyCloseBtn.addEventListener('click', () => {
            console.log('History close button clicked');
            historyPanel.classList.remove('open');
        });

        historyClearBtn.addEventListener('click', () => {
            console.log('History clear button clicked');
            clearAllHistory();
        });
    }

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

    // Generate initial template tags
    generateTagsInBatches('');

    // Add input listener with debounce
    promptInput.addEventListener('input', debounce(async (event) => {
        const text = event.target.value.trim();
        await generateTagsInBatches(text);
        if (text) {
            saveToHistory(text);
        }
    }, 500));
}

// Funkcja inicjalizująca przyciski
function initializeButtons() {
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

            // Get current view
            const activeButton = document.querySelector('.switch-btn.active');
            const currentView = activeButton?.dataset.view || 'active';

            try {
                if (currentView === 'inactive') {
                    showToast('Cannot generate prompts in Inactive view');
                    return;
                }

                // Disable button and show loading state
                generatePromptsBtn.classList.add('loading');
                try {
                    await generatePromptsSequentially(text, currentView);
                } finally {
                    generatePromptsBtn.classList.remove('loading');
                }
            } catch (error) {
                console.error('Error generating prompts:', error);
                showToast('Error generating prompts: ' + error.message);
            } finally {
                updateGeneratePromptsButton();
            }
        });

        // Listen for view changes
        document.querySelectorAll('.switch-btn').forEach(btn => {
            btn.addEventListener('click', updateGeneratePromptsButton);
        });

        // Initialize button state
        updateGeneratePromptsButton();
    }

    // Vision button
    const visionBtn = document.getElementById('visionBtn');
    if (visionBtn) {
        visionBtn.addEventListener('click', () => {
            ipcRenderer.send('open-vision');
        });
    }

    // Przycisk Draw Things
    const drawThingsBtn = document.getElementById('draw-things-btn');
    if (drawThingsBtn) {
        updateDrawThingsButton(drawThingsBtn);
        setInterval(() => updateDrawThingsButton(drawThingsBtn), 5000);
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
                const prompt = navigateHistory(styleId, 'prev');
                if (prompt) {
                    const promptDisplay = btn.closest('.style-card').querySelector('.prompt-text');
                    revealPrompt(prompt, promptDisplay);
                    updateHistoryButtons(styleId);
                }
            });
        } else if (btn.classList.contains('next-btn')) {
            btn.addEventListener('click', () => {
                const prompt = navigateHistory(styleId, 'next');
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

    // Add Ollama Configuration button handler
    const ollamaConfigButton = document.getElementById('open-ollama-button');
    if (ollamaConfigButton) {
        ollamaConfigButton.addEventListener('click', () => {
            ipcRenderer.send('open-ollama-config');
        });
    }

    // Add Manage Styles button handler
    const manageStylesBtn = document.querySelector('.manage-styles-btn');
    if (manageStylesBtn) {
        manageStylesBtn.addEventListener('click', () => {
            ipcRenderer.send('open-styles-window');
        });
    }

    // Funkcja do kopiowania tekstu do schowka
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy text:', err);
            showToast('Failed to copy to clipboard');
        });
    }

    // Funkcja do czyszczenia pola promptu
    function clearPromptInput() {
        const promptInput = document.getElementById('promptInput');
        if (promptInput) {
            promptInput.value = '';
            // Trigger the input event to update tags
            promptInput.dispatchEvent(new Event('input'));
        }
    }

    // Initialize copy and clear prompt buttons
    const copyPromptBtn = document.getElementById('copyPromptBtn');
    if (copyPromptBtn) {
        copyPromptBtn.addEventListener('click', () => {
            const promptInput = document.getElementById('promptInput');
            if (promptInput && promptInput.value.trim()) {
                copyToClipboard(promptInput.value);
            } else {
                showToast('Nothing to copy');
            }
        });
    }

    const clearPromptBtn = document.getElementById('clearPromptBtn');
    if (clearPromptBtn) {
        clearPromptBtn.addEventListener('click', () => {
            clearPromptInput();
            showToast('Prompt cleared');
        });
    }

    // Initialize coffee button
    const coffeeButton = document.querySelector('.coffee-button');
    if (coffeeButton) {
        coffeeButton.addEventListener('click', () => {
            ipcRenderer.invoke('open-external', 'https://buymeacoffee.com/a_wawrzynkowski');
        });
    }

    // Initialize info button
    const infoButton = document.querySelector('.info-button');
    if (infoButton) {
        infoButton.addEventListener('click', () => {
            ipcRenderer.send('open-credits');
        });
    }

    // Initialize history button
    const historyBtn = document.getElementById('history-btn');
    const historyPanel = document.querySelector('.history-panel');
    const historyCloseBtn = document.querySelector('.history-close');

    if (historyBtn && historyPanel && historyCloseBtn) {
        historyBtn.addEventListener('click', () => {
            historyPanel.classList.toggle('open');
            updateHistoryPanelContent();
        });

        historyCloseBtn.addEventListener('click', () => {
            historyPanel.classList.remove('open');
        });
    }
}

// Utility function to debounce frequent updates
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
    
    // Display tags with animation
    tagsContainer.innerHTML = tags
        .map((tag, index) => `
            <div class="generating-tag" style="animation-delay: ${index * 0.1}s">
                <i class="fas fa-tag"></i>${tag}
            </div>`)
        .join('');

    // Add event listeners to tags
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
async function generateTagsInBatches(text) {
    displayTags('generating');
    
    try {
        const tags = await tagGenerator.generateTags(text);
        displayTags(tags);
    } catch (error) {
        console.error('Error generating tags:', error);
        displayTags(tagGenerator.TEMPLATE_TAGS.slice(0, 10));
    }
}

// Funkcja do sekwencyjnego generowania promptów
async function generatePromptsSequentially(basePrompt, view = 'active') {
    // Prevent parallel sequential generations
    if (isSequentialGenerationInProgress) {
        console.log('Sequential generation already in progress, skipping');
        return;
    }

    console.log('Starting prompt generation with:', { basePrompt, view });
    
    if (!basePrompt || !basePrompt.trim()) {
        showToast('Please enter a prompt first');
        return;
    }

    isSequentialGenerationInProgress = true;
    const generateBtn = document.getElementById('generatePrompts');
    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.classList.add('loading');
        generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    }

    try {
        // Get current view from active switch button
        const activeSwitch = document.querySelector('.switch-btn.active');
        const currentView = activeSwitch ? activeSwitch.dataset.view : 'active';
        console.log('Current view:', currentView);

        const cards = Array.from(document.querySelectorAll('.style-card'))
            .filter(card => {
                if (!card.dataset.styleId) return false;
                
                const isActive = localStorage.getItem(`style_${card.dataset.styleId}_active`) === 'true';
                const isFavorite = card.dataset.favorite === 'true';
                
                switch (currentView) {
                    case 'active':
                        return isActive;
                    case 'inactive':
                        return !isActive;
                    case 'favorites':
                        return isFavorite;
                    default:
                        return false;
                }
            });

        console.log('Found cards to process:', cards.length);

        for (const card of cards) {
            const styleId = card.dataset.styleId;
            const promptContainer = card.querySelector('.prompt-container');
            const loadingContainer = card.querySelector('.generating-container');
            const promptDisplay = card.querySelector('.prompt-text');

            if (!promptContainer || !loadingContainer || !promptDisplay) {
                console.error('Missing required elements for card:', styleId);
                continue;
            }

            // Show loading animation
            promptDisplay.style.display = 'none';
            loadingContainer.style.display = 'flex';
            showLoadingAnimation(loadingContainer, 'Generating prompt...');

            try {
                const style = await ipcRenderer.invoke('get-style', styleId);
                if (!style) {
                    throw new Error('Style not found');
                }

                // Get the selected prompt type from the main dropdown
                const mainDropdown = document.getElementById('promptOptionsDropdown');
                const selectedOption = mainDropdown.querySelector('.selected-option');
                const promptType = selectedOption ? selectedOption.textContent.trim().toLowerCase().replace(/\s+/g, '') : 'standard';
                
                console.log('Generating prompt for style:', styleId, 'with type:', promptType);
                
                const result = await ipcRenderer.invoke('generate-prompt', {
                    basePrompt: style.prefix ? `${style.prefix} ${basePrompt}` : basePrompt,
                    styleId,
                    style,
                    promptType,
                    markedWords: {
                        positive: Array.from(markedWords.positive),
                        negative: Array.from(markedWords.negative)
                    }
                });

                if (result && result.prompt) {
                    loadingContainer.style.display = 'none';
                    promptContainer.style.display = 'block';
                    promptDisplay.style.display = 'block';
                    promptDisplay.textContent = '';
                    await revealPrompt(result.prompt, promptDisplay);
                    addToStyleHistory(styleId, result.prompt);
                    updateHistoryButtons(styleId);
                } else {
                    throw new Error('Empty response from model');
                }
            } catch (error) {
                console.error('Error generating prompt for style:', styleId, error);
                loadingContainer.style.display = 'none';
                promptDisplay.textContent = `Error: ${error.message}`;
                promptDisplay.style.display = 'block';
            }

            // Add a small delay between generations to avoid overwhelming the model
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    } finally {
        isSequentialGenerationInProgress = false;
        const generateBtn = document.getElementById('generatePrompts');
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.classList.remove('loading');
            generateBtn.innerHTML = 'Generate All';
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

// Funkcja do aktualizacji liczników styli
function updateStyleCounts() {
    const cards = document.querySelectorAll('.style-card');
    let activeCount = 0;
    let inactiveCount = 0;
    let favoritesCount = 0;

    cards.forEach(card => {
        const isActive = localStorage.getItem(`style_${card.dataset.styleId}_active`) === 'true';
        const isFavorite = localStorage.getItem(`style_${card.dataset.styleId}_favorite`) === 'true';
        
        if (isActive) activeCount++;
        else inactiveCount++;
        if (isFavorite) favoritesCount++;
    });

    // Aktualizuj tekst przycisków
    document.querySelector('.switch-btn[data-view="active"]').textContent = `Active Styles (${activeCount})`;
    document.querySelector('.switch-btn[data-view="inactive"]').textContent = `Inactive Styles (${inactiveCount})`;
    document.querySelector('.switch-btn[data-view="favorites"]').textContent = `Favorites (${favoritesCount})`;
}

// Funkcja do aktualizacji tekstu przycisku Generate Prompts
function updateGeneratePromptsButton() {
    const generatePromptsBtn = document.getElementById('generatePrompts');
    if (!generatePromptsBtn) return;

    try {
        const currentView = document.querySelector('.switch-btn.active')?.dataset?.view;
        if (!currentView) return;

        // Update button state based on view
        if (currentView === 'inactive') {
            generatePromptsBtn.classList.add('disabled');
            generatePromptsBtn.title = 'Cannot generate prompts in Inactive view';
        } else {
            generatePromptsBtn.classList.remove('disabled');
            generatePromptsBtn.title = currentView === 'favorites' ? 'Generate prompts for favorite styles' : 'Generate prompts for active styles';
        }

        // Count only visible cards based on current view
        const visibleCards = Array.from(document.querySelectorAll('.style-card')).filter(card => {
            const isActive = localStorage.getItem(`style_${card.dataset.styleId}_active`) === 'true';
            const isFavorite = card.dataset.favorite === 'true' || localStorage.getItem(`style_${card.dataset.styleId}_favorite`) === 'true';
            
            if (currentView === 'active') return isActive;
            if (currentView === 'inactive') return !isActive;
            if (currentView === 'favorites') return isFavorite;
            return false;
        }).length;

        generatePromptsBtn.innerHTML = `<span>Generate Prompts (${visibleCards})</span>`;
    } catch (err) {
        console.warn('Could not update generate button:', err);
    }
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
    const styleCard = document.querySelector(`.style-card[data-style-id="${data.styleId}"]`);
    if (styleCard) {
        const titleEl = styleCard.querySelector('.style-card-title');
        const descriptionEl = styleCard.querySelector('.style-card-description');
        
        titleEl.innerHTML = `<i class="fas fa-${data.styleIcon}"></i> ${data.styleName}`;
        descriptionEl.textContent = data.styleDescription || 'No description available';
    }
});

// Listen for model changes
ipcRenderer.on('model-changed', (event, config) => {
    console.log('Model changed:', config);
    // Update model tags and refresh UI
    updateModelTags();
    // Update any UI elements that depend on the current model
    document.querySelectorAll('.style-card').forEach(card => {
        const generateButton = card.querySelector('.generate-button');
        if (generateButton) {
            generateButton.disabled = false;
        }
    });
});

// Listen for style changes
ipcRenderer.on('styles-changed', async () => {
    console.log('Styles changed, refreshing...');
    await loadStyles();
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

// Funkcja do aktualizacji zawartości panelu historii
function updateHistoryPanelContent() {
    const historyContent = document.querySelector('.history-content');
    if (!historyContent) return;

    // Get history from localStorage
    const history = JSON.parse(localStorage.getItem('promptHistory') || '[]');

    if (history.length === 0) {
        historyContent.innerHTML = '<div class="no-history">No prompts in history</div>';
        return;
    }

    // Create HTML for history items
    const historyHTML = history.map((item, index) => {
        const date = new Date(item.timestamp);
        const formattedDate = date.toLocaleString();
        
        return `
            <div class="history-item" data-index="${index}">
                <div class="history-item-content">
                    <div class="history-item-text">${item.prompt}</div>
                    <div class="history-item-date">${formattedDate}</div>
                </div>
                <div class="history-item-actions">
                    <button class="history-item-copy" onclick="copyToClipboard('${item.prompt.replace(/'/g, "\\'")}')">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="history-item-delete" onclick="deleteHistoryItem(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    historyContent.innerHTML = historyHTML;
}

// Function to delete history item
function deleteHistoryItem(index) {
    // Get current history
    const history = JSON.parse(localStorage.getItem('promptHistory') || '[]');
    
    // Remove item at index
    history.splice(index, 1);
    
    // Save updated history
    localStorage.setItem('promptHistory', JSON.stringify(history));
    
    // Show confirmation toast
    showToast('Prompt deleted from history');
    
    // Update panel content
    updateHistoryPanelContent();
}

// Helper function to copy text to clipboard
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!');
    } catch (err) {
        console.error('Failed to copy text: ', err);
        showToast('Failed to copy text');
    }
}

// Funkcja do zapisywania promptu w historii
function saveToHistory(prompt) {
    if (!prompt || prompt.trim() === '') return;

    // Get existing history
    const history = JSON.parse(localStorage.getItem('promptHistory') || '[]');

    // Check if this prompt already exists
    const exists = history.some(item => item.prompt === prompt);
    if (exists) return;

    // Add new prompt to the beginning
    history.unshift({
        prompt,
        timestamp: new Date().toISOString()
    });

    // Keep only last 100 items
    if (history.length > 100) {
        history.pop();
    }

    // Save back to localStorage
    localStorage.setItem('promptHistory', JSON.stringify(history));
}

// Function to clear all history
function clearAllHistory() {
    if (confirm('Are you sure you want to clear all history?')) {
        localStorage.removeItem('promptHistory');
        updateHistoryPanelContent();
        showToast('History cleared');
    }
}

// Performance monitoring
function initializePerformanceMonitoring() {
    const cpuElement = document.getElementById('cpu-usage');
    const ramElement = document.getElementById('ram-usage');
    const gpuElement = document.getElementById('gpu-usage');
    
    function formatMemory(bytes) {
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)}KB`;
        } else if (bytes < 1024 * 1024 * 1024) {
            return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
        } else {
            return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
        }
    }
    
    function createTooltipContent(type, systemValue, ollamaValue) {
        const tooltip = document.createElement('div');
        tooltip.className = 'performance-tooltip';
        
        const table = document.createElement('table');
        let html = '';
        
        if (type === 'ram') {
            html = `
                <tr>
                    <td>System:</td>
                    <td>${formatMemory(systemValue)}</td>
                </tr>
                <tr>
                    <td>Ollama:</td>
                    <td>${ollamaValue ? formatMemory(ollamaValue) : 'inactive'}</td>
                </tr>
                ${ollamaValue ? `
                <tr class="total-row">
                    <td>Total:</td>
                    <td>${formatMemory(systemValue + ollamaValue)}</td>
                </tr>
                ` : ''}
            `;
        } else if (type === 'cpu') {
            html = `
                <tr>
                    <td>System:</td>
                    <td>${systemValue.toFixed(1)}%</td>
                </tr>
                <tr>
                    <td>Ollama:</td>
                    <td>${ollamaValue ? ollamaValue.toFixed(1) + '%' : 'inactive'}</td>
                </tr>
                ${ollamaValue ? `
                <tr class="total-row">
                    <td>Peak:</td>
                    <td>${Math.max(systemValue, ollamaValue).toFixed(1)}%</td>
                </tr>
                ` : ''}
            `;
        } else {
            html = `
                <tr>
                    <td>GPU:</td>
                    <td>${systemValue.toFixed(1)}%</td>
                </tr>
            `;
        }
        
        table.innerHTML = html;
        tooltip.appendChild(table);
        return tooltip;
    }
    
    function updatePerformanceIndicator(element, systemValue, ollamaValue, type) {
        if (!element) return;
        
        const container = element.parentElement;
        
        // Remove existing tooltip
        const existingTooltip = container.querySelector('.performance-tooltip');
        if (existingTooltip) {
            existingTooltip.remove();
        }
        
        // Remove existing classes
        container.classList.remove('high-usage', 'medium-usage', 'ollama-active');
        
        // Calculate combined value
        let totalValue = systemValue;
        if (type === 'cpu') {
            totalValue = Math.max(systemValue, ollamaValue);
        } else if (type === 'ram') {
            totalValue = systemValue + ollamaValue;
        }
        
        // Add appropriate class based on usage
        if (totalValue > 80) {
            container.classList.add('high-usage');
        } else if (totalValue > 60) {
            container.classList.add('medium-usage');
        }
        
        // Add Ollama indicator if active
        if (ollamaValue > 0) {
            container.classList.add('ollama-active');
        }
        
        // Update text
        if (type === 'ram') {
            const totalText = formatMemory(totalValue);
            element.textContent = ollamaValue ? `${totalText} (combined)` : totalText;
        } else {
            element.textContent = `${Math.round(totalValue)}%`;
        }
        
        // Add tooltip
        container.appendChild(createTooltipContent(type, systemValue, ollamaValue));
    }
    
    // Request performance updates from main process
    function requestPerformanceUpdate() {
        ipcRenderer.invoke('get-performance-stats').then(stats => {
            updatePerformanceIndicator(cpuElement, stats.system.cpu, stats.ollama.cpu, 'cpu');
            updatePerformanceIndicator(ramElement, stats.system.ram, stats.ollama.ram, 'ram');
            updatePerformanceIndicator(gpuElement, stats.system.gpu, 0, 'gpu');
        }).catch(console.error);
    }
    
    // Update every second
    setInterval(requestPerformanceUpdate, 1000);
}

// Initialize performance monitoring when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializePerformanceMonitoring();
});

// Theme handling
const initializeTheme = async () => {
    const themeSelect = document.getElementById('themeSelect');
    if (!themeSelect) return;

    const body = document.body;
    
    try {
        // Load saved theme from electron store
        const savedTheme = await ipcRenderer.invoke('get-setting', 'theme') || 'purple';
        console.log('Initial theme loaded:', savedTheme);
        themeSelect.value = savedTheme;
        body.className = `theme-${savedTheme}`;

        // Handle theme changes
        themeSelect.addEventListener('change', async (e) => {
            const selectedTheme = e.target.value;
            console.log('Theme selected:', selectedTheme);
            body.className = `theme-${selectedTheme}`;
            try {
                await ipcRenderer.invoke('set-setting', 'theme', selectedTheme);
                // Notify other windows about theme change
                console.log('Broadcasting theme change:', selectedTheme);
                ipcRenderer.send('theme-changed', selectedTheme);
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

// Funkcja do sprawdzania połączeń
async function checkConnections() {
    try {
        const status = await ipcRenderer.invoke('check-connections');
        updateConnectionStatus(status);
    } catch (error) {
        console.error('Error checking connections:', error);
    }
}

// Dodaj sprawdzanie połączeń do inicjalizacji
document.addEventListener('DOMContentLoaded', () => {
    // Sprawdź połączenia na początku
    checkConnections();
    
    // Sprawdzaj połączenia co 30 sekund
    setInterval(checkConnections, 30000);
});

// Virtual scrolling implementation
class VirtualScroller {
    constructor(container, items, renderCallback) {
        this.container = container;
        this.items = items;
        this.renderCallback = renderCallback;
        this.visibleItems = new Map();
        this.lastScrollPosition = 0;
        
        // Create height placeholder
        this.heightPlaceholder = document.createElement('div');
        this.container.appendChild(this.heightPlaceholder);
        
        // Bind scroll handler with RAF for performance
        this.scrollHandler = this.onScroll.bind(this);
        this.container.addEventListener('scroll', () => {
            if (!this.ticking) {
                requestAnimationFrame(() => {
                    this.scrollHandler();
                    this.ticking = false;
                });
                this.ticking = true;
            }
        });
        
        // Initial render
        this.updateVisibleItems();
    }
    
    updateVisibleItems() {
        const scrollTop = this.container.scrollTop;
        const viewportHeight = this.container.clientHeight;
        
        // Calculate visible range with buffer
        const startIndex = Math.max(0, Math.floor(scrollTop / CARD_HEIGHT) - BUFFER_SIZE);
        const endIndex = Math.min(
            this.items.length,
            Math.ceil((scrollTop + viewportHeight) / CARD_HEIGHT) + BUFFER_SIZE
        );
        
        // Update height placeholder
        this.heightPlaceholder.style.height = `${this.items.length * CARD_HEIGHT}px`;
        
        // Remove items that are no longer visible
        for (const [index, element] of this.visibleItems.entries()) {
            if (index < startIndex || index >= endIndex) {
                element.remove();
                this.visibleItems.delete(index);
            }
        }
        
        // Add new visible items
        for (let i = startIndex; i < endIndex; i++) {
            if (!this.visibleItems.has(i) && i < this.items.length) {
                const item = this.items[i];
                const element = this.renderCallback(item);
                element.style.position = 'absolute';
                element.style.top = `${i * CARD_HEIGHT}px`;
                element.style.width = '100%';
                this.container.appendChild(element);
                this.visibleItems.set(i, element);
            }
        }
    }
    
    onScroll() {
        this.updateVisibleItems();
        this.lastScrollPosition = this.container.scrollTop;
    }
    
    refresh(newItems) {
        this.items = newItems;
        this.visibleItems.clear();
        this.container.innerHTML = '';
        this.container.appendChild(this.heightPlaceholder);
        this.updateVisibleItems();
    }
}

// Initialize virtual scrolling
function initializeVirtualScrolling() {
    const container = document.querySelector('.styles-container');
    if (!container) return;
    
    // Get all styles
    const styles = Array.from(container.querySelectorAll('.style-card'));
    
    // Remove existing cards
    container.innerHTML = '';
    
    // Create virtual scroller
    const virtualScroller = new VirtualScroller(
        container,
        styles,
        (style) => {
            const clone = style.cloneNode(true);
            setupStyleCardEventListeners(clone, {
                id: clone.dataset.styleId,
                // Add other necessary style properties
            });
            return clone;
        }
    );
    
    // Store reference for later use
    window.virtualScroller = virtualScroller;
}

// Optimize style card creation with DocumentFragment
function createStyleCards(styles) {
    const fragment = document.createDocumentFragment();
    const container = document.querySelector('.styles-container');
    
    styles.forEach(style => {
        const card = createStyleCard(style);
        fragment.appendChild(card);
    });
    
    container.appendChild(fragment);
    initializeVirtualScrolling();
}

// Optimize renderer performance
document.addEventListener('DOMContentLoaded', () => {
    // Use requestIdleCallback for non-critical updates
    const idleCallback = window.requestIdleCallback || window.requestAnimationFrame;
    
    // Optimize scroll performance
    let scrollTimeout;
    const scrollHandler = () => {
        if (scrollTimeout) {
            window.cancelAnimationFrame(scrollTimeout);
        }
        scrollTimeout = window.requestAnimationFrame(() => {
            // Your scroll handling code here
        });
    };
    window.addEventListener('scroll', scrollHandler, { passive: true });
    
    // Optimize animations
    let focused = true;
    let animationFrame;
    
    window.addEventListener('focus', () => {
        focused = true;
        if (!animationFrame) {
            animationFrame = requestAnimationFrame(updateUI);
        }
    });
    
    window.addEventListener('blur', () => {
        focused = false;
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
    });
    
    // Use IntersectionObserver for lazy loading
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { rootMargin: '50px' });
    
    // Observe elements that should be lazy loaded
    document.querySelectorAll('.lazy-load').forEach(el => observer.observe(el));
    
    function updateUI() {
        if (!focused) return;
        
        // Use idle callback for non-critical updates
        idleCallback(() => {
            // Update UI here
        });
        
        animationFrame = requestAnimationFrame(updateUI);
    }
    
    // Start the UI update loop
    updateUI();
});

// Funkcja do wyświetlania animacji ładowania
function showLoadingAnimation(container, text) {
    // Remove any existing loading animations first
    const existingAnimation = container.querySelector('.loading-animation');
    if (existingAnimation) {
        existingAnimation.remove();
    }

    // Create new loading animation
    const loadingAnimation = document.createElement('div');
    loadingAnimation.className = 'loading-animation';
    loadingAnimation.innerHTML = `
        <i class="fas fa-spinner fa-spin"></i>
        <span>${text}</span>
    `;
    container.appendChild(loadingAnimation);
}

// Funkcja do usuwania animacji ładowania
function removeLoadingAnimation(container) {
    const loadingAnimation = container.querySelector('.loading-animation');
    if (loadingAnimation) {
        loadingAnimation.remove();
    }
}

// Dropdown menu functionality
const promptOptionsDropdown = document.getElementById('promptOptionsDropdown');
const dropdownMenu = document.querySelector('.prompt-options-dropdown');
const selectedOptionDisplay = promptOptionsDropdown.querySelector('.selected-option');
let selectedOption = 'standard'; // default option

function updateSelectedOption(option) {
    selectedOption = option;
    const optionDisplayText = {
        'simple': 'Simple',
        'standard': 'Standard',
        'detailed': 'Long and Detailed'
    };
    selectedOptionDisplay.textContent = optionDisplayText[option];
}

promptOptionsDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownMenu.classList.toggle('show');
});

document.addEventListener('click', (e) => {
    if (!dropdownMenu.contains(e.target) && !promptOptionsDropdown.contains(e.target)) {
        dropdownMenu.classList.remove('show');
    }
});

dropdownMenu.addEventListener('click', (e) => {
    if (e.target.classList.contains('dropdown-item')) {
        updateSelectedOption(e.target.dataset.option);
        dropdownMenu.classList.remove('show');
    }
});

// Set default option
updateSelectedOption('standard');

// Add new function for handling word marking
function initializeWordMarking() {
    const promptInput = document.getElementById('promptInput');
    const contextMenu = document.getElementById('wordContextMenu');
    const markedWordsPanel = document.getElementById('markedWordsPanel');
    const closeMarkedWords = document.getElementById('closeMarkedWords');
    
    // Add Clear All button next to close button in panel header
    // Add Clear All button functionality
    const headerButtons = document.createElement('div');
    headerButtons.className = 'panel-header-buttons';
    const clearAllBtn = document.createElement('button');
    clearAllBtn.className = 'clear-all-btn';
    clearAllBtn.innerHTML = '<i class="fas fa-eraser"></i> Clear All';
    clearAllBtn.onclick = () => {
        markedWords.positive.clear();
        markedWords.negative.clear();
        updateMarkedWordsList();
        updatePromptHighlighting();
        showToast('All marked words cleared');
    };
    headerButtons.appendChild(clearAllBtn);
    headerButtons.appendChild(closeMarkedWords);
    markedWordsPanel.querySelector('.panel-header').appendChild(headerButtons);
    let selectedText = '';
    let selectedRange = null;

    // Handle input changes for highlighting
    promptInput.addEventListener('input', updatePromptHighlighting);
    promptInput.addEventListener('scroll', () => {
        document.getElementById('promptHighlight').scrollTop = promptInput.scrollTop;
    });

    // Handle right click on prompt input
    promptInput.addEventListener('contextmenu', (e) => {
        const selection = window.getSelection();
        const text = selection.toString().trim();

        // Show menu if text is selected
        if (text) {
            e.preventDefault();
            selectedText = text;
            selectedRange = selection.getRangeAt(0);

            // Position context menu
            contextMenu.style.left = e.pageX + 'px';
            contextMenu.style.top = e.pageY + 'px';
            contextMenu.style.display = 'block';
        }
    });

    // Handle menu item clicks
    contextMenu.addEventListener('click', (e) => {
        const menuItem = e.target.closest('.menu-item');
        if (!menuItem) return;

        const action = menuItem.dataset.action;
        markWord(selectedText, action);
        updateMarkedWordsList();
        contextMenu.style.display = 'none';
        
        // Show panel when adding new word/phrase
        markedWordsPanel.classList.add('visible');
    });

    // Close context menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.word-context-menu')) {
            contextMenu.style.display = 'none';
        }
    });

    // Close marked words panel
    closeMarkedWords.addEventListener('click', () => {
        markedWordsPanel.classList.remove('visible');
    });

    // Show marked words panel button
    const showMarkedWordsBtn = document.createElement('button');
    showMarkedWordsBtn.className = 'tool-button';
    showMarkedWordsBtn.title = 'Show Marked Words';
    showMarkedWordsBtn.innerHTML = '<i class="fas fa-tags"></i><span>Marked Words</span>';
    showMarkedWordsBtn.onclick = () => {
        markedWordsPanel.classList.toggle('visible');
        updateMarkedWordsList();
    };

    // Add button to tools
    document.querySelector('.input-buttons').appendChild(showMarkedWordsBtn);
}

// Function to mark/unmark a word
function markWord(text, type) {
    if (markedWords[type].has(text)) {
        markedWords[type].delete(text);
    } else {
        // Remove from opposite list if present
        const oppositeType = type === 'positive' ? 'negative' : 'positive';
        markedWords[oppositeType].delete(text);
        markedWords[type].add(text);
    }
    
    // Update highlighting
    updatePromptHighlighting();
}

// Function to update marked words list
function updateMarkedWordsList() {
    const list = document.getElementById('markedWordsList');
    list.innerHTML = '';

    const hasPositive = markedWords.positive.size > 0;
    const hasNegative = markedWords.negative.size > 0;

    const showMarkedWordsBtn = document.querySelector('.tool-button[title="Show Marked Words"]');
    showMarkedWordsBtn.classList.toggle('has-marked-words', hasPositive || hasNegative);
    showMarkedWordsBtn.classList.toggle('has-negative', !hasPositive && hasNegative);
    showMarkedWordsBtn.classList.toggle('has-both', hasPositive && hasNegative);

    // Add positive words/phrases
    markedWords.positive.forEach(text => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="marked-positive">${text}</span>
            <i class="fas fa-times remove-mark"></i>
        `;
        li.querySelector('.remove-mark').onclick = () => {
            markWord(text, 'positive');
            updateMarkedWordsList();
        };
        list.appendChild(li);
    });

    // Add negative words/phrases
    markedWords.negative.forEach(text => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="marked-negative">${text}</span>
            <i class="fas fa-times remove-mark"></i>
        `;
        li.querySelector('.remove-mark').onclick = () => {
            markWord(text, 'negative');
            updateMarkedWordsList();
        };
        list.appendChild(li);
    });
}

// Add to DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    initializeWordMarking();
});

// Function to escape text for safe HTML insertion
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Function to highlight marked words in the prompt input
function updatePromptHighlighting() {
    const promptInput = document.getElementById('promptInput');
    const highlightDiv = document.getElementById('promptHighlight');
    const text = promptInput.value;
    
    // Ensure exact whitespace preservation
    if (!text) {
        highlightDiv.innerHTML = '';
        return;
    }
    
    // First escape HTML to prevent XSS
    let highlightedText = escapeHtml(text);
    
    // Create a regex pattern for all marked words
    const allMarkedWords = [];
    
    // Add positive words/phrases
    markedWords.positive.forEach(phrase => {
        if (phrase.trim()) {
            allMarkedWords.push({
                phrase: phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), // Escape regex special chars
                type: 'positive'
            });
        }
    });
    
    // Add negative words/phrases
    markedWords.negative.forEach(phrase => {
        if (phrase.trim()) {
            allMarkedWords.push({
                phrase: phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                type: 'negative'
            });
        }
    });
    
    // Sort by length (longest first) to handle overlapping matches correctly
    allMarkedWords.sort((a, b) => b.phrase.length - a.phrase.length);
    
    // Create an array of text parts and their types
    const parts = [];
    let lastIndex = 0;
    
    // Find all matches and their positions
    const matches = [];
    allMarkedWords.forEach(({ phrase, type }) => {
        const regex = new RegExp(phrase, 'gi');
        let match;
        while ((match = regex.exec(text)) !== null) {
            matches.push({
                start: match.index,
                end: match.index + match[0].length,
                text: match[0],
                type
            });
        }
    });
    
    // Sort matches by start position
    matches.sort((a, b) => a.start - b.start);
    
    // Build highlighted text
    matches.forEach(match => {
        if (match.start > lastIndex) {
            // Add non-highlighted text before this match
            parts.push(escapeHtml(text.substring(lastIndex, match.start)));
        }
        // Add highlighted text
        parts.push(`<span class="highlight-${match.type}">${escapeHtml(match.text)}</span>`);
        lastIndex = match.end;
    });
    
    // Add any remaining text
    if (lastIndex < text.length) {
        parts.push(escapeHtml(text.substring(lastIndex)));
    }
    
    // Join all parts
    highlightedText = parts.join('');
    
    // Replace newlines with <br> for proper display
    highlightedText = highlightedText.replace(/\n/g, '<br>');
    
    // Add a space at the end to ensure proper text wrapping
    highlightedText += '&nbsp;';
    
    // Update the highlight div
    highlightDiv.innerHTML = highlightedText;
    
    // Sync scroll position
    highlightDiv.scrollTop = promptInput.scrollTop;
}
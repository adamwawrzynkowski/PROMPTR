const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', async () => {
    const promptInput = document.getElementById('prompt-input');
    const tagsContainer = document.getElementById('tags-container');
    let tagGenerationTimeout;
    let isGenerating = false;
    let activeStyles = new Set(['realistic', 'cinematic', 'vintage', 'artistic', 'abstract', 'poetic', 'anime', 'cartoon', 'cute', 'scifi']);

    // Funkcja do aktualizacji widoczności przycisku Draw Things
    async function updateDrawThingsButton() {
        try {
            const settings = await ipcRenderer.invoke('get-settings');
            console.log('Draw Things settings:', settings.drawThingsIntegration);
            
            const drawThingsBtn = document.getElementById('draw-things-btn');
            if (!drawThingsBtn) {
                console.error('Draw Things button not found');
                return;
            }

            // Domyślnie ukryj przycisk
            drawThingsBtn.style.display = 'none';

            // Sprawdź czy integracja jest włączona
            if (!settings.drawThingsIntegration.enabled) {
                console.log('Draw Things integration disabled');
                return;
            }

            // Sprawdź dostępność Draw Things
            const isAvailable = await ipcRenderer.invoke('check-draw-things');
            console.log('Draw Things availability check result:', isAvailable);

            // Pokaż przycisk tylko jeśli Draw Things jest dostępne
            drawThingsBtn.style.display = isAvailable ? 'flex' : 'none';
            console.log('Draw Things button visibility set to:', drawThingsBtn.style.display);
        } catch (error) {
            console.error('Error updating Draw Things button:', error);
            const drawThingsBtn = document.getElementById('draw-things-btn');
            if (drawThingsBtn) {
                drawThingsBtn.style.display = 'none';
            }
        }
    }

    // Natychmiastowe sprawdzenie statusu Draw Things
    console.log('Initial Draw Things status check...');
    await updateDrawThingsButton();

    // Sprawdzaj status Draw Things co 5 sekund
    const drawThingsInterval = setInterval(updateDrawThingsButton, 5000);

    // Czyszczenie interwału przy zamknięciu okna
    window.addEventListener('beforeunload', () => {
        clearInterval(drawThingsInterval);
    });

    // Dodaj event listener dla przycisku Draw Things
    const drawThingsBtn = document.getElementById('draw-things-btn');
    if (drawThingsBtn) {
        drawThingsBtn.onclick = async () => {
            console.log('Draw Things button clicked');
            const promptText = promptInput.value.trim();
            
            if (!promptText) {
                console.log('Empty prompt, showing toast');
                showToast('Please enter a prompt first');
                return;
            }

            try {
                console.log('Sending prompt to Draw Things:', promptText);
                const result = await ipcRenderer.invoke('send-to-draw-things', promptText);
                console.log('Draw Things response:', result);
                showToast('Prompt sent to Draw Things');
            } catch (error) {
                console.error('Error sending to Draw Things:', error);
                showToast(error.message);
            }
        };
    }

    // Funkcja do wyświetlania tagów
    function displayTags(tags) {
        if (!tagsContainer) return;
        
        if (Array.isArray(tags) && tags.length > 0) {
            tagsContainer.innerHTML = tags
                .map(tag => `<span class="tag" data-tag="${tag}">${tag}</span>`)
                .join('');

            // Dodaj event listenery do tagów
            document.querySelectorAll('.tag').forEach(tagElement => {
                tagElement.addEventListener('click', () => {
                    const tag = tagElement.dataset.tag;
                    const currentPrompt = promptInput.value.trim();
                    promptInput.value = currentPrompt ? `${currentPrompt}, ${tag}` : tag;
                    promptInput.dispatchEvent(new Event('input')); // Trigger regeneracji promptów
                });
            });
        } else {
            tagsContainer.innerHTML = '';
        }
    }

    // Event listener do generowania tagów i promptów
    if (promptInput) {
        let promptGenerationTimeout;
        let translationTimeout;
        let lastTranslationCheck = 0;
        const TYPING_DELAY = 1000; // Czekaj 1 sekundę po zakończeniu pisania
        const TRANSLATION_DELAY = 1500; // Opóźnienie między sprawdzeniami tłumaczenia

        promptInput.addEventListener('input', async (e) => {
            const settings = await ipcRenderer.invoke('get-settings');
            clearTimeout(promptGenerationTimeout);
            clearTimeout(translationTimeout);
            clearTimeout(tagGenerationTimeout);
            
            const text = e.target.value.trim();
            
            if (text.length > 0) {
                if (settings.tagGeneration) {
                    tagsContainer.innerHTML = '<span class="tag loading">Waiting for input...</span>';
                } else {
                    tagsContainer.innerHTML = '';
                }

                document.querySelectorAll('.suggestion-area').forEach(area => {
                    area.innerHTML = '<p class="loading">Waiting for input...</p>';
                });

                translationTimeout = setTimeout(async () => {
                    try {
                        let processedText = text;
                        if (settings.promptTranslation) {
                            processedText = await handlePromptTranslation(text);
                        }
                        
                        if (processedText) {
                            if (settings.tagGeneration) {
                                try {
                                    const tags = await ipcRenderer.invoke('generate-tags', processedText);
                                    displayTags(tags);
                                } catch (error) {
                                    console.error('Error generating tags:', error);
                                    tagsContainer.innerHTML = '<span class="tag error">Error generating tags</span>';
                                }
                            }

                            if (!isGenerating) {
                                generateAllPrompts(processedText);
                            }
                        }
                    } catch (error) {
                        console.error('Error:', error);
                        showToast('Error: ' + error.message);
                    }
                }, TYPING_DELAY);
            } else {
                // Wyczyść wszystko jeśli pole jest puste
                tagsContainer.innerHTML = '';
                document.querySelectorAll('.suggestion-area').forEach(area => {
                    area.innerHTML = '';
                });
                document.querySelectorAll('.apply-btn').forEach(btn => {
                    btn.disabled = true;
                });
            }
        });
    }

    // Funkcja generowania promptów
    async function generateAllPrompts(basePrompt) {
        if (!basePrompt.trim() || isGenerating) return;

        isGenerating = true;
        const cards = document.querySelectorAll('.option-card');
        const settings = await ipcRenderer.invoke('get-settings');
        
        cards.forEach(card => {
            const suggestionArea = card.querySelector('.suggestion-area');
            suggestionArea.innerHTML = '<p class="loading">Generating...</p>';
        });

        try {
            for (const card of Array.from(cards)) {
                const styleId = card.dataset.styleId;
                const suggestionArea = card.querySelector('.suggestion-area');
                
                try {
                    const improvedPrompt = await ipcRenderer.invoke('generate-prompt', basePrompt, styleId);
                    suggestionArea.textContent = improvedPrompt;
                    const applyBtn = card.querySelector('.apply-btn');
                    applyBtn.disabled = false;

                    // Jeśli włączony jest slow mode, dodaj opóźnienie przed następnym promptem
                    if (settings.slowMode) {
                        await new Promise(resolve => setTimeout(resolve, settings.slowModeDelay));
                    }
                } catch (error) {
                    suggestionArea.innerHTML = `<p class="error">Error: ${error.message}</p>`;
                }
            }
        } catch (error) {
            console.error('Error generating prompts:', error);
        } finally {
            isGenerating = false;
        }
    }

    // Funkcja ładowania stylów
    async function loadStyles() {
        const styles = await ipcRenderer.invoke('get-available-styles');
        const optionsGrid = document.querySelector('.options-grid');
        
        optionsGrid.innerHTML = Object.entries(styles)
            .filter(([id]) => activeStyles.has(id))
            .map(([id, style]) => `
                <div class="option-card" data-style-id="${id}">
                    <div class="card-header">
                        <h2><i class="fas fa-${style.icon}"></i> ${style.name}</h2>
                        <button class="refresh-btn" title="Refresh prompt">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    </div>
                    <p>${style.description}</p>
                    <div class="suggestion-area"></div>
                    <button class="apply-btn" disabled>Apply</button>
                </div>
            `).join('');

        addCardEventListeners();
    }

    // Funkcja dodająca event listenery do kart
    function addCardEventListeners() {
        document.querySelectorAll('.option-card').forEach(card => {
            const applyBtn = card.querySelector('.apply-btn');
            applyBtn.addEventListener('click', async () => {
                const suggestionArea = card.querySelector('.suggestion-area');
                const improvedPrompt = suggestionArea.textContent;
                if (improvedPrompt && !improvedPrompt.includes('Generating...')) {
                    promptInput.value = improvedPrompt;
                    addToHistory(improvedPrompt, card.querySelector('h2').textContent.trim());
                    
                    // Generuj nowe tagi dla nowego promptu
                    try {
                        const tags = await ipcRenderer.invoke('generate-tags', improvedPrompt);
                        displayTags(tags);
                    } catch (error) {
                        console.error('Error generating tags:', error);
                        tagsContainer.innerHTML = '<span class="tag error">Error generating tags</span>';
                    }

                    // Generuj nowe prompty dla wszystkich stylów
                    if (!isGenerating) {
                        generateAllPrompts(improvedPrompt);
                    }
                }
            });

            // Dodaj efekt hover
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / card.offsetWidth) * 100;
                const y = ((e.clientY - rect.top) / card.offsetHeight) * 100;
                card.style.setProperty('--mouse-x', `${x}%`);
                card.style.setProperty('--mouse-y', `${y}%`);
            });
        });

        // Dodaj obsługę przycisku refresh dla pojedynczego kafelka
        document.querySelectorAll('.refresh-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const card = btn.closest('.option-card');
                const styleId = card.dataset.styleId;
                const promptText = promptInput.value.trim();
                
                if (promptText && !isGenerating) {
                    const suggestionArea = card.querySelector('.suggestion-area');
                    suggestionArea.innerHTML = '<p class="loading">Generating...</p>';
                    
                    try {
                        const improvedPrompt = await ipcRenderer.invoke('generate-prompt', promptText, styleId);
                        suggestionArea.textContent = improvedPrompt;
                        card.querySelector('.apply-btn').disabled = false;
                    } catch (error) {
                        suggestionArea.innerHTML = `<p class="error">Error: ${error.message}</p>`;
                    }
                }
            });
        });
    }

    // Event listeners dla przycisków
    document.getElementById('vision-btn')?.addEventListener('click', () => {
        ipcRenderer.send('open-vision');
    });

    document.getElementById('manage-styles-btn')?.addEventListener('click', () => {
        ipcRenderer.send('open-styles');
    });

    document.getElementById('copy-prompt')?.addEventListener('click', () => {
        const promptText = promptInput.value.trim();
        if (promptText) {
            navigator.clipboard.writeText(promptText);
            showToast('Prompt copied to clipboard');
        }
    });

    document.getElementById('clear-prompt')?.addEventListener('click', () => {
        promptInput.value = '';
        tagsContainer.innerHTML = '';
    });

    // Event listeners dla przycisków w titlebar
    document.getElementById('connection-btn')?.addEventListener('click', () => {
        ipcRenderer.send('open-config');
    });

    document.getElementById('history-btn')?.addEventListener('click', () => {
        document.querySelector('.history-panel').classList.toggle('open');
        updateHistoryDisplay();
    });

    document.getElementById('settings-btn')?.addEventListener('click', () => {
        ipcRenderer.send('open-settings');
    });

    // Obsługa historii
    let promptHistory = JSON.parse(localStorage.getItem('promptHistory') || '[]');

    function addToHistory(prompt, style) {
        const historyItem = {
            prompt,
            style,
            timestamp: new Date().toISOString()
        };
        
        promptHistory.unshift(historyItem);
        if (promptHistory.length > 50) {
            promptHistory.pop();
        }
        
        localStorage.setItem('promptHistory', JSON.stringify(promptHistory));
        updateHistoryDisplay();
    }

    function updateHistoryDisplay() {
        const historyContent = document.querySelector('.history-content');
        if (!historyContent) return;
        
        if (promptHistory.length === 0) {
            historyContent.innerHTML = '<div class="history-empty">No history yet</div>';
            return;
        }

        historyContent.innerHTML = promptHistory.map((item, index) => `
            <div class="history-item" data-index="${index}">
                <div class="history-item-header">
                    <span class="history-item-style">${item.style}</span>
                    <span class="history-item-date">${new Date(item.timestamp).toLocaleString()}</span>
                </div>
                <div class="history-item-prompt">${item.prompt}</div>
                <div class="history-item-actions">
                    <button class="history-action-btn copy-btn" title="Copy prompt">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="history-action-btn delete-btn" title="Delete from history">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

        // Dodaj event listenery do przycisków historii
        document.querySelectorAll('.history-item').forEach(item => {
            const index = item.dataset.index;
            
            item.querySelector('.copy-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                const prompt = promptHistory[index].prompt;
                navigator.clipboard.writeText(prompt);
                showToast('Prompt copied to clipboard');
            });
            
            item.querySelector('.delete-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                promptHistory.splice(index, 1);
                localStorage.setItem('promptHistory', JSON.stringify(promptHistory));
                updateHistoryDisplay();
                showToast('Prompt removed from history');
            });

            // Dodaj możliwość kliknięcia w historię, aby załadować prompt
            item.addEventListener('click', () => {
                const prompt = promptHistory[index].prompt;
                promptInput.value = prompt;
                if (!isGenerating) {
                    generateAllPrompts(prompt);
                }
            });
        });
    }

    // Dodaj obsługę zamykania historii
    document.querySelector('.history-close')?.addEventListener('click', () => {
        document.querySelector('.history-panel').classList.remove('open');
    });

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

    // Funkcja do obsługi tłumaczenia
    async function handlePromptTranslation(promptText) {
        const translationOverlay = document.getElementById('translation-overlay');
        const statusText = document.getElementById('translation-status-text');
        const progressFill = document.querySelector('.translation-progress .progress-fill');
        
        try {
            // Wykryj język i przetłumacz jeśli potrzeba
            const result = await ipcRenderer.invoke('detect-and-translate', promptText);
            
            if (result.isTranslated) {
                // Pokaż overlay tylko dla tłumaczenia
                translationOverlay.style.display = 'flex';
                progressFill.style.width = '30%';
                statusText.textContent = `Translating from ${result.originalLanguage.toUpperCase()}...`;
                
                await new Promise(resolve => setTimeout(resolve, 300));
                progressFill.style.width = '60%';
                
                // Aktualizuj pole promptu
                document.getElementById('prompt-input').value = result.translatedText;
                
                await new Promise(resolve => setTimeout(resolve, 300));
                progressFill.style.width = '100%';
                statusText.textContent = 'Translation complete!';
                
                await new Promise(resolve => setTimeout(resolve, 500));
                
                showToast(`Translated from ${result.originalLanguage.toUpperCase()} to English`);
                
                // Ukryj overlay
                setTimeout(() => {
                    translationOverlay.style.display = 'none';
                    progressFill.style.width = '0%';
                }, 300);
            }
            
            return result.translatedText;
        } catch (error) {
            console.error('Translation error:', error);
            showToast('Translation failed: ' + error.message);
            return null;
        }
    }

    // Inicjalizacja
    updateStyleSelector();
    loadStyles();

    // Nasłuchiwanie na wydarzenia
    ipcRenderer.on('tags-generated', (event, tags) => {
        console.log('Received tags from main process:', tags);
        displayTags(tags);
    });

    ipcRenderer.on('tags-generated-error', (event, error) => {
        console.error('Tag generation error:', error);
        tagsContainer.innerHTML = `<span class="tag error">${error}</span>`;
    });

    ipcRenderer.on('set-prompt', (event, prompt) => {
        if (promptInput && prompt) {
            promptInput.value = prompt;
            promptInput.dispatchEvent(new Event('input'));
        }
    });

    ipcRenderer.on('ollama-status', (event, status) => {
        const connectionBtn = document.getElementById('connection-btn');
        const tooltip = connectionBtn?.querySelector('.tooltip');
        
        if (connectionBtn && tooltip) {
            if (status.isConnected) {
                connectionBtn.classList.add('connected');
                connectionBtn.classList.remove('disconnected');
                tooltip.textContent = `Connected (${status.currentModel || 'No model selected'})`;
            } else {
                connectionBtn.classList.add('disconnected');
                connectionBtn.classList.remove('connected');
                tooltip.textContent = 'Disconnected';
            }
        }
    });

    // Funkcja aktualizacji selektora stylów
    async function updateStyleSelector() {
        const styles = await ipcRenderer.invoke('get-available-styles');
        const styleSelector = document.querySelector('.style-tags');
        
        if (styleSelector) {
            styleSelector.innerHTML = Object.entries(styles)
                .map(([id, style]) => `
                    <div class="style-tag ${activeStyles.has(id) ? 'active' : ''}" data-style-id="${id}">
                        <i class="fas fa-${style.icon}"></i>
                        ${style.name}
                    </div>
                `).join('');

            // Dodaj event listenery do tagów stylów
            document.querySelectorAll('.style-tag').forEach(tag => {
                tag.addEventListener('click', () => {
                    const styleId = tag.dataset.styleId;
                    if (activeStyles.has(styleId)) {
                        activeStyles.delete(styleId);
                        tag.classList.remove('active');
                    } else {
                        activeStyles.add(styleId);
                        tag.classList.add('active');
                    }
                    loadStyles();
                });
            });
        }
    }

    // Nasłuchuj na wynik analizy obrazu
    ipcRenderer.on('vision-result', (event, description, source) => {
        if (source === 'prompt' && promptInput) {
            promptInput.value = description;
            promptInput.dispatchEvent(new Event('input'));
        }
    });

    // Zaktualizuj obsługę przycisku Generate
    document.getElementById('generate-btn').addEventListener('click', async () => {
        const promptInput = document.getElementById('prompt-input');
        const styleSelect = document.getElementById('style-select');
        
        try {
            const promptText = promptInput.value.trim();
            if (!promptText) {
                showNotification('Please enter a prompt', 'warning');
                return;
            }
            
            // Najpierw przetłumacz tekst jeśli potrzeba
            const translatedText = await handlePromptTranslation(promptText);
            
            // Kontynuuj z przetłumaczonym tekstem
            const styleId = styleSelect.value;
            const improvedPrompt = await ipcRenderer.invoke('generate-prompt', translatedText, styleId);
            promptInput.value = improvedPrompt;
            
            // Generuj tagi
            await generateTags(improvedPrompt);
        } catch (error) {
            console.error('Error:', error);
            showNotification(error.message, 'error');
        }
    });

    // Nasłuchuj na zmiany ustawień
    ipcRenderer.on('settings-updated', async () => {
        console.log('Settings updated, updating Draw Things button'); // Debug log
        await updateDrawThingsButton();
    });
});
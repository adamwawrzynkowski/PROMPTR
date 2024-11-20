const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', async () => {
    // Dodaj obsługę przycisków kontrolnych okna
    document.getElementById('minimize-btn').addEventListener('click', () => {
        ipcRenderer.send('minimize-window');
    });

    document.getElementById('maximize-btn').addEventListener('click', () => {
        ipcRenderer.send('maximize-window');
    });

    document.getElementById('close-btn').addEventListener('click', () => {
        ipcRenderer.send('close-window');
    });

    // Aktualizuj ikonę maximize/restore
    ipcRenderer.on('window-state-change', (event, isMaximized) => {
        const maximizeBtn = document.getElementById('maximize-btn');
        if (maximizeBtn) {
            maximizeBtn.querySelector('i').className = isMaximized ? 
                'fas fa-compress' : 'fas fa-expand';
        }
    });

    // Zmienne globalne
    const tagsContainer = document.getElementById('tags-container');
    const mainPromptInput = document.getElementById('prompt-input');
    const translationOverlay = document.getElementById('translation-overlay');
    const translationStatusText = document.getElementById('translation-status-text');
    
    let tagGenerationTimeout;
    let isGenerating = false;
    let currentPrompt = '';
    let activeStyles = new Set(['realistic', 'cinematic', 'vintage', 'artistic', 'abstract', 'poetic', 'anime', 'cartoon', 'cute', 'scifi']);
    let drawThingsInterval;
    let promptHistory = JSON.parse(localStorage.getItem('promptHistory') || '[]');

    // Funkcja do wyświetlania tagów
    function displayTags(tags) {
        if (!tagsContainer) return;
        
        if (tags === 'waiting') {
            tagsContainer.innerHTML = '<span class="tag loading">Waiting for input...</span>';
            return;
        }
        
        if (tags === 'generating') {
            tagsContainer.innerHTML = '<span class="tag loading">Generating tags...</span>';
            return;
        }
        
        if (Array.isArray(tags) && tags.length > 0) {
            tagsContainer.innerHTML = tags
                .map(tag => `<span class="tag" data-tag="${tag}">${tag}</span>`)
                .join('');

            // Dodaj event listenery do tagów
            document.querySelectorAll('.tag').forEach(tagElement => {
                tagElement.addEventListener('click', () => {
                    const tag = tagElement.dataset.tag;
                    const currentPromptText = mainPromptInput.value.trim();
                    mainPromptInput.value = currentPromptText ? `${currentPromptText}, ${tag}` : tag;
                    mainPromptInput.dispatchEvent(new Event('input'));
                });
            });
        } else {
            tagsContainer.innerHTML = '';
        }
    }

    // Funkcja do pokazywania statusu tłumaczenia
    function showTranslationStatus(message) {
        const overlay = document.getElementById('translation-overlay');
        const statusText = document.getElementById('translation-status-text');
        const progressFill = document.querySelector('.translation-progress .progress-fill');
        
        if (overlay && statusText) {
            overlay.style.display = 'block';
            statusText.textContent = message;
            if (progressFill) {
                progressFill.style.width = '50%';
            }
        }
    }

    // Funkcja do ukrywania statusu tłumaczenia
    function hideTranslationStatus() {
        const overlay = document.getElementById('translation-overlay');
        const progressFill = document.querySelector('.translation-progress .progress-fill');
        
        if (overlay) {
            overlay.style.display = 'none';
            if (progressFill) {
                progressFill.style.width = '0%';
            }
        }
    }

    // Funkcja ładowania stylów
    async function loadStyles() {
        try {
            const styles = await ipcRenderer.invoke('get-available-styles');
            const optionsGrid = document.querySelector('.options-grid');
            
            if (optionsGrid) {
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
        } catch (error) {
            console.error('Error loading styles:', error);
        }
    }

    // Funkcja generowania promptów
    async function generateAllPrompts(basePrompt) {
        if (!basePrompt.trim() || isGenerating) return;

        isGenerating = true;
        const cards = document.querySelectorAll('.option-card');
        const settings = await ipcRenderer.invoke('get-settings');
        
        cards.forEach(card => {
            const suggestionArea = card.querySelector('.suggestion-area');
            if (suggestionArea) {
                suggestionArea.innerHTML = '<p class="loading">Generating...</p>';
            }
        });

        try {
            for (const card of Array.from(cards)) {
                const styleId = card.dataset.styleId;
                const suggestionArea = card.querySelector('.suggestion-area');
                
                try {
                    const improvedPrompt = await ipcRenderer.invoke('generate-prompt', basePrompt, styleId);
                    if (suggestionArea) {
                        suggestionArea.textContent = improvedPrompt;
                        const applyBtn = card.querySelector('.apply-btn');
                        if (applyBtn) {
                            applyBtn.disabled = false;
                        }
                    }

                    if (settings.slowMode) {
                        await new Promise(resolve => setTimeout(resolve, settings.slowModeDelay));
                    }
                } catch (error) {
                    if (suggestionArea) {
                        suggestionArea.innerHTML = `<p class="error">Error: ${error.message}</p>`;
                    }
                }
            }
        } catch (error) {
            console.error('Error generating prompts:', error);
        } finally {
            isGenerating = false;
        }
    }

    // Funkcja aktualizacji selektora stylów
    async function updateStyleSelector() {
        try {
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
                        loadStyles(); // Przeładuj kafelki po zmianie aktywnych stylów
                    });
                });
            }
        } catch (error) {
            console.error('Error updating style selector:', error);
        }
    }

    // Funkcja dodająca event listenery do kafelków
    function addCardEventListeners() {
        // Event listenery dla przycisków Apply
        document.querySelectorAll('.option-card').forEach(card => {
            const applyBtn = card.querySelector('.apply-btn');
            if (applyBtn) {
                applyBtn.addEventListener('click', () => {
                    const suggestionArea = card.querySelector('.suggestion-area');
                    if (suggestionArea && suggestionArea.textContent) {
                        mainPromptInput.value = suggestionArea.textContent;
                        mainPromptInput.dispatchEvent(new Event('input')); // Trigger regeneracji tagów
                    }
                });
            }

            // Event listenery dla przycisków Refresh
            const refreshBtn = card.querySelector('.refresh-btn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const styleId = card.dataset.styleId;
                    const promptText = mainPromptInput.value.trim();
                    
                    if (promptText && !isGenerating) {
                        const suggestionArea = card.querySelector('.suggestion-area');
                        if (suggestionArea) {
                            suggestionArea.innerHTML = '<p class="loading">Generating...</p>';
                            try {
                                const improvedPrompt = await ipcRenderer.invoke('generate-prompt', promptText, styleId);
                                suggestionArea.textContent = improvedPrompt;
                                const applyBtn = card.querySelector('.apply-btn');
                                if (applyBtn) {
                                    applyBtn.disabled = false;
                                }
                            } catch (error) {
                                suggestionArea.innerHTML = `<p class="error">Error: ${error.message}</p>`;
                            }
                        }
                    }
                });
            }
        });

        // Event listener dla przycisku Refresh All
        const refreshAllBtn = document.getElementById('refresh-all-btn');
        if (refreshAllBtn) {
            refreshAllBtn.addEventListener('click', () => {
                const promptText = mainPromptInput.value.trim();
                if (promptText && !isGenerating) {
                    generateAllPrompts(promptText);
                }
            });
        }
    }

    // Dodaj nasłuchiwanie na aktualizacje tagów
    ipcRenderer.on('tags-generated', (event, tags) => {
        console.log('Received tags:', tags);
        displayTags(Array.isArray(tags) ? tags : []);
    });

    // Dodaj nasłuchiwanie na błędy generowania tagów
    ipcRenderer.on('tags-generated-error', (event, error) => {
        console.error('Tag generation error:', error);
        if (tagsContainer) {
            tagsContainer.innerHTML = `<span class="tag error">Error: ${error}</span>`;
        }
    });

    // Inicjalizacja
    await loadStyles();
    await updateStyleSelector();

    // Dodaj nową funkcję do obsługi tłumaczenia
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
            showTranslationStatus('Checking language...');
            
            // Wyślij tekst do tłumaczenia
            const translationResult = await ipcRenderer.invoke('detect-and-translate', text);
            console.log('Translation result:', translationResult);

            if (translationResult.isTranslated) {
                // Aktualizuj status tłumaczenia
                showTranslationStatus(`Translating from ${translationResult.originalLanguage.toUpperCase()}...`);
                
                // Aktualizuj pasek postępu
                const progressFill = document.querySelector('.translation-progress .progress-fill');
                if (progressFill) {
                    progressFill.style.width = '100%';
                }
                
                // Aktualizuj pole wprowadzania
                mainPromptInput.value = translationResult.translatedText;
                
                // Pokaż powiadomienie
                showToast(`Translated from ${translationResult.originalLanguage.toUpperCase()} to English`);
                
                // Ukryj overlay po krótkim opóźnieniu
                setTimeout(() => {
                    hideTranslationStatus();
                    if (progressFill) {
                        progressFill.style.width = '0%';
                    }
                }, 2000);
                
                return translationResult.translatedText;
            }

            // Jeśli nie było tłumaczenia, ukryj overlay
            hideTranslationStatus();
            return text;

        } catch (error) {
            console.error('Translation error:', error);
            hideTranslationStatus();
            showToast('Translation error: ' + error.message);
            return text;
        }
    }

    // Zmodyfikuj event listener dla input
    if (mainPromptInput) {
        mainPromptInput.addEventListener('input', async (e) => {
            const text = e.target.value.trim();
            clearTimeout(tagGenerationTimeout);

            if (text) {
                // Pokaż status oczekiwania
                displayTags('waiting');
                document.querySelectorAll('.suggestion-area').forEach(area => {
                    area.innerHTML = '<p class="loading">Waiting for input...</p>';
                });

                tagGenerationTimeout = setTimeout(async () => {
                    try {
                        // Najpierw przetłumacz tekst
                        const translatedText = await handleTranslation(text);
                        
                        if (translatedText) {
                            const settings = await ipcRenderer.invoke('get-settings');
                            if (settings.tagGeneration) {
                                displayTags('generating');
                                const tags = await ipcRenderer.invoke('generate-tags', translatedText);
                                displayTags(tags);
                            }
                            
                            // Generuj prompty dla stylów
                            if (!isGenerating) {
                                generateAllPrompts(translatedText);
                            }
                        }
                    } catch (error) {
                        console.error('Error:', error);
                        displayTags([]);
                        showToast('Error: ' + error.message);
                    }
                }, 1000);
            } else {
                displayTags([]);
                document.querySelectorAll('.suggestion-area').forEach(area => {
                    area.innerHTML = '';
                });
            }
        });
    }

    // Dodaj pozostałe event listenery i funkcje...

    // Obsługa przycisków w interfejsie
    const visionBtn = document.getElementById('vision-btn');
    if (visionBtn) {
        visionBtn.addEventListener('click', () => {
            ipcRenderer.send('open-vision');
        });
    }

    const copyPromptBtn = document.getElementById('copy-prompt');
    if (copyPromptBtn) {
        copyPromptBtn.addEventListener('click', () => {
            const promptText = mainPromptInput.value.trim();
            if (promptText) {
                navigator.clipboard.writeText(promptText);
                showToast('Prompt copied to clipboard');
            }
        });
    }

    const clearPromptBtn = document.getElementById('clear-prompt');
    if (clearPromptBtn) {
        clearPromptBtn.addEventListener('click', () => {
            mainPromptInput.value = '';
            tagsContainer.innerHTML = '';
            document.querySelectorAll('.suggestion-area').forEach(area => {
                area.innerHTML = '';
            });
        });
    }

    const manageStylesBtn = document.getElementById('manage-styles-btn');
    if (manageStylesBtn) {
        manageStylesBtn.addEventListener('click', () => {
            ipcRenderer.send('open-styles');
        });
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

    // Obsługa statusu połączenia
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
                tooltip.textContent = status.error || 'Disconnected';
            }
        }
    });

    // Obsługa przycisku konfiguracji
    const connectionBtn = document.getElementById('connection-btn');
    if (connectionBtn) {
        connectionBtn.addEventListener('click', () => {
            ipcRenderer.send('open-config');
        });
    }

    // Obsługa przycisku ustawień
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            ipcRenderer.send('open-settings');
        });
    }

    // Nasłuchiwanie na aktualizacje ustawień
    ipcRenderer.on('settings-updated', async () => {
        console.log('Settings updated, reloading settings...');
        const settings = await ipcRenderer.invoke('get-settings');
        console.log('New settings:', settings);
        
        // Odśwież interfejs zgodnie z nowymi ustawieniami
        if (mainPromptInput.value.trim()) {
            mainPromptInput.dispatchEvent(new Event('input'));
        }
        
        // Aktualizuj widoczność przycisku Draw Things
        await updateDrawThingsButton();
    });

    // Nasłuchiwanie na odświeżenie stylów
    ipcRenderer.on('refresh-styles', async () => {
        await loadStyles();
        await updateStyleSelector();
    });

    // Nasłuchiwanie na wynik analizy obrazu
    ipcRenderer.on('vision-result', (event, description) => {
        if (mainPromptInput) {
            mainPromptInput.value = description;
            mainPromptInput.dispatchEvent(new Event('input'));
        }
    });

    // Nasłuchiwanie na błędy
    ipcRenderer.on('error', (event, error) => {
        console.error('Error:', error);
        showToast(error.message || 'An error occurred');
    });

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

            // Sprawdź czy integracja jest włączona w ustawieniach
            if (!settings.drawThingsIntegration.enabled) {
                console.log('Draw Things integration disabled in settings');
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
    drawThingsInterval = setInterval(updateDrawThingsButton, 5000);

    // Nasłuchiwanie na aktualizacje ustawień
    ipcRenderer.on('settings-updated', async () => {
        console.log('Settings updated, checking Draw Things status');
        await updateDrawThingsButton();
    });

    // Czyszczenie interwału przy zamknięciu okna
    window.addEventListener('beforeunload', () => {
        if (drawThingsInterval) {
            clearInterval(drawThingsInterval);
        }
    });

    // Dodaj funkcje obsługi historii
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
                mainPromptInput.value = prompt;
                if (!isGenerating) {
                    generateAllPrompts(prompt);
                }
            });
        });
    }

    // Dodaj obsługę przycisku historii
    const historyBtn = document.getElementById('history-btn');
    const historyPanel = document.querySelector('.history-panel');
    const historyCloseBtn = document.querySelector('.history-close');

    if (historyBtn) {
        historyBtn.addEventListener('click', () => {
            historyPanel.classList.toggle('open');
            updateHistoryDisplay();
        });
    }

    if (historyCloseBtn) {
        historyCloseBtn.addEventListener('click', () => {
            historyPanel.classList.remove('open');
        });
    }

    // W sekcji "Obsługa przycisków w interfejsie"
    const drawThingsBtn = document.getElementById('draw-things-btn');
    if (drawThingsBtn) {
        drawThingsBtn.addEventListener('click', async () => {
            console.log('Draw Things button clicked');
            const promptText = mainPromptInput.value.trim();
            
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
        });
    }

    // Dodaj w sekcji event listenerów
    ipcRenderer.on('model-install-progress', (event, data) => {
        console.log('Received model install progress:', data);
        updateModelProgress(data);
    });

    // Dodaj nasłuchiwanie na zakończenie instalacji
    ipcRenderer.on('model-install-complete', (event, data) => {
        console.log('Model installation completed:', data);
        updateModelProgress({
            modelName: data.modelName,
            progress: 100,
            status: 'Installation completed',
            downloadedSize: 0,
            totalSize: 0
        });
        showToast('Model installed successfully');
    });

    // Dodaj nasłuchiwanie na błędy instalacji
    ipcRenderer.on('model-install-error', (event, error) => {
        console.error('Model installation error:', error);
        const modelCard = document.querySelector(`[data-model="${error.modelName}"]`);
        if (modelCard) {
            const statusText = modelCard.querySelector('.model-status');
            if (statusText) {
                statusText.textContent = `Error: ${error.message || 'Installation failed'}`;
                statusText.classList.add('error');
            }
        }
        showToast('Model installation failed: ' + (error.message || 'Unknown error'));
    });

    // Funkcja do aktualizacji postępu pobierania modelu
    function updateModelProgress(data) {
        const overlay = document.getElementById('model-progress-overlay');
        const modelName = overlay.querySelector('.model-name');
        const progressBar = overlay.querySelector('.progress-fill');
        const progressPercentage = overlay.querySelector('.progress-percentage');
        const downloadedSize = overlay.querySelector('.downloaded-size');
        const totalSize = overlay.querySelector('.total-size');
        const statusMessage = overlay.querySelector('.model-status-message');

        // Pokaż overlay
        overlay.style.display = 'flex';

        // Aktualizuj nazwę modelu
        if (data.modelName) {
            modelName.textContent = data.modelName;
        }

        // Aktualizuj pasek postępu
        if (data.progress !== undefined) {
            progressBar.style.width = `${data.progress}%`;
            progressPercentage.textContent = `${Math.round(data.progress)}%`;
        }

        // Aktualizuj rozmiary
        if (data.downloadedSize && data.totalSize) {
            const downloadedGB = (data.downloadedSize / (1024 * 1024 * 1024)).toFixed(2);
            const totalGB = (data.totalSize / (1024 * 1024 * 1024)).toFixed(2);
            downloadedSize.textContent = `${downloadedGB} GB`;
            totalSize.textContent = `${totalGB} GB`;
        }

        // Aktualizuj status
        if (data.status) {
            statusMessage.textContent = data.status;
        }

        // Jeśli pobieranie zakończone
        if (data.progress >= 100) {
            setTimeout(() => {
                overlay.style.display = 'none';
                showToast('Model installed successfully');
            }, 1000);
        }
    }

    // Zaktualizuj obsługę przycisku kawy
    document.querySelector('.coffee-button').addEventListener('click', () => {
        require('electron').shell.openExternal('https://buymeacoffee.com/a_wawrzynkowski');
    });

    // Dodaj w sekcji event listenerów
    document.querySelector('.credits-button').addEventListener('click', () => {
        ipcRenderer.send('open-credits');
    });
});
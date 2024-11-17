const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    const promptInput = document.getElementById('prompt-input');
    const tagsContainer = document.getElementById('tags-container');
    let tagGenerationTimeout;
    let drawThingsButton = null;
    let isGenerating = false;
    let activeStyles = new Set(['realistic', 'cinematic', 'vintage', 'artistic', 'abstract', 'poetic', 'anime', 'cartoon', 'cute', 'scifi']);

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

        promptInput.addEventListener('input', (e) => {
            clearTimeout(tagGenerationTimeout);
            clearTimeout(promptGenerationTimeout); // Dodane czyszczenie timeoutu dla promptów
            const text = e.target.value.trim();
            
            if (text.length > 0) {
                // Pokaż "Generating tags..."
                tagsContainer.innerHTML = '<span class="tag loading">Generating tags...</span>';
                
                // Pokaż "Generating..." w kafelkach
                document.querySelectorAll('.suggestion-area').forEach(area => {
                    area.innerHTML = '<p class="loading">Waiting for input...</p>';
                });
                
                // Generuj tagi z opóźnieniem
                tagGenerationTimeout = setTimeout(async () => {
                    try {
                        console.log('Requesting tags for:', text);
                        const tags = await ipcRenderer.invoke('generate-tags', text);
                        console.log('Received tags:', tags);
                        displayTags(tags);
                    } catch (error) {
                        console.error('Error generating tags:', error);
                        tagsContainer.innerHTML = '<span class="tag error">Error generating tags</span>';
                    }
                }, 800);

                // Generuj prompty z większym opóźnieniem
                promptGenerationTimeout = setTimeout(async () => {
                    if (!isGenerating) {
                        generateAllPrompts(text);
                    }
                }, 1500); // Większe opóźnienie dla generowania promptów
            } else {
                tagsContainer.innerHTML = '';
                // Wyczyść sugestie w kafelkach
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
        
        cards.forEach(card => {
            const suggestionArea = card.querySelector('.suggestion-area');
            suggestionArea.innerHTML = '<p class="loading">Generating...</p>';
        });

        try {
            const promises = Array.from(cards).map(card => {
                const styleId = card.dataset.styleId;
                return ipcRenderer.invoke('generate-prompt', basePrompt, styleId)
                    .then(improvedPrompt => {
                        const suggestionArea = card.querySelector('.suggestion-area');
                        suggestionArea.textContent = improvedPrompt;
                        const applyBtn = card.querySelector('.apply-btn');
                        applyBtn.disabled = false;
                    })
                    .catch(error => {
                        const suggestionArea = card.querySelector('.suggestion-area');
                        suggestionArea.innerHTML = `<p class="error">Error: ${error.message}</p>`;
                    });
            });

            await Promise.all(promises);
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
                    
                    // Wyczyść obecne tagi i pokaż "Generating tags..."
                    tagsContainer.innerHTML = '<span class="tag loading">Generating tags...</span>';
                    
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

    // Inicjalizacja
    updateStyleSelector();
    loadStyles();

    // Nasłuchuj na wygenerowane tagi
    ipcRenderer.on('tags-generated', (event, tags) => {
        console.log('Received tags from main process:', tags);
        displayTags(tags);
    });

    // Nasłuchuj na błędy generowania tagów
    ipcRenderer.on('tags-generated-error', (event, error) => {
        console.error('Tag generation error:', error);
        tagsContainer.innerHTML = `<span class="tag error">${error}</span>`;
    });

    // Nasłuchuj na ustawienie promptu
    ipcRenderer.on('set-prompt', (event, prompt) => {
        if (promptInput && prompt) {
            promptInput.value = prompt;
            promptInput.dispatchEvent(new Event('input'));
        }
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

    // Nasłuchuj na status Ollamy
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
});
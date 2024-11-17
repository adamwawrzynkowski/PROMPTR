const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded');
    const promptInput = document.getElementById('prompt-input');
    const tagsContainer = document.getElementById('tags-container');
    
    console.log('Elements found:', {
        promptInput: !!promptInput,
        tagsContainer: !!tagsContainer
    });

    let tagGenerationTimeout;

    // Nasłuchuj na zmiany w polu promptu
    promptInput.addEventListener('input', (e) => {
        console.log('Input event triggered');
        clearTimeout(tagGenerationTimeout);
        const text = e.target.value.trim();
        
        if (text.length > 0) {
            console.log('Generating tags for:', text);
            // Pokaż "Generating tags..."
            tagsContainer.innerHTML = '<span class="tag loading">Generating tags...</span>';
            
            // Poczekaj chwilę zanim wyślesz żądanie
            tagGenerationTimeout = setTimeout(async () => {
                try {
                    console.log('Invoking generate-tags');
                    const result = await ipcRenderer.invoke('generate-tags', text);
                    console.log('Generate-tags result:', result);
                } catch (error) {
                    console.error('Error generating tags:', error);
                    tagsContainer.innerHTML = '<span class="tag error">Error generating tags</span>';
                }
            }, 500);
        } else {
            console.log('Clearing tags container');
            tagsContainer.innerHTML = '';
        }
    });

    // Nasłuchuj na wygenerowane tagi
    ipcRenderer.on('tags-generated', (event, tags) => {
        console.log('Received tags:', tags);
        if (Array.isArray(tags) && tags.length > 0) {
            tagsContainer.innerHTML = tags
                .map(tag => `<span class="tag">${tag}</span>`)
                .join('');
        } else {
            tagsContainer.innerHTML = '';
        }
    });

    // Nasłuchuj na błędy
    ipcRenderer.on('tags-generated-error', (event, error) => {
        console.error('Received error:', error);
        tagsContainer.innerHTML = `<span class="tag error">${error}</span>`;
    });
});
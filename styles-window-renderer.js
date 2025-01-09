const { ipcRenderer } = require('electron');
const Store = require('electron-store');
const store = new Store();

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize theme
    const theme = store.get('settings.theme', 'purple');
    document.body.className = `theme-${theme}`;

    // Initialize close button
    const closeBtn = document.getElementById('close-btn');
    closeBtn.addEventListener('click', () => {
        window.close();
    });

    // Initialize style list
    const stylesList = document.getElementById('stylesList');
    
    function createStyleItem(style) {
        const item = document.createElement('div');
        item.className = 'style-item';
        item.innerHTML = `
            <div class="style-header">
                <div class="style-title">
                    <i class="fas fa-${style.icon || 'paint-brush'}"></i>
                    <span>${style.name}</span>
                </div>
                ${style.custom === true ? `
                <div class="style-actions">
                    <button class="style-btn edit-btn" title="Edit Style">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="style-btn delete-btn" title="Delete Style">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                ` : ''}
            </div>
            <div class="style-description">${style.description || 'No description available'}</div>
        `;

        // Add event listeners only if style is custom
        if (style.custom === true) {
            const editBtn = item.querySelector('.edit-btn');
            const deleteBtn = item.querySelector('.delete-btn');

            editBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await ipcRenderer.invoke('open-style-edit-window', style.id);
                } catch (error) {
                    console.error('Error opening style edit window:', error);
                }
            });

            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    const result = await ipcRenderer.invoke('delete-style', style.id);
                    if (result) {
                        item.remove();
                        // Aktualizuj licznik stylów jeśli jest taka funkcja
                        if (typeof updateStyleCounts === 'function') {
                            updateStyleCounts();
                        }
                    }
                } catch (error) {
                    console.error('Error deleting style:', error);
                }
            });
        }

        return item;
    }

    async function loadStyles() {
        try {
            console.log('Loading styles...');
            const styles = await ipcRenderer.invoke('get-styles');
            console.log('Received styles:', styles);
            
            const stylesList = document.getElementById('stylesList');
            if (!stylesList) {
                console.error('stylesList element not found');
                return;
            }
            
            stylesList.innerHTML = '';
            if (Array.isArray(styles)) {
                // Filtruj tylko style niestandardowe
                const customStyles = styles.filter(style => style.custom === true);
                console.log('Filtered custom styles:', customStyles);

                if (customStyles.length === 0) {
                    // Dodaj informację gdy nie ma stylów niestandardowych
                    const noStylesInfo = document.createElement('div');
                    noStylesInfo.className = 'no-styles-info';
                    noStylesInfo.textContent = 'No custom styles yet. Click "Add New Style" to create one.';
                    stylesList.appendChild(noStylesInfo);
                } else {
                    // Dodaj znalezione style niestandardowe
                    customStyles.forEach(style => {
                        const item = createStyleItem(style);
                        stylesList.appendChild(item);
                    });
                }
                console.log('Styles loaded successfully');
            } else {
                console.error('Received styles is not an array:', styles);
            }
        } catch (error) {
            console.error('Error loading styles:', error);
        }
    }

    // Initialize buttons
    const addStyleBtn = document.getElementById('add-style-btn');
    const importBtn = document.getElementById('import-btn');
    const exportBtn = document.getElementById('export-btn');
    if (!addStyleBtn) console.error('add-style-btn not found');
    if (!importBtn) console.error('import-btn not found');

    if (addStyleBtn) {
        addStyleBtn.addEventListener('click', () => {
            ipcRenderer.send('create-style');
        });
    }

    if (importBtn) {
        importBtn.addEventListener('click', async () => {
            try {
                const result = await ipcRenderer.invoke('import-style');
                if (result.success) {
                    loadStyles();
                }
            } catch (error) {
                console.error('Error importing style:', error);
            }
        });
    }

    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            const styles = await ipcRenderer.invoke('get-styles');
            if (styles.length > 0) {
                await ipcRenderer.invoke('export-style');
            }
        });
    }

    // Load initial styles
    console.log('Initializing styles window...');
    loadStyles();

    // Listen for style updates
    ipcRenderer.on('style-updated', () => {
        console.log('Style updated, reloading styles...');
        loadStyles();
    });
});
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
                <div class="style-actions">
                    <button class="style-btn edit-btn" title="Edit Style">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="style-btn delete-btn" title="Delete Style">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="style-description">${style.description || 'No description available'}</div>
        `;

        // Add event listeners
        const editBtn = item.querySelector('.edit-btn');
        const deleteBtn = item.querySelector('.delete-btn');

        editBtn.addEventListener('click', () => {
            ipcRenderer.send('edit-style', style.id);
        });

        deleteBtn.addEventListener('click', async () => {
            const confirmed = await ipcRenderer.invoke('show-confirmation', {
                message: 'Are you sure you want to delete this style?',
                detail: 'This action cannot be undone.'
            });

            if (confirmed) {
                await ipcRenderer.invoke('delete-style', style.id);
                loadStyles();
            }
        });

        return item;
    }

    async function loadStyles() {
        try {
            const styles = await ipcRenderer.invoke('get-styles');
            stylesList.innerHTML = '';
            styles.forEach(style => {
                stylesList.appendChild(createStyleItem(style));
            });
        } catch (error) {
            console.error('Error loading styles:', error);
        }
    }

    // Initialize buttons
    const addStyleBtn = document.getElementById('add-style-btn');
    const importBtn = document.getElementById('import-btn');
    const exportBtn = document.getElementById('export-btn');

    addStyleBtn.addEventListener('click', () => {
        ipcRenderer.send('create-style');
    });

    importBtn.addEventListener('click', async () => {
        const result = await ipcRenderer.invoke('import-style');
        if (result.success) {
            loadStyles();
        }
    });

    exportBtn.addEventListener('click', async () => {
        const styles = await ipcRenderer.invoke('get-styles');
        if (styles.length > 0) {
            await ipcRenderer.invoke('export-style');
        }
    });

    // Load initial styles
    loadStyles();

    // Listen for style updates
    ipcRenderer.on('styles-updated', () => {
        loadStyles();
    });
});
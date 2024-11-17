const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', async () => {
    const stylesList = document.querySelector('.styles-list');
    const addStyleBtn = document.getElementById('add-style-btn');
    const closeBtn = document.getElementById('close-btn');
    const importBtn = document.getElementById('import-btn');

    // Funkcja do renderowania pojedynczego stylu
    function renderStyle(id, style) {
        const isBuiltIn = !id.startsWith('custom_');
        return `
            <div class="style-item" data-id="${id}">
                <div class="style-header">
                    <span class="style-name">
                        <i class="fas fa-${style.icon}"></i>
                        ${style.name}
                    </span>
                    ${!isBuiltIn ? `
                        <div class="style-actions">
                            <button class="edit-btn" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="export-btn" title="Export Style">
                                <i class="fas fa-file-export"></i>
                            </button>
                            <button class="delete-btn" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    ` : ''}
                </div>
                <div class="style-description">${style.description}</div>
                <div class="style-tags">
                    ${style.fixedTags.map(tag => `
                        <span class="style-tag">${tag}</span>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Funkcja do ładowania stylów
    async function loadStyles() {
        try {
            const styles = await ipcRenderer.invoke('get-available-styles');
            
            // Podziel style na wbudowane i customowe
            const builtInStyles = Object.entries(styles).filter(([id]) => !id.startsWith('custom_'));
            const customStyles = Object.entries(styles).filter(([id]) => id.startsWith('custom_'));

            // Renderuj style
            stylesList.innerHTML = `
                ${builtInStyles.map(([id, style]) => renderStyle(id, style)).join('')}
                
                <div class="custom-styles-header">
                    <span>Custom Styles</span>
                </div>
                ${customStyles.map(([id, style]) => renderStyle(id, style)).join('')}
            `;

            // Dodaj event listenery
            document.querySelectorAll('.style-item[data-id^="custom_"]').forEach(item => {
                const id = item.dataset.id;
                
                item.querySelector('.edit-btn')?.addEventListener('click', () => {
                    ipcRenderer.send('edit-style', id);
                });

                item.querySelector('.export-btn')?.addEventListener('click', async () => {
                    try {
                        const style = await ipcRenderer.invoke('get-style', id);
                        const result = await ipcRenderer.invoke('export-styles', [style]);
                        if (result.success) {
                            showToast(result.message);
                        } else {
                            showToast(result.message, 'error');
                        }
                    } catch (error) {
                        console.error('Error exporting style:', error);
                        showToast('Error exporting style', 'error');
                    }
                });

                item.querySelector('.delete-btn')?.addEventListener('click', async () => {
                    if (confirm('Are you sure you want to delete this style?')) {
                        await ipcRenderer.invoke('delete-style', id);
                        loadStyles(); // Przeładuj listę
                    }
                });
            });
        } catch (error) {
            console.error('Error loading styles:', error);
        }
    }

    // Nasłuchuj na odświeżenie stylów
    ipcRenderer.on('refresh-styles', () => {
        loadStyles();
    });

    // Obsługa przycisku Add New Style
    addStyleBtn.addEventListener('click', () => {
        ipcRenderer.send('create-new-style');
    });

    // Obsługa przycisku zamykania
    closeBtn.addEventListener('click', () => {
        window.close();
    });

    // Obsługa importu stylów
    importBtn.addEventListener('click', async () => {
        try {
            const result = await ipcRenderer.invoke('import-styles');
            if (result.success) {
                loadStyles(); // Odśwież listę
                showToast(result.message);
            } else {
                showToast(result.message, 'error');
            }
        } catch (error) {
            console.error('Error importing styles:', error);
            showToast('Error importing styles', 'error');
        }
    });

    // Funkcja do wyświetlania powiadomień
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }, 100);
    }

    // Załaduj style przy starcie
    loadStyles();
}); 
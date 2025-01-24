const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    console.log('Style selector loaded');
    
    // Close button handler
    document.getElementById('close-button')?.addEventListener('click', () => {
        console.log('Closing style selector');
        ipcRenderer.send('close-style-selector');
    });

    // Request styles when the window loads
    ipcRenderer.send('get-styles');
});

// Function to create a style tile
function createStyleTile(style) {
    console.log('Creating tile for style:', style);
    const tile = document.createElement('div');
    tile.className = 'style-tile';
    tile.innerHTML = `
        <div class="style-icon"><i class="fas fa-${style.icon || 'paint-brush'}"></i></div>
        <div class="style-name">${style.name}</div>
        <div class="style-description">${style.description || ''}</div>
    `;
    
    // Add context menu functionality
    tile.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        
        // Remove any existing context menus
        document.querySelectorAll('.context-menu').forEach(menu => menu.remove());
        
        // Create context menu
        const contextMenu = document.createElement('div');
        contextMenu.className = 'context-menu';
        contextMenu.innerHTML = `
            <div class="context-menu-item improve-option">
                <i class="fas fa-magic"></i>
                Improve
            </div>
        `;
        
        // Position the menu at cursor
        contextMenu.style.left = `${e.pageX}px`;
        contextMenu.style.top = `${e.pageY}px`;
        
        document.body.appendChild(contextMenu);
        setTimeout(() => contextMenu.classList.add('show'), 0);
        
        // Handle clicking outside menu
        const closeMenu = (event) => {
            if (!contextMenu.contains(event.target)) {
                contextMenu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        
        // Handle improve option click
        contextMenu.querySelector('.improve-option').addEventListener('click', () => {
            // TODO: Implement improve functionality
            console.log('Improve clicked for style:', style);
            contextMenu.remove();
        });
        
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 0);
    });
    
    tile.addEventListener('click', () => {
        console.log('Style selected:', style);
        // Send the selected style back to the vision window
        ipcRenderer.send('style-selected', style);
        // Close the selector window
        ipcRenderer.send('close-style-selector');
    });
    
    return tile;
}

// Load styles when received from main process
ipcRenderer.on('load-styles', (event, styles) => {
    console.log('Received styles:', styles);
    const grid = document.getElementById('styles-grid');
    if (!grid) {
        console.error('Styles grid not found');
        return;
    }
    
    grid.innerHTML = ''; // Clear existing content
    
    // Add some default styles if none exist
    if (!styles || styles.length === 0) {
        styles = [
            {
                name: 'Sci-Fi',
                description: 'Analyze the image through a science fiction lens, focusing on futuristic and technological elements.',
                icon: 'robot'
            },
            {
                name: 'Art Critic',
                description: 'Evaluate the image as an art critic would, discussing composition, technique, and artistic merit.',
                icon: 'palette'
            },
            {
                name: 'Detective',
                description: 'Examine the image like a detective, looking for clues and analyzing details.',
                icon: 'magnifying-glass'
            },
            {
                name: 'Storyteller',
                description: 'Interpret the image as a scene from a story, focusing on narrative elements and potential plot.',
                icon: 'book'
            }
        ];
    }
    
    styles.forEach(style => {
        grid.appendChild(createStyleTile(style));
    });
});

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
        <div class="style-icon"><i class="fas ${style.icon || 'fa-paint-brush'}"></i></div>
        <div class="style-name">${style.name}</div>
        <div class="style-description">${style.description || ''}</div>
    `;
    
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
                icon: 'fa-robot'
            },
            {
                name: 'Art Critic',
                description: 'Evaluate the image as an art critic would, discussing composition, technique, and artistic merit.',
                icon: 'fa-palette'
            },
            {
                name: 'Detective',
                description: 'Examine the image like a detective, looking for clues and analyzing details.',
                icon: 'fa-magnifying-glass'
            },
            {
                name: 'Storyteller',
                description: 'Interpret the image as a scene from a story, focusing on narrative elements and potential plot.',
                icon: 'fa-book'
            }
        ];
    }
    
    styles.forEach(style => {
        grid.appendChild(createStyleTile(style));
    });
});

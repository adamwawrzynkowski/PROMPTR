const { BrowserWindow } = require('electron');
const path = require('path');

let window = null;

function create() {
    if (window) {
        window.focus();
        return window;
    }

    window = new BrowserWindow({
        width: 500,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: false,
        resizable: false,
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: -20, y: -100 },
        transparent: true,
        vibrancy: 'under-window',
        visualEffectState: 'active'
    });

    window.loadFile(path.join(__dirname, 'styles-window.html'));

    window.on('closed', () => {
        window = null;
    });

    window.webContents.on('dom-ready', () => {
        window.webContents.executeJavaScript(`
            document.addEventListener('DOMContentLoaded', () => {
                document.querySelectorAll('.style-item').forEach(card => {
                    card.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        
                        const contextMenu = document.createElement('div');
                        contextMenu.className = 'context-menu';
                        contextMenu.innerHTML = \`
                            <div class="context-menu-item improve-option">
                                <i class="fas fa-magic"></i>
                                Improve
                            </div>
                        \`;
                        
                        contextMenu.style.left = \`\${e.pageX}px\`;
                        contextMenu.style.top = \`\${e.pageY}px\`;
                        
                        document.querySelectorAll('.context-menu').forEach(menu => menu.remove());
                        
                        document.body.appendChild(contextMenu);
                        setTimeout(() => contextMenu.classList.add('show'), 0);
                        
                        const closeMenu = (event) => {
                            if (!contextMenu.contains(event.target)) {
                                contextMenu.remove();
                                document.removeEventListener('click', closeMenu);
                            }
                        };
                        
                        contextMenu.querySelector('.improve-option').addEventListener('click', () => {
                            contextMenu.remove();
                        });
                        
                        setTimeout(() => {
                            document.addEventListener('click', closeMenu);
                        }, 0);
                    });
                });
            });
        `);
    });

    return window;
}

module.exports = {
    create,
    get window() {
        return window;
    }
};
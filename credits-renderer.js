const { shell } = require('electron');

document.getElementById('close-btn').addEventListener('click', () => {
    window.close();
});

document.getElementById('coffee-link').addEventListener('click', (e) => {
    e.preventDefault();
    shell.openExternal('https://buymeacoffee.com/a_wawrzynkowski');
}); 
const themes = require('./themes');

class ThemeManager {
    constructor() {
        this.currentTheme = 'dark';
    }

    applyTheme(themeName, window) {
        try {
            const theme = themes[themeName];
            if (!theme) {
                console.error(`Theme "${themeName}" not found`);
                return;
            }

            const css = `
                :root {
                    --background: ${theme.background};
                    --card-background: ${theme.cardBackground};
                    --text: ${theme.text};
                    --text-secondary: ${theme.textSecondary};
                    --border: ${theme.border};
                    --button-background: ${theme.buttonBackground};
                    --button-hover: ${theme.buttonHover};
                    --input-background: ${theme.inputBackground};
                    --success: ${theme.success};
                    --error: ${theme.error};
                    --gradient-opacity: ${theme.gradientOpacity};
                    --card-border: ${theme.cardBorder};
                    --tooltip-background: ${theme.tooltipBackground};
                    --tooltip-text: ${theme.tooltipText};
                    --scrollbar-track: ${theme.scrollbarTrack};
                    --scrollbar-thumb: ${theme.scrollbarThumb};
                    --scrollbar-thumb-hover: ${theme.scrollbarThumbHover};
                    --loader-border: ${theme.loaderBorder};
                    --loader-spinner: ${theme.loaderSpinner};
                }
            `;

            if (!window || !window.webContents) {
                console.error('Invalid window object provided to applyTheme');
                return;
            }

            const script = `
                try {
                    (function() {
                        const style = document.createElement('style');
                        style.id = 'theme-style';
                        style.textContent = \`${css}\`;
                        const existingStyle = document.head.querySelector('#theme-style');
                        if (existingStyle) {
                            existingStyle.remove();
                        }
                        document.head.appendChild(style);
                        document.documentElement.setAttribute('data-theme', '${themeName}');
                        document.documentElement.style.setProperty('color-scheme', '${themeName}');
                    })();
                    true;
                } catch (error) {
                    console.error('Error applying theme:', error);
                    throw error;
                }
            `;

            return window.webContents.executeJavaScript(script)
                .then(() => {
                    this.currentTheme = themeName;
                    console.log(`Theme "${themeName}" applied successfully`);
                })
                .catch(error => {
                    console.error('Error executing theme script:', error);
                    throw error;
                });
        } catch (error) {
            console.error('Error in applyTheme:', error);
            return Promise.reject(error);
        }
    }

    getCurrentTheme() {
        return this.currentTheme;
    }
}

module.exports = new ThemeManager(); 
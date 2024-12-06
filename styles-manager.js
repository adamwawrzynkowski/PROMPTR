const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

// Domyślne style z ikonami (teraz używamy ścieżek do własnych ikon)
const DEFAULT_STYLES = {
    'realistic': {
        name: 'Realistic',
        description: 'Photorealistic style with high attention to detail',
        icon: 'realistic.png',
        active: true
    },
    'artistic': {
        name: 'Artistic',
        description: 'Creative and expressive artistic interpretation',
        icon: 'artistic.png',
        active: true
    },
    'anime': {
        name: 'Anime',
        description: 'Japanese animation style',
        icon: 'anime.png',
        active: true
    },
    'fantasy': {
        name: 'Fantasy',
        description: 'Magical and fantastical elements',
        icon: 'fantasy.png',
        active: true
    },
    'scifi': {
        name: 'Sci-Fi',
        description: 'Futuristic and technological themes',
        icon: 'scifi.png',
        active: true
    },
    'horror': {
        name: 'Horror',
        description: 'Dark and frightening themes',
        icon: 'horror.png',
        active: true
    },
    'abstract': {
        name: 'Abstract',
        description: 'Non-representational and conceptual art',
        icon: 'abstract.png',
        active: true
    },
    'portrait': {
        name: 'Portrait',
        description: 'Focus on character portraits',
        icon: 'portrait.png',
        active: true
    },
    'landscape': {
        name: 'Landscape',
        description: 'Natural and urban landscapes',
        icon: 'landscape.png',
        active: true
    },
    'architecture': {
        name: 'Architecture',
        description: 'Buildings and architectural designs',
        icon: 'architecture.png',
        active: true
    }
};

class StylesManager {
    constructor() {
        this.styles = null;
        this._stylesPath = null;
        this._iconsPath = null;
    }

    get stylesPath() {
        if (!this._stylesPath) {
            this._stylesPath = path.join(app.getPath('userData'), 'styles.json');
        }
        return this._stylesPath;
    }

    get iconsPath() {
        if (!this._iconsPath) {
            this._iconsPath = path.join(__dirname, '..', 'assets', 'stylesicons');
        }
        return this._iconsPath;
    }

    getIconPath(iconName) {
        return path.join(this.iconsPath, iconName);
    }

    async loadStyles() {
        try {
            const data = await fs.readFile(this.stylesPath, 'utf8');
            this.styles = JSON.parse(data);
        } catch (error) {
            console.log('No existing styles found, using defaults');
            this.styles = DEFAULT_STYLES;
            await this.saveStyles(this.styles);
        }
        return this.styles;
    }

    async getStyles() {
        if (!this.styles) {
            await this.loadStyles();
        }
        return this.styles;
    }

    async saveStyles(styles) {
        try {
            await fs.writeFile(this.stylesPath, JSON.stringify(styles, null, 2));
            this.styles = styles;
        } catch (error) {
            console.error('Error saving styles:', error);
            throw error;
        }
    }

    getStyle(id) {
        return this.styles ? this.styles[id] : null;
    }

    isCustomStyle(id) {
        return id.startsWith('custom_');
    }

    async addCustomStyle(id, style) {
        if (!this.styles) {
            await this.loadStyles();
        }
        this.styles[id] = {
            ...style,
            isCustom: true,
            icon: style.icon || 'custom.png' // domyślna ikona dla stylów użytkownika
        };
        await this.saveStyles(this.styles);
    }

    async removeCustomStyle(id) {
        if (!this.styles) {
            await this.loadStyles();
        }
        if (this.styles[id]) {
            delete this.styles[id];
            await this.saveStyles(this.styles);
        }
    }
}

module.exports = new StylesManager();
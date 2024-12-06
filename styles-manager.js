const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

// Domyślne style z ikonami (teraz używamy ścieżek do własnych ikon)
const DEFAULT_STYLES = {
    'realistic': {
        name: 'Realistic',
        description: 'Ultra-realistic photography with meticulous attention to detail. Creates photorealistic scenes with sharp focus, natural lighting, and precise details that make images indistinguishable from professional photographs.',
        icon: 'camera',
        fixedTags: ['8K resolution', 'photographic quality', 'natural lighting', 'realistic details'],
        active: true
    },
    'cinematic': {
        name: 'Cinematic',
        description: 'Epic movie scene aesthetics with dramatic cinematography. Features professional movie-like composition, atmospheric effects, and emotional impact, as if captured from a blockbuster film.',
        icon: 'film',
        fixedTags: ['cinematic lighting', 'movie grade', 'dramatic atmosphere', 'depth of field'],
        active: true
    },
    'vintage': {
        name: 'Vintage',
        description: 'Nostalgic retro photography with authentic period characteristics. Captures the essence of classic photography with film grain, color shifts, and era-appropriate processing artifacts.',
        icon: 'clock-rotate-left',
        fixedTags: ['film grain', 'retro colors', 'light leaks', 'nostalgic mood'],
        active: true
    },
    'artistic': {
        name: 'Artistic',
        description: 'Expressive fine art with bold artistic interpretation. Transforms scenes with visible brushstrokes, artistic color choices, and emotional expression, inspired by master painters.',
        icon: 'palette',
        fixedTags: ['brushstrokes', 'artistic style', 'creative colors', 'expressive'],
        active: true
    },
    'abstract': {
        name: 'Abstract',
        description: 'Non-representational art focusing on form and emotion. Breaks down subjects into abstract forms, emphasizing shapes, colors, and emotional impact rather than literal representation.',
        icon: 'shapes',
        fixedTags: ['geometric forms', 'abstract shapes', 'bold colors', 'non-literal'],
        active: true
    },
    'poetic': {
        name: 'Poetic',
        description: 'Dreamy, ethereal atmosphere with soft, romantic qualities. Creates dreamlike scenes with soft focus, glowing lights, and romantic atmosphere, perfect for ethereal and emotional imagery.',
        icon: 'feather',
        fixedTags: ['soft focus', 'dreamy glow', 'ethereal mood', 'romantic'],
        active: true
    },
    'anime': {
        name: 'Anime',
        description: 'Stylized Japanese anime art with characteristic features. Renders in authentic anime style with distinctive elements like large eyes, dynamic poses, and cel shading techniques.',
        icon: 'star',
        fixedTags: ['anime style', 'cel shading', 'dynamic poses', 'characteristic anime'],
        active: true
    },
    'cartoon': {
        name: 'Cartoon',
        description: 'Bold, stylized cartoon with exaggerated features. Creates vibrant cartoon imagery with bold outlines, exaggerated proportions, and simplified forms, perfect for animation-style art.',
        icon: 'pen-nib',
        fixedTags: ['bold outlines', 'cartoon style', 'exaggerated', 'vibrant colors'],
        active: true
    },
    'cute': {
        name: 'Cute',
        description: 'Adorable kawaii style with charming, playful elements. Makes everything extremely cute with rounded forms, big eyes, and kawaii aesthetics, including sparkles and pastel colors.',
        icon: 'heart',
        fixedTags: ['kawaii style', 'adorable', 'pastel colors', 'rounded shapes'],
        active: true
    },
    'scifi': {
        name: 'Sci-Fi',
        description: 'Futuristic science fiction with advanced technology. Creates high-tech scenes with futuristic lighting, innovative designs, and sci-fi elements like holographics and energy effects.',
        icon: 'rocket',
        fixedTags: ['futuristic', 'high-tech', 'sci-fi effects', 'advanced tech'],
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
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

class StylesManager {
    constructor() {
        this.configPath = path.join(__dirname, 'config', 'styles.json');
        this.customStyles = {};
        this.defaultStyles = {
            'realistic': {
                name: 'Realistic',
                icon: 'camera',
                description: 'Professional photography style with realistic details and natural lighting',
                fixedTags: ['photorealistic', 'detailed', 'professional photography', 'natural lighting']
            },
            'cinematic': {
                name: 'Cinematic',
                icon: 'film',
                description: 'Movie-like scenes with dramatic lighting and cinematic composition',
                fixedTags: ['cinematic', 'movie scene', 'dramatic lighting', 'film grain']
            },
            'vintage': {
                name: 'Vintage',
                icon: 'clock-rotate-left',
                description: 'Retro and nostalgic aesthetics with classic photography elements',
                fixedTags: ['vintage', 'retro', 'old photograph', 'nostalgic', 'film photography']
            },
            'artistic': {
                name: 'Artistic',
                icon: 'palette',
                description: 'Fine art style with emphasis on artistic techniques and expression',
                fixedTags: ['fine art', 'artistic', 'masterpiece', 'expressive']
            },
            'abstract': {
                name: 'Abstract',
                icon: 'brush',
                description: 'Non-representational art focusing on shapes, colors, and forms',
                fixedTags: ['abstract art', 'geometric', 'modern art', 'non-representational']
            },
            'poetic': {
                name: 'Poetic',
                icon: 'feather',
                description: 'Dreamy and ethereal imagery with soft, romantic elements',
                fixedTags: ['ethereal', 'dreamy', 'romantic', 'soft lighting', 'atmospheric']
            },
            'anime': {
                name: 'Anime',
                icon: 'star',
                description: 'Japanese animation style with distinctive anime characteristics',
                fixedTags: ['anime style', 'manga art', 'cel shaded', 'japanese animation']
            },
            'cartoon': {
                name: 'Cartoon',
                icon: 'pen',
                description: 'Stylized cartoon art with bold lines and vibrant colors',
                fixedTags: ['cartoon style', 'stylized', 'bold colors', 'illustration']
            },
            'cute': {
                name: 'Cute',
                icon: 'heart',
                description: 'Adorable and kawaii style with charming elements',
                fixedTags: ['kawaii', 'cute', 'adorable', 'chibi', 'pastel colors']
            },
            'scifi': {
                name: 'Sci-Fi',
                icon: 'robot',
                description: 'Futuristic science fiction aesthetics with advanced technology',
                fixedTags: ['science fiction', 'futuristic', 'cyberpunk', 'technological']
            }
        };
        this.loadStyles();
    }

    loadStyles() {
        try {
            const configDir = path.dirname(this.configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            
            if (fs.existsSync(this.configPath)) {
                this.customStyles = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
            } else {
                this.customStyles = {};
                this.saveStyles();
            }
        } catch (error) {
            console.error('Error loading custom styles:', error);
            this.customStyles = {};
        }
    }

    saveStyles() {
        try {
            const configDir = path.dirname(this.configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            fs.writeFileSync(this.configPath, JSON.stringify(this.customStyles, null, 2));
        } catch (error) {
            console.error('Error saving custom styles:', error);
        }
    }

    getAllStyles() {
        return { ...this.defaultStyles, ...this.customStyles };
    }

    getStyle(id) {
        return this.customStyles[id] || this.defaultStyles[id];
    }

    addCustomStyle(id, style) {
        this.customStyles[id] = style;
        this.saveStyles();
    }

    removeCustomStyle(id) {
        delete this.customStyles[id];
        this.saveStyles();
    }

    isCustomStyle(id) {
        return id in this.customStyles;
    }
}

module.exports = new StylesManager(); 
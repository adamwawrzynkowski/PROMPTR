const { app } = require('electron');
const path = require('path');
const fs = require('fs');

class StylesManager {
    constructor() {
        this.stylesPath = path.join(app.getPath('userData'), 'custom-styles.json');
        this.defaultStyles = {
            realistic: {
                name: 'Realistic',
                icon: 'camera',
                description: 'Enhances prompt with photorealistic details and camera settings',
                fixedTags: ['photorealistic', '8k', 'detailed', 'photography']
            },
            cinematic: {
                name: 'Cinematic',
                icon: 'film',
                description: 'Transforms prompt into a movie-like scene with dramatic elements',
                fixedTags: ['cinematic', 'dramatic lighting', 'movie scene']
            },
            fantasy: {
                name: 'Fantasy',
                icon: 'dragon',
                description: 'Adds magical and fantastical elements to your prompt',
                fixedTags: ['fantasy', 'magical', 'mystical']
            },
            artistic: {
                name: 'Artistic',
                icon: 'palette',
                description: 'Enhances prompt with fine art techniques and styles',
                fixedTags: ['artistic', 'fine art', 'masterpiece']
            },
            conceptart: {
                name: 'Concept Art',
                icon: 'pencil-ruler',
                description: 'Adds professional concept art and design elements',
                fixedTags: ['concept art', 'professional', 'detailed']
            },
            anime: {
                name: 'Anime',
                icon: 'star',
                description: 'Transforms prompt into anime/manga art style',
                fixedTags: ['anime', 'manga style', 'japanese art']
            }
        };
        this.customStyles = this.loadCustomStyles();
    }

    loadCustomStyles() {
        try {
            if (fs.existsSync(this.stylesPath)) {
                return JSON.parse(fs.readFileSync(this.stylesPath, 'utf8'));
            }
        } catch (error) {
            console.error('Error loading custom styles:', error);
        }
        return {};
    }

    saveCustomStyles() {
        try {
            fs.writeFileSync(this.stylesPath, JSON.stringify(this.customStyles, null, 2));
        } catch (error) {
            console.error('Error saving custom styles:', error);
        }
    }

    getAllStyles() {
        return { ...this.defaultStyles, ...this.customStyles };
    }

    addCustomStyle(id, style) {
        this.customStyles[id] = style;
        this.saveCustomStyles();
    }

    removeCustomStyle(id) {
        delete this.customStyles[id];
        this.saveCustomStyles();
    }

    getStyle(id) {
        return this.customStyles[id] || this.defaultStyles[id];
    }

    isCustomStyle(id) {
        return id in this.customStyles;
    }
}

module.exports = new StylesManager(); 
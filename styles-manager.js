const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

const DEFAULT_STYLES = [
    {
        id: 'realistic',
        name: 'Realistic',
        description: 'Ultra-realistic photography with meticulous attention to detail',
        icon: 'camera',
        prefix: 'Generate a Stable Diffusion prompt for a photorealistic image of: ',
        suffix: '. Include: ultra detailed, 8k uhd, high resolution, photorealistic, masterpiece, highly detailed skin texture, detailed eyes, detailed facial features, detailed clothing fabric, cinematic lighting, depth of field, sharp focus.',
        fixedTags: ['realistic', 'natural', 'detailed', 'photorealistic'],
        custom: false,
        active: true,
        positiveWords: ['detailed', 'realistic', 'natural', 'sharp', 'clear', 'high-quality'],
        negativeWords: ['blurry', 'artificial', 'distorted', 'low-quality'],
        modelParameters: {
            temperature: 0.7,
            top_k: 50,
            top_p: 0.9,
            repeat_penalty: 1.1
        }
    },
    {
        id: 'cinematic',
        name: 'Cinematic',
        description: 'Epic movie scene aesthetics with dramatic cinematography',
        icon: 'film',
        prefix: 'Generate a Stable Diffusion prompt for a cinematic scene of: ',
        suffix: '. Include: cinematic lighting, dramatic atmosphere, movie quality, depth of field, bokeh, anamorphic, professional photography, epic composition, golden hour, volumetric lighting.',
        fixedTags: ['cinematic', 'dramatic', 'movie'],
        custom: false,
        active: true,
        modelParameters: {
            temperature: 0.8,
            top_k: 60,
            top_p: 0.95,
            repeat_penalty: 1.2
        }
    },
    {
        id: 'vintage',
        name: 'Vintage',
        description: 'Nostalgic retro photography with authentic period characteristics',
        icon: 'clock-rotate-left',
        prefix: 'Generate a Stable Diffusion prompt for a vintage-style image of: ',
        suffix: '. Include: vintage photography, old film, grainy texture, sepia tones, faded colors, retro aesthetic, analog film, 35mm film, nostalgic atmosphere, period-accurate details.',
        fixedTags: ['vintage', 'retro', 'classic'],
        custom: false,
        active: true,
        modelParameters: {
            temperature: 0.7,
            top_k: 50,
            top_p: 0.9,
            repeat_penalty: 1.1
        }
    },
    {
        id: 'artistic',
        name: 'Artistic',
        description: 'Expressive fine art with bold artistic interpretation',
        icon: 'palette',
        prefix: 'Generate a Stable Diffusion prompt for an artistic interpretation of: ',
        suffix: '. Include: expressive brushstrokes, vibrant colors, abstract shapes, emotive atmosphere, creative composition, artistic freedom, bold textures, intricate details.',
        fixedTags: ['artistic', 'expressive', 'creative'],
        custom: false,
        active: true,
        modelParameters: {
            temperature: 0.9,
            top_k: 70,
            top_p: 0.95,
            repeat_penalty: 1.1
        }
    },
    {
        id: 'abstract',
        name: 'Abstract',
        description: 'Non-representational art focusing on form and emotion',
        icon: 'shapes',
        prefix: 'Generate a Stable Diffusion prompt for an abstract representation of: ',
        suffix: '. Include: abstract shapes, vibrant colors, emotive atmosphere, creative composition, artistic freedom, bold textures, intricate details.',
        fixedTags: ['abstract', 'conceptual', 'artistic'],
        custom: false,
        active: false,
        modelParameters: {
            temperature: 0.9,
            top_k: 80,
            top_p: 0.98,
            repeat_penalty: 1.0
        }
    },
    {
        id: 'poetic',
        name: 'Poetic',
        description: 'Dreamy, ethereal atmosphere with soft, romantic qualities',
        icon: 'feather',
        prefix: 'Generate a Stable Diffusion prompt for a poetic visualization of: ',
        suffix: '. Include: dreamy atmosphere, soft focus, romantic lighting, ethereal textures, delicate colors, whimsical details, poetic composition.',
        fixedTags: ['poetic', 'dreamy', 'romantic'],
        custom: false,
        active: false,
        modelParameters: {
            temperature: 0.85,
            top_k: 65,
            top_p: 0.93,
            repeat_penalty: 1.15
        }
    },
    {
        id: 'anime',
        name: 'Anime',
        description: 'Stylized Japanese anime art with characteristic features',
        icon: 'star',
        prefix: 'Generate a Stable Diffusion prompt for an anime-style portrayal of: ',
        suffix: '. Include: anime aesthetic, vibrant colors, dynamic poses, exaggerated expressions, detailed backgrounds, stylized textures, Japanese-inspired details.',
        fixedTags: ['anime', 'manga', 'japanese'],
        custom: false,
        active: false,
        modelParameters: {
            temperature: 0.85,
            top_k: 65,
            top_p: 0.93,
            repeat_penalty: 1.15
        }
    },
    {
        id: 'cartoon',
        name: 'Cartoon',
        description: 'Bold, stylized cartoon with exaggerated features',
        icon: 'pen-nib',
        prefix: 'Generate a Stable Diffusion prompt for a cartoon depiction of: ',
        suffix: '. Include: cartoon aesthetic, bold lines, vibrant colors, exaggerated features, comedic expressions, playful textures, whimsical details.',
        fixedTags: ['cartoon', 'playful', 'fun'],
        custom: false,
        active: true,
        modelParameters: {
            temperature: 0.8,
            top_k: 55,
            top_p: 0.92,
            repeat_penalty: 1.1
        }
    },
    {
        id: 'cute',
        name: 'Cute',
        description: 'Adorable kawaii style with charming, playful elements',
        icon: 'heart',
        prefix: 'Generate a Stable Diffusion prompt for a cute version of: ',
        suffix: '. Include: kawaii aesthetic, pastel colors, soft textures, adorable expressions, playful details, charming atmosphere, sweet composition.',
        fixedTags: ['cute', 'kawaii', 'adorable'],
        custom: false,
        active: false,
        modelParameters: {
            temperature: 0.8,
            top_k: 55,
            top_p: 0.92,
            repeat_penalty: 1.1
        }
    },
    {
        id: 'scifi',
        name: 'Sci-Fi',
        description: 'Futuristic science fiction with advanced technology',
        icon: 'rocket',
        prefix: 'Generate a Stable Diffusion prompt for a sci-fi vision of: ',
        suffix: '. Include: futuristic aesthetic, advanced technology, space-inspired details, neon lights, metallic textures, high-tech atmosphere, otherworldly composition.',
        fixedTags: ['sci-fi', 'futuristic', 'tech'],
        custom: false,
        active: true,
        modelParameters: {
            temperature: 0.8,
            top_k: 60,
            top_p: 0.95,
            repeat_penalty: 1.2
        }
    }
];

class StylesManager {
    constructor() {
        this.stylesPath = path.join(app.getPath('userData'), 'styles.json');
        this.styles = [];
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        try {
            await this.loadStyles();
            this.initialized = true;
        } catch (error) {
            console.error('Error initializing styles:', error);
            this.styles = [...DEFAULT_STYLES];
            await this.saveStyles();
            this.initialized = true;
        }
    }

    async loadStyles() {
        try {
            const data = await fs.readFile(this.stylesPath, 'utf8');
            this.styles = JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.styles = [...DEFAULT_STYLES];
                await this.saveStyles();
            } else {
                throw error;
            }
        }
    }

    async saveStyles() {
        try {
            await fs.writeFile(this.stylesPath, JSON.stringify(this.styles, null, 2));
        } catch (error) {
            console.error('Error saving styles:', error);
            throw error;
        }
    }

    async getAllStyles() {
        await this.initialize();
        return this.styles;
    }

    async getStyle(styleId) {
        await this.initialize();
        return this.styles.find(style => style.id === styleId);
    }

    async createStyle(style) {
        await this.initialize();
        
        // Generate unique ID for new style
        style.id = `custom_${Date.now()}`;
        style.custom = true;
        
        this.styles.push(style);
        await this.saveStyles();
        return style;
    }

    async updateStyle(updatedStyle) {
        await this.initialize();
        
        const index = this.styles.findIndex(style => style.id === updatedStyle.id);
        if (index === -1) {
            throw new Error(`Style with id ${updatedStyle.id} not found`);
        }
        
        this.styles[index] = {
            ...this.styles[index],
            ...updatedStyle,
            custom: this.styles[index].custom // Preserve custom flag
        };
        
        await this.saveStyles();
        return this.styles[index];
    }

    async deleteStyle(styleId) {
        await this.initialize();
        
        const index = this.styles.findIndex(style => style.id === styleId);
        if (index === -1) {
            throw new Error(`Style with id ${styleId} not found`);
        }
        
        // Only allow deleting custom styles
        if (!this.styles[index].custom) {
            throw new Error('Cannot delete built-in style');
        }
        
        this.styles.splice(index, 1);
        await this.saveStyles();
    }

    async activateStyle(styleId) {
        await this.initialize();
        
        const style = this.styles.find(s => s.id === styleId);
        if (!style) {
            throw new Error(`Style with id ${styleId} not found`);
        }
        
        style.active = true;
        await this.saveStyles();
        return style;
    }

    async exportStyle(styleId) {
        const style = this.styles.find(s => s.id === styleId);
        if (!style) {
            throw new Error('Style not found');
        }
        return style;
    }

    async importStyle(styleData) {
        try {
            // Validate style data
            if (!styleData.name || !styleData.description) {
                throw new Error('Invalid style data: missing required fields');
            }

            // Generate unique ID
            const id = `custom_${Date.now()}`;
            const newStyle = {
                ...styleData,
                id,
                custom: true,
                active: true
            };

            this.styles.push(newStyle);
            await this.saveStyles();
            return newStyle;
        } catch (error) {
            console.error('Error importing style:', error);
            throw error;
        }
    }
}

module.exports = new StylesManager();

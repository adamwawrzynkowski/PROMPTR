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
        active: false,
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
        active: false,
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
        active: false,
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
        active: false,
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
        active: false,
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
        active: false,
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

    async loadStyles() {
        try {
            console.log('Loading styles from:', this.stylesPath);
            if (await fs.access(this.stylesPath).then(() => true).catch(() => false)) {
                const data = await fs.readFile(this.stylesPath, 'utf8');
                const loadedStyles = JSON.parse(data);
                console.log('Loaded styles from file:', loadedStyles);
                
                // Compare with default styles and update if needed
                this.styles = DEFAULT_STYLES.map(defaultStyle => {
                    const savedStyle = loadedStyles.find(s => s.id === defaultStyle.id);
                    if (savedStyle && !savedStyle.custom) {
                        // For non-custom styles, ensure we use the default prefix and suffix
                        return {
                            ...savedStyle,
                            prefix: defaultStyle.prefix,
                            suffix: defaultStyle.suffix
                        };
                    }
                    return savedStyle || defaultStyle;
                });
                
                // Add any custom styles that aren't in defaults
                const customStyles = loadedStyles.filter(s => 
                    s.custom && !this.styles.some(ds => ds.id === s.id)
                );
                this.styles = [...this.styles, ...customStyles];
                
                console.log('Final merged styles:', this.styles);
                await this.saveStyles(); // Save back the merged styles
            } else {
                console.log('No styles file found, using defaults');
                this.styles = DEFAULT_STYLES;
                await this.saveStyles();
            }
        } catch (error) {
            console.error('Error loading styles:', error);
            this.styles = DEFAULT_STYLES;
            await this.saveStyles();
        }
    }

    async saveStyles() {
        try {
            const stylesDir = path.dirname(this.stylesPath);
            await fs.mkdir(stylesDir, { recursive: true });
            await fs.writeFile(this.stylesPath, JSON.stringify(this.styles, null, 2));
            console.log('Saved styles:', this.styles);
        } catch (error) {
            console.error('Error saving styles:', error);
        }
    }

    async initialize() {
        console.log('Initialize called, initialized status:', this.initialized);
        if (this.initialized) {
            console.log('Already initialized, returning');
            return;
        }
        
        try {
            await this.loadStyles();
            this.initialized = true;
            console.log('Styles manager initialized with styles:', this.styles);
        } catch (error) {
            console.error('Error initializing styles manager:', error);
            this.styles = DEFAULT_STYLES;
            this.initialized = true;
        }
    }

    async getAllStyles() {
        if (!this.initialized) {
            console.log('Getting styles before initialization, initializing now');
            await this.initialize();
        }
        return this.styles;
    }

    async getStyle(styleId) {
        if (!this.initialized) {
            console.log('Getting style before initialization, initializing now');
            await this.initialize();
        }
        const style = this.styles.find(s => s.id === styleId);
        console.log('Getting style:', styleId, 'Found:', style);
        return style;
    }

    async updateStyle(updatedStyle) {
        const index = this.styles.findIndex(style => style.id === updatedStyle.id);
        if (index !== -1) {
            this.styles[index] = { ...this.styles[index], ...updatedStyle };
            await this.saveStyles();
            return this.styles[index];
        }
        return null;
    }

    async createStyle(style) {
        await this.initialize();
        console.log('Creating new style:', style);
        
        const newStyle = {
            id: style.id || `custom_${Date.now()}`,
            name: style.name || 'New Style',
            description: style.description || '',
            icon: style.icon || 'paint-brush',
            prefix: style.prefix || '',
            suffix: style.suffix || '',
            fixedTags: style.fixedTags || [],
            custom: true,
            active: false,
            modelParameters: {
                temperature: 0.7,
                top_k: 50,
                top_p: 0.9,
                repeat_penalty: 1.1,
                ...(style.modelParameters || {})
            }
        };
        
        this.styles.push(newStyle);
        await this.saveStyles();
        return newStyle;
    }

    async deleteStyle(styleId) {
        await this.initialize();
        console.log('Deleting style:', styleId);
        
        const index = this.styles.findIndex(style => style.id === styleId);
        if (index !== -1) {
            this.styles.splice(index, 1);
            await this.saveStyles();
            return true;
        }
        return false;
    }

    async activateStyle(styleId) {
        await this.initialize();
        const style = await this.getStyle(styleId);
        if (style) {
            style.active = true;
            await this.updateStyle(style);
            return true;
        }
        return false;
    }
}

module.exports = new StylesManager();

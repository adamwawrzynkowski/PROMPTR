const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

const DEFAULT_STYLES = [
    {
        id: 'realistic',
        name: 'Realistic',
        description: 'Ultra-realistic photography with meticulous attention to detail',
        icon: 'camera',
        prefix: 'Create a detailed and realistic description of: ',
        suffix: '. Focus on lifelike textures, accurate lighting, and intricate details to bring the scene or subject to life. Ensure the description includes environmental elements, physical textures, and small features that enhance the realism.',
        fixedTags: ['realistic', 'natural', 'detailed'],
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
        prefix: 'Compose an immersive cinematic scene of: ',
        suffix: '. Emphasize dynamic composition, dramatic lighting, and a movie-like atmosphere. Incorporate vivid environmental details, movement, and perspective to give a sense of storytelling as if captured in a film still.',
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
        prefix: 'Design a richly detailed vintage depiction of: ',
        suffix: '. Include aged textures, sepia or muted tones, and retro aesthetics that evoke a sense of nostalgia. Focus on historical details and wear that show the passage of time, making the scene feel authentically old-fashioned.',
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
        prefix: 'Craft a long, expressive artistic interpretation of: ',
        suffix: '. Highlight creative and unique elements, focusing on emotional impact and visual storytelling. Include rich textures, bold colors, and imaginative details that blur the line between reality and artistic vision.',
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
        prefix: 'Describe an intricate abstract representation of: ',
        suffix: '. Emphasize surreal forms, unconventional shapes, and vibrant, otherworldly colors. Focus on the emotional or conceptual impression rather than physical accuracy, incorporating fluid or fragmented elements for a striking visual impact.',
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
        prefix: 'Write a deeply evocative and poetic visualization of: ',
        suffix: '. Use lyrical language to infuse the description with emotion and beauty. Include vivid imagery, metaphorical details, and atmospheric elements that create a dreamlike and moving impression.',
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
        prefix: 'Illustrate a vibrant and detailed anime-style portrayal of: ',
        suffix: '. Focus on bold outlines, vibrant colors, and exaggerated emotional expressions. Incorporate dynamic poses, dramatic perspectives, and background details typical of anime art to create a scene full of energy and life.',
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
        prefix: 'Create a lively and detailed cartoon depiction of: ',
        suffix: '. Include whimsical and exaggerated features, bold outlines, and bright, playful colors. Add fun, quirky details to make the scene or character engaging and visually appealing.',
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
        prefix: 'Describe a detailed and irresistibly cute version of: ',
        suffix: '. Focus on soft textures, bright pastel colors, and small, endearing details. Incorporate an overall adorable appeal that exudes warmth and charm, making the subject captivatingly lovable.',
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
        prefix: 'Design a futuristic and detailed sci-fi vision of: ',
        suffix: '. Focus on advanced technology, glowing elements, and an otherworldly atmosphere. Include intricate details of machinery, alien environments, and futuristic settings to immerse the viewer in a high-tech world.',
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

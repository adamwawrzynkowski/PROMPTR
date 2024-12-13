const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

const DEFAULT_STYLES = [
    {
        id: 'vintage',
        name: 'Vintage',
        description: 'Classic, retro-inspired style with a nostalgic feel',
        icon: 'camera-retro',
        prefix: 'Create a vintage-style description: ',
        suffix: ' Add retro elements and nostalgic details.',
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
        description: 'Dramatic, movie-like descriptions with visual flair',
        icon: 'film',
        prefix: 'Create a cinematic scene description: ',
        suffix: ' Make it dramatic and visually striking.',
        modelParameters: {
            temperature: 0.8,
            top_k: 60,
            top_p: 0.95,
            repeat_penalty: 1.2
        }
    },
    {
        id: 'minimalist',
        name: 'Minimalist',
        description: 'Clean, simple, and elegant descriptions',
        icon: 'minus',
        prefix: 'Create a minimalist description: ',
        suffix: ' Keep it simple and elegant.',
        modelParameters: {
            temperature: 0.5,
            top_k: 40,
            top_p: 0.8,
            repeat_penalty: 1.3
        }
    },
    {
        id: 'fantasy',
        name: 'Fantasy',
        description: 'Magical and otherworldly descriptions',
        icon: 'dragon',
        prefix: 'Create a fantasy-style description: ',
        suffix: ' Add magical and mystical elements.',
        modelParameters: {
            temperature: 0.9,
            top_k: 70,
            top_p: 0.95,
            repeat_penalty: 1.1
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
            console.log('Loading styles from:', this.stylesPath);
            const data = await fs.readFile(this.stylesPath, 'utf8');
            this.styles = JSON.parse(data);
            console.log('Loaded styles:', this.styles);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, create it with default styles
                console.log('No styles file found, creating default styles');
                this.styles = DEFAULT_STYLES;
                await this.saveStyles();
            } else {
                console.error('Error loading styles:', error);
                // If there's an error reading the file, use default styles
                this.styles = DEFAULT_STYLES;
            }
        }
        
        this.initialized = true;
    }

    async saveStyles() {
        try {
            console.log('Saving styles:', this.styles);
            
            // Ensure directory exists
            const dir = path.dirname(this.stylesPath);
            await fs.mkdir(dir, { recursive: true });
            
            // Write styles to file
            await fs.writeFile(this.stylesPath, JSON.stringify(this.styles, null, 2), 'utf8');
            console.log('Successfully saved styles to:', this.stylesPath);
            return true;
        } catch (error) {
            console.error('Error saving styles:', error);
            throw error; // Re-throw to handle in the caller
        }
    }

    async getStyle(styleId) {
        await this.initialize();
        console.log('Getting style with ID:', styleId);
        
        const style = this.styles.find(style => {
            const currentId = style.id || style.styleId;
            return currentId === styleId;
        });
        
        console.log('Found style:', style);
        return style;
    }

    async updateStyle(updatedStyle) {
        await this.initialize();
        console.log('Updating style:', updatedStyle);
        
        // Get style ID, accounting for different property names
        const styleId = updatedStyle.id || updatedStyle.styleId;
        console.log('Looking for style with ID:', styleId);
        
        const index = this.styles.findIndex(style => {
            const currentId = style.id || style.styleId;
            return currentId === styleId;
        });
        
        if (index !== -1) {
            // Keep existing parameters and merge with updates
            const existingStyle = this.styles[index];
            const mergedStyle = {
                ...existingStyle,  // Start with existing style
                ...updatedStyle,   // Add any new fields
                id: styleId,       // Ensure correct ID
                // Explicitly handle the icon to ensure it's preserved
                icon: updatedStyle.icon !== undefined ? updatedStyle.icon : existingStyle.icon,
                modelParameters: {
                    ...(existingStyle.modelParameters || {}),
                    ...(updatedStyle.modelParameters || {})
                }
            };
            
            // Remove any duplicate ID fields
            delete mergedStyle.styleId;
            
            // Update the style in the array
            this.styles[index] = mergedStyle;
            
            // Save to file
            try {
                await this.saveStyles();
                console.log('Successfully updated style:', this.styles[index]);
                return this.styles[index];
            } catch (error) {
                console.error('Error saving styles:', error);
                throw error;
            }
        }
        
        console.log('Style not found for update. Available styles:', this.styles.map(s => ({ id: s.id || s.styleId, name: s.name })));
        throw new Error(`Style with ID ${styleId} not found`);
    }

    async createStyle(style) {
        await this.initialize();
        console.log('Creating new style:', style);
        
        // Ensure the style has all required fields
        const newStyle = {
            id: style.id || `custom_${Date.now()}`,
            name: style.name || 'New Style',
            description: style.description || '',
            icon: style.icon || 'paint-brush', // Default icon
            prefix: style.prefix || '',
            suffix: style.suffix || '',
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
            console.log('Style deleted successfully');
            return true;
        }
        console.log('Style not found for deletion:', styleId);
        return false;
    }

    async getStyles() {
        return this.getAllStyles();
    }

    async getAllStyles() {
        await this.initialize();
        console.log('Getting all styles:', this.styles);
        return this.styles;
    }
}

module.exports = new StylesManager();

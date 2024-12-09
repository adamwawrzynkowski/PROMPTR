const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

class StylesManager {
    constructor() {
        this.stylesPath = path.join(app.getPath('userData'), 'styles.json');
        this.styles = [];
        this.loadStyles();
    }

    async loadStyles() {
        try {
            const data = await fs.readFile(this.stylesPath, 'utf8');
            this.styles = JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, create it with default styles
                this.styles = [];
                await this.saveStyles();
            } else {
                console.error('Error loading styles:', error);
            }
        }
    }

    async saveStyles() {
        try {
            await fs.writeFile(this.stylesPath, JSON.stringify(this.styles, null, 2));
        } catch (error) {
            console.error('Error saving styles:', error);
        }
    }

    async getStyle(styleId) {
        return this.styles.find(style => style.id === styleId);
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

    async deleteStyle(styleId) {
        const index = this.styles.findIndex(style => style.id === styleId);
        if (index !== -1) {
            this.styles.splice(index, 1);
            await this.saveStyles();
            return true;
        }
        return false;
    }

    async createStyle(style) {
        this.styles.push(style);
        await this.saveStyles();
        return style;
    }

    async getAllStyles() {
        return this.styles;
    }
}

module.exports = StylesManager;

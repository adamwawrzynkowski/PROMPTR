const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

class SettingsManager {
    constructor() {
        this.settingsPath = path.join(app.getPath('userData'), 'settings.json');
        this.defaultSettings = {
            theme: 'dark',
            promptTranslation: true,
            tagGeneration: true,
            slowMode: false,
            slowModeDelay: 2000,
            drawThingsIntegration: {
                enabled: true,
                autoSend: true,
                port: 3333
            }
        };
        this.settings = { ...this.defaultSettings };
        this.loadSettings();
    }

    async loadSettings() {
        try {
            const data = await fs.readFile(this.settingsPath, 'utf8');
            this.settings = { ...this.defaultSettings, ...JSON.parse(data) };
        } catch (error) {
            console.log('No settings file found, using defaults');
            await this.saveSettings();
        }
    }

    async saveSettings() {
        try {
            await fs.writeFile(this.settingsPath, JSON.stringify(this.settings, null, 2));
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    getSettings() {
        return { ...this.settings };
    }

    async updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        await this.saveSettings();
        return this.settings;
    }
}

module.exports = new SettingsManager(); 
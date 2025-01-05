const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class ConfigManager {
    constructor() {
        // Use user data directory instead of app directory
        this.configPath = path.join(app.getPath('userData'), 'config.json');
        this.config = this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                return JSON.parse(data);
            } else {
                // Create default config if it doesn't exist
                const defaultConfig = {
                    currentModel: null,
                    visionModel: null,
                    firstLaunch: true,
                    theme: 'dark'
                };
                this.saveConfig(defaultConfig);
                return defaultConfig;
            }
        } catch (error) {
            console.error('Error loading config:', error);
            // Return default config on error
            return {
                currentModel: null,
                visionModel: null,
                firstLaunch: true,
                theme: 'dark'
            };
        }
    }

    saveConfig(config) {
        try {
            console.log('Saving config:', config);
            // Create directory if it doesn't exist
            const configDir = path.dirname(this.configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            this.config = config;
            console.log('Config saved successfully');
        } catch (error) {
            console.error('Error saving config:', error);
        }
    }

    getConfig() {
        // Always reload config from disk to ensure we have the latest
        return this.loadConfig();
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.saveConfig(this.config);
        return this.config;
    }
}

module.exports = new ConfigManager();
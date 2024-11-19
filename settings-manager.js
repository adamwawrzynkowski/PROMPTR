const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class SettingsManager {
    constructor() {
        this.settingsPath = path.join(app.getPath('userData'), 'PROMPTR', 'settings.json');
        this.defaultSettings = {
            theme: 'dark',
            autoTranslate: true,
            tagGeneration: true,
            slowMode: false,
            slowModeDelay: 1000,
            drawThingsIntegration: {
                enabled: false,
                path: '',
                port: 3333
            }
        };
        const promptrDir = path.dirname(this.settingsPath);
        if (!fs.existsSync(promptrDir)) {
            fs.mkdirSync(promptrDir, { recursive: true });
        }
        this.settings = this.loadSettings();
        console.log('Initialized settings:', this.settings);
    }

    loadSettings() {
        try {
            if (fs.existsSync(this.settingsPath)) {
                console.log('Loading settings from:', this.settingsPath);
                const data = fs.readFileSync(this.settingsPath, 'utf8');
                const loadedSettings = JSON.parse(data);
                const mergedSettings = {
                    ...this.defaultSettings,
                    ...loadedSettings,
                    drawThingsIntegration: {
                        ...this.defaultSettings.drawThingsIntegration,
                        ...(loadedSettings.drawThingsIntegration || {})
                    }
                };
                console.log('Loaded settings:', mergedSettings);
                return mergedSettings;
            }
            console.log('No settings file found, creating with defaults');
            this.saveSettings(this.defaultSettings);
            return this.defaultSettings;
        } catch (error) {
            console.error('Error loading settings:', error);
            return this.defaultSettings;
        }
    }

    saveSettings(newSettings) {
        try {
            console.log('Saving settings:', newSettings);
            const settingsToSave = {
                theme: String(newSettings.theme || this.defaultSettings.theme),
                autoTranslate: Boolean(newSettings.autoTranslate),
                tagGeneration: Boolean(newSettings.tagGeneration),
                slowMode: Boolean(newSettings.slowMode),
                slowModeDelay: Number(newSettings.slowModeDelay) || this.defaultSettings.slowModeDelay,
                drawThingsIntegration: {
                    enabled: Boolean(newSettings.drawThingsIntegration?.enabled),
                    path: String(newSettings.drawThingsIntegration?.path || ''),
                    port: Number(newSettings.drawThingsIntegration?.port) || 3333
                }
            };

            const settingsDir = path.dirname(this.settingsPath);
            if (!fs.existsSync(settingsDir)) {
                fs.mkdirSync(settingsDir, { recursive: true });
            }

            fs.writeFileSync(this.settingsPath, JSON.stringify(settingsToSave, null, 2));
            console.log('Settings saved successfully to:', this.settingsPath);
            
            this.settings = settingsToSave;
            
            return settingsToSave;
        } catch (error) {
            console.error('Error saving settings:', error);
            return this.settings;
        }
    }

    getSettings() {
        return JSON.parse(JSON.stringify(this.settings));
    }

    updateSettings(newSettings) {
        try {
            console.log('Updating settings with:', newSettings);
            
            if (typeof newSettings !== 'object' || newSettings === null) {
                throw new Error('Invalid settings object');
            }

            const processedSettings = {
                theme: String(newSettings.theme || this.settings.theme),
                autoTranslate: newSettings.autoTranslate !== undefined ? Boolean(newSettings.autoTranslate) : this.settings.autoTranslate,
                tagGeneration: newSettings.tagGeneration !== undefined ? Boolean(newSettings.tagGeneration) : this.settings.tagGeneration,
                slowMode: newSettings.slowMode !== undefined ? Boolean(newSettings.slowMode) : this.settings.slowMode,
                slowModeDelay: Number(newSettings.slowModeDelay) || this.settings.slowModeDelay,
                drawThingsIntegration: {
                    enabled: newSettings.drawThingsIntegration?.enabled !== undefined 
                        ? Boolean(newSettings.drawThingsIntegration.enabled) 
                        : this.settings.drawThingsIntegration.enabled,
                    path: String(newSettings.drawThingsIntegration?.path || this.settings.drawThingsIntegration.path),
                    port: Number(newSettings.drawThingsIntegration?.port) || this.settings.drawThingsIntegration.port
                }
            };

            console.log('Processed settings:', processedSettings);
            return this.saveSettings(processedSettings);
        } catch (error) {
            console.error('Error updating settings:', error);
            return this.settings;
        }
    }

    resetSettings() {
        try {
            console.log('Resetting settings to defaults');
            return this.saveSettings(this.defaultSettings);
        } catch (error) {
            console.error('Error resetting settings:', error);
            return this.settings;
        }
    }
}

module.exports = new SettingsManager(); 
const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

class SettingsManager {
    constructor() {
        this._settingsPath = null;
        this._settings = null;
        this.defaultSettings = {
            theme: 'dark',
            autoTranslate: true,
            tagGeneration: true,
            slowMode: false,
            slowModeDelay: 1000,
            currentModel: null,
            visionModel: null,
            drawThingsIntegration: {
                enabled: false,
                path: '',
                port: 3333
            }
        };
    }

    get settingsPath() {
        if (!this._settingsPath) {
            this._settingsPath = path.join(app.getPath('userData'), 'PROMPTR', 'settings.json');
        }
        return this._settingsPath;
    }

    async ensureSettingsDirectory() {
        const settingsDir = path.dirname(this.settingsPath);
        try {
            await fs.access(settingsDir);
        } catch {
            await fs.mkdir(settingsDir, { recursive: true });
        }
    }

    async loadSettings() {
        try {
            await this.ensureSettingsDirectory();
            if (await fs.stat(this.settingsPath)) {
                console.log('Loading settings from:', this.settingsPath);
                const data = await fs.readFile(this.settingsPath, 'utf8');
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
                this._settings = mergedSettings;
            } else {
                console.log('No settings file found, creating with defaults');
                this._settings = this.defaultSettings;
                await this.saveSettings(this._settings);
            }
        } catch (error) {
            console.error('Error loading settings:', error);
            this._settings = this.defaultSettings;
        }
        return this._settings;
    }

    async getSettings() {
        if (!this._settings) {
            await this.loadSettings();
        }
        return JSON.parse(JSON.stringify(this._settings));
    }

    async saveSettings(settings) {
        try {
            await this.ensureSettingsDirectory();
            const settingsToSave = {
                theme: String(settings.theme || this.defaultSettings.theme),
                autoTranslate: Boolean(settings.autoTranslate),
                tagGeneration: Boolean(settings.tagGeneration),
                slowMode: Boolean(settings.slowMode),
                slowModeDelay: Number(settings.slowModeDelay) || this.defaultSettings.slowModeDelay,
                currentModel: settings.currentModel || null,
                visionModel: settings.visionModel || null,
                drawThingsIntegration: {
                    enabled: Boolean(settings.drawThingsIntegration?.enabled),
                    path: String(settings.drawThingsIntegration?.path || ''),
                    port: Number(settings.drawThingsIntegration?.port) || 3333
                }
            };
            await fs.writeFile(this.settingsPath, JSON.stringify(settingsToSave, null, 2));
            console.log('Settings saved successfully to:', this.settingsPath);
            this._settings = settingsToSave;
        } catch (error) {
            console.error('Error saving settings:', error);
            throw error;
        }
    }

    async updateSettings(updates) {
        try {
            console.log('Updating settings with:', updates);
            
            if (typeof updates !== 'object' || updates === null) {
                throw new Error('Invalid settings object');
            }

            const processedSettings = {
                theme: String(updates.theme || this._settings.theme),
                autoTranslate: updates.autoTranslate !== undefined ? Boolean(updates.autoTranslate) : this._settings.autoTranslate,
                tagGeneration: updates.tagGeneration !== undefined ? Boolean(updates.tagGeneration) : this._settings.tagGeneration,
                slowMode: updates.slowMode !== undefined ? Boolean(updates.slowMode) : this._settings.slowMode,
                slowModeDelay: Number(updates.slowModeDelay) || this._settings.slowModeDelay,
                currentModel: updates.currentModel !== undefined ? updates.currentModel : this._settings.currentModel,
                visionModel: updates.visionModel !== undefined ? updates.visionModel : this._settings.visionModel,
                drawThingsIntegration: {
                    enabled: updates.drawThingsIntegration?.enabled !== undefined 
                        ? Boolean(updates.drawThingsIntegration.enabled) 
                        : this._settings.drawThingsIntegration.enabled,
                    path: String(updates.drawThingsIntegration?.path || this._settings.drawThingsIntegration.path),
                    port: Number(updates.drawThingsIntegration?.port) || this._settings.drawThingsIntegration.port
                }
            };

            console.log('Processed settings:', processedSettings);
            await this.saveSettings(processedSettings);
            return processedSettings;
        } catch (error) {
            console.error('Error updating settings:', error);
            throw error;
        }
    }

    async resetSettings() {
        try {
            console.log('Resetting settings to defaults');
            await this.saveSettings(this.defaultSettings);
            return this.defaultSettings;
        } catch (error) {
            console.error('Error resetting settings:', error);
            throw error;
        }
    }
}

module.exports = new SettingsManager();
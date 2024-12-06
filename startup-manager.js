const { app, BrowserWindow } = require('electron');
const path = require('path');

class StartupManager {
    constructor() {
        this.config = {
            maxRetries: 3,
            retryDelay: 2000,
            startupTimeout: 30000,
            resourceCheckInterval: 1000,
            maxStartupAttempts: 2
        };
        
        this.startupAttempts = 0;
        this.isStarting = false;
        this.startupWindow = null;
        this.mainWindow = null;
    }

    updateStartupProgress(status, progress) {
        if (this.startupWindow && !this.startupWindow.isDestroyed()) {
            this.startupWindow.webContents.send('startup-progress', {
                status,
                progress: Math.min(100, Math.max(0, progress))
            });
        }
    }

    async initializeApp() {
        if (this.isStarting) return;
        this.isStarting = true;

        try {
            // Create and show startup window
            const startupWindow = require('./startup-window');
            this.startupWindow = startupWindow.create();

            // Initialize steps with progress weights
            const steps = [
                { name: 'Checking system resources', weight: 10 },
                { name: 'Initializing configuration', weight: 20 },
                { name: 'Setting up models', weight: 40 },
                { name: 'Preparing main window', weight: 30 }
            ];

            let currentProgress = 0;

            // Step 1: Check system resources
            this.updateStartupProgress(steps[0].name, currentProgress);
            await this.checkResources();
            currentProgress += steps[0].weight;

            // Step 2: Initialize configuration
            this.updateStartupProgress(steps[1].name, currentProgress);
            await new Promise(resolve => setTimeout(resolve, 500)); // Simulate config loading
            currentProgress += steps[1].weight;

            // Step 3: Setup models
            this.updateStartupProgress(steps[2].name, currentProgress);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate model setup
            currentProgress += steps[2].weight;

            // Step 4: Create main window
            this.updateStartupProgress(steps[3].name, currentProgress);
            await this.createMainWindow();
            currentProgress = 100;
            this.updateStartupProgress('Ready!', currentProgress);

            // Fade out startup window and show main window
            await new Promise(resolve => setTimeout(resolve, 500));
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.show();
            }
            if (this.startupWindow && !this.startupWindow.isDestroyed()) {
                this.startupWindow.close();
            }

        } catch (error) {
            console.error('Startup error:', error);
            if (this.startupWindow && !this.startupWindow.isDestroyed()) {
                this.startupWindow.webContents.send('startup-error', error.message);
            }
            await new Promise(resolve => setTimeout(resolve, 3000));
            app.quit();
        } finally {
            this.isStarting = false;
        }
    }

    async checkResources() {
        try {
            const startUsage = process.cpuUsage();
            const startTime = Date.now();

            await new Promise(resolve => setTimeout(resolve, 100));

            const endUsage = process.cpuUsage(startUsage);
            const endTime = Date.now();

            const cpuPercent = (endUsage.user + endUsage.system) / ((endTime - startTime) * 1000) * 100;
            const memoryUsage = process.memoryUsage();
            const memoryPercent = memoryUsage.heapUsed / memoryUsage.heapTotal;

            const resources = {
                cpu: cpuPercent,
                memory: memoryPercent,
                isHigh: cpuPercent > 90 || memoryPercent > 0.9,
                isCritical: cpuPercent > 95 || memoryPercent > 0.95
            };

            if (resources.isCritical) {
                throw new Error('System resources are critically low. Please close some applications and try again.');
            }

            return resources;
        } catch (error) {
            console.error('Error checking resources:', error);
            throw error;
        }
    }

    async createMainWindow() {
        // Create the main window but don't show it yet
        const createWindow = require('./main').createWindow;
        this.mainWindow = await createWindow();
        this.mainWindow.hide(); // Hide it until startup is complete
        return this.mainWindow;
    }
}

module.exports = StartupManager;
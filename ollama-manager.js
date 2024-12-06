const http = require('http');
const { app } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fetch = require('node-fetch');

class OllamaManager {
    constructor() {
        this._baseUrl = null;
        this._isInitialized = false;
        this._currentPort = null;
        this._modelsPath = null;
        this._defaultModel = 'llama2';
    }

    get baseUrl() {
        if (!this._baseUrl) {
            const port = this._currentPort || 11434;
            this._baseUrl = `http://localhost:${port}`;
        }
        return this._baseUrl;
    }

    get modelsPath() {
        if (!this._modelsPath) {
            this._modelsPath = path.join(app.getPath('userData'), 'PROMPTR', 'models');
        }
        return this._modelsPath;
    }

    async initialize() {
        if (this._isInitialized) return true;

        try {
            // Ensure models directory exists
            await fs.mkdir(this.modelsPath, { recursive: true });

            // Find available Ollama port
            this._currentPort = await this.findAvailablePort();
            if (!this._currentPort) {
                throw new Error('Could not find available port for Ollama');
            }

            // Test connection
            const isConnected = await this.checkConnection();
            if (!isConnected) {
                throw new Error('Could not connect to Ollama service');
            }

            this._isInitialized = true;
            return true;
        } catch (error) {
            console.error('Failed to initialize Ollama manager:', error);
            return false;
        }
    }

    async findAvailablePort(startPort = 11434) {
        for (let port = startPort; port < startPort + 10; port++) {
            try {
                const inUse = await new Promise((resolve) => {
                    const server = http.createServer();
                    server.on('error', () => resolve(true));
                    server.listen(port, () => {
                        server.close();
                        resolve(false);
                    });
                });

                if (!inUse) return port;
            } catch {
                continue;
            }
        }
        return null;
    }

    async checkConnection() {
        try {
            const response = await fetch(`${this.baseUrl}/api/version`);
            return response.ok;
        } catch {
            return false;
        }
    }

    async listModels() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);
            if (!response.ok) throw new Error('Failed to fetch models');
            const data = await response.json();
            return data.models || [];
        } catch (error) {
            console.error('Error listing models:', error);
            return [];
        }
    }

    async generatePrompt(prompt, styleId, customStyle = null) {
        if (!prompt) return '';

        try {
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this._defaultModel,
                    prompt: prompt,
                    stream: false,
                    options: {
                        temperature: 0.7,
                        top_p: 0.9,
                        top_k: 40,
                        repeat_penalty: 1.1
                    }
                })
            });

            if (!response.ok) throw new Error('Failed to generate prompt');
            
            const data = await response.json();
            return data.response || '';
        } catch (error) {
            console.error('Error generating prompt:', error);
            throw error;
        }
    }

    async generateTags(text) {
        if (!text) return [];

        try {
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this._defaultModel,
                    prompt: `Generate relevant tags for this text: ${text}`,
                    stream: false,
                    options: {
                        temperature: 0.7
                    }
                })
            });

            if (!response.ok) throw new Error('Failed to generate tags');
            
            const data = await response.json();
            const tags = data.response
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag.length > 0);
            
            return tags;
        } catch (error) {
            console.error('Error generating tags:', error);
            return [];
        }
    }

    setPort(port) {
        this._currentPort = port;
        this._baseUrl = `http://localhost:${port}`;
    }

    setDefaultModel(model) {
        this._defaultModel = model;
    }
}

module.exports = new OllamaManager();

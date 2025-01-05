const http = require('http');
const { app } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fetch = require('node-fetch');

class OllamaManager {
    constructor() {
        this._baseUrl = null;
        this._isInitialized = false;
        this._currentPort = 11434; // Set default port
        this._modelsPath = null;
        this._defaultModel = null;
        // Use explicit IPv4
        this._host = '127.0.0.1';
        this._port = 11434;
        this._progressCallback = null;

        // Import głównego managera Ollama
        this._ollamaManager = require('./ollama');

        // List of available models with their properties
        this._availableModels = {
            // Text Models
            'llama2': { type: 'text', tag: 'SFW' },
            'llama3': { type: 'text', tag: 'SFW' },
            'llama3.1': { type: 'text', tag: 'SFW' },
            'llama3.2': { type: 'text', tag: 'SFW' },
            'dolphin-llama3:8b': { type: 'text', tag: 'NSFW' },
            'mistral': { type: 'text', tag: 'SFW' },
            'dolphin-mistral:7b': { type: 'text', tag: 'NSFW' },
            'gemma': { type: 'text', tag: 'SFW' },
            'gemma2': { type: 'text', tag: 'SFW' },
            'qwen2': { type: 'text', tag: 'SFW' },
            // Vision Models
            'llama3.2-vision': { type: 'vision', tag: 'SFW' },
            'llava': { type: 'vision', tag: 'SFW' },
            'bakllava': { type: 'vision', tag: 'SFW' }
        };
    }

    get baseUrl() {
        return `http://${this._host}:${this._currentPort}`;
    }

    get modelsPath() {
        if (!this._modelsPath) {
            this._modelsPath = path.join(app.getPath('userData'), 'PROMPTR', 'models');
        }
        return this._modelsPath;
    }

    setDefaultModel(model) {
        if (!model) {
            throw new Error('Model name is required');
        }
        // Synchronizuj z głównym managerem Ollama
        this._defaultModel = model;
        console.log('Set default model in ollama-manager:', this._defaultModel);
    }

    getDefaultModel() {
        return this._defaultModel;
    }

    updateStartupProgress(progress, status, message) {
        if (this._progressCallback) {
            this._progressCallback(progress, status, message);
        }
    }

    async initialize(progressCallback) {
        this._progressCallback = progressCallback;
        if (this._isInitialized) return true;

        try {
            // Ensure models directory exists
            await fs.mkdir(this.modelsPath, { recursive: true });

            // Find Ollama executable path
            let ollamaPath;
            try {
                const { stdout } = await new Promise((resolve, reject) => {
                    require('child_process').exec('which ollama', (error, stdout, stderr) => {
                        if (error) {
                            reject(new Error('Ollama not found in PATH. Please make sure Ollama is installed correctly.'));
                        } else {
                            resolve({ stdout, stderr });
                        }
                    });
                });
                ollamaPath = stdout.trim();
                console.log('Found Ollama at:', ollamaPath);
            } catch (error) {
                console.error('Error finding Ollama:', error);
                throw error;
            }

            // Try to connect to existing Ollama instance
            try {
                const response = await fetch(`http://${this._host}:${this._port}/api/version`);
                if (response.ok) {
                    console.log('Successfully connected to existing Ollama instance');
                    this._currentPort = this._port;
                    this._isInitialized = true;
                    return true;
                }
            } catch (error) {
                console.log('Could not connect to existing Ollama instance:', error);
            }

            // If we couldn't connect, start a new instance
            console.log('Starting new Ollama instance...');
            const ollamaProcess = require('child_process').spawn(ollamaPath, ['serve'], {
                detached: true,
                stdio: 'inherit'
            });
            
            ollamaProcess.unref();
            
            // Wait for Ollama to start
            for (let attempt = 0; attempt < 15; attempt++) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                try {
                    const response = await fetch(`http://${this._host}:${this._port}/api/version`);
                    if (response.ok) {
                        console.log('Successfully connected to new Ollama instance');
                        this._currentPort = this._port;
                        this._isInitialized = true;
                        return true;
                    }
                } catch (error) {
                    console.log('Connection attempt', attempt + 1, 'failed:', error.message);
                }
            }
            
            throw new Error('Failed to start Ollama after multiple attempts');
        } catch (error) {
            console.error('Error initializing Ollama:', error);
            throw error;
        }
    }

    async checkAndPullDefaultModel() {
        try {
            console.log('Checking for default model:', this._defaultModel);
            
            // Get list of installed models
            const models = await this.listModels();
            const modelNames = models.map(m => m.name);
            console.log('Available models:', modelNames);
            
            if (!modelNames.includes(this._defaultModel)) {
                console.log(`Default model ${this._defaultModel} not found, pulling from Ollama...`);
                
                // Pull the model
                const response = await fetch(`http://${this._host}:${this._currentPort}/api/pull`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        name: this._defaultModel
                    })
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Error pulling model:', errorText);
                    throw new Error(`Failed to pull model: ${response.status} ${response.statusText}`);
                }
                
                console.log(`Successfully pulled model ${this._defaultModel}`);
            } else {
                console.log(`Model ${this._defaultModel} is already installed`);
            }
            
            return true;
        } catch (error) {
            console.error('Error checking/pulling default model:', error);
            throw error;
        }
    }

    async findAvailablePort(startPort = 11434) {
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);

        // First try to find running Ollama process
        try {
            console.log('Looking for running Ollama process...');
            const { stdout } = await execAsync('lsof -i -P | grep ollama');
            
            // Parse the output to find TCP ports
            const ports = stdout.split('\n')
                .filter(line => line.includes('TCP') && line.includes('LISTEN'))
                .map(line => {
                    const match = line.match(/:(\d+)/);
                    return match ? parseInt(match[1]) : null;
                })
                .filter(port => port !== null);

            if (ports.length > 0) {
                // Try to connect to each found port
                for (const port of ports) {
                    try {
                        console.log('Checking Ollama port:', port);
                        const response = await fetch(`http://${this._host}:${port}/api/version`);
                        if (response.ok) {
                            console.log('Found running Ollama instance on port', port);
                            this._currentPort = port;
                            return port;
                        }
                    } catch (error) {
                        console.log('Port', port, 'is not responding to Ollama API');
                    }
                }
            }
        } catch (error) {
            console.log('No running Ollama process found:', error.message);
        }

        console.log('Looking for available port...');
        // If no running Ollama found, look for an available port
        for (let port = startPort; port < startPort + 100; port++) {
            try {
                const inUse = await new Promise((resolve) => {
                    const server = http.createServer();
                    server.on('error', () => resolve(true));
                    server.listen(port, () => {
                        server.close();
                        resolve(false);
                    });
                });

                if (!inUse) {
                    console.log('Found available port:', port);
                    return port;
                }
            } catch {
                continue;
            }
        }

        console.log('No available ports found');
        return null;
    }

    async checkConnection() {
        try {
            const response = await fetch(`http://${this._host}:${this._currentPort}/api/version`);
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    async listModels() {
        try {
            // Ensure we have a valid port
            if (!this._currentPort) {
                console.log('No port set, using default port 11434');
                this._currentPort = 11434;
            }

            console.log('Fetching models from Ollama...');
            const url = `${this.baseUrl}/api/tags`;
            console.log('Fetching from URL:', url);
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            console.log('Received models from Ollama:', data);

            // Get installed models
            const installedModels = new Set(data.models.map(m => {
                console.log('Processing model:', m);
                const name = m.name.split(':')[0]; // Remove any version tags
                console.log('Extracted name:', name);
                return name;
            }));
            console.log('Installed models:', [...installedModels]);
            
            // Create complete model list with installation status and properties
            const allModels = Object.entries(this._availableModels).map(([name, props]) => {
                const model = {
                    name,
                    installed: installedModels.has(name),
                    type: props.type,
                    tag: props.tag,
                    size: data.models.find(m => m.name.startsWith(name))?.size || 0
                };
                console.log('Model status:', name, model.installed);
                return model;
            });

            return { models: allModels };
        } catch (error) {
            console.error('Error listing models:', error);
            return { models: [] };
        }
    }

    async generatePrompt(prompt, styleId, customStyle = null) {
        if (!prompt) return { prompt: '' };

        try {
            // Check if Ollama is initialized
            if (!this._isInitialized) {
                console.error('Ollama not initialized');
                throw new Error('Ollama not initialized');
            }

            // Synchronize model before using
            this._defaultModel = this._ollamaManager.currentModel;
            if (!this._defaultModel) {
                console.error('No text model selected. Please select a model in settings.');
                throw new Error('No text model selected. Please select a model in settings.');
            }

            let options = {
                temperature: 0.7,
                top_p: 0.9,
                top_k: 40,
                repeat_penalty: 1.1
            };

            // Jeśli mamy customStyle, użyj jego parametrów
            if (customStyle) {
                options = {
                    ...options,
                    temperature: customStyle.temperature || options.temperature,
                    top_p: customStyle.top_p || options.top_p,
                    top_k: customStyle.top_k || options.top_k,
                    repeat_penalty: customStyle.repeat_penalty || options.repeat_penalty
                };
            }

            // Dodaj parametry stylu do promptu
            let enhancedPrompt = prompt;
            if (customStyle && customStyle.prefix) {
                enhancedPrompt = `${customStyle.prefix} ${enhancedPrompt}`;
            }
            if (customStyle && customStyle.suffix) {
                enhancedPrompt = `${enhancedPrompt} ${customStyle.suffix}`;
            }

            console.log('Generating prompt with:', {
                model: this._defaultModel,
                styleId,
                options,
                enhancedPrompt
            });

            const response = await fetch(`http://${this._host}:${this._currentPort}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this._defaultModel,
                    prompt: enhancedPrompt,
                    stream: false,
                    options: options
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Failed to generate prompt:', errorText);
                throw new Error(`Failed to generate prompt: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            if (!data.response) {
                console.error('No response in data:', data);
                throw new Error('No response from model');
            }
            
            return { prompt: data.response, parameters: options };
        } catch (error) {
            console.error('Error generating prompt:', error);
            throw error;
        }
    }

    async generateTags(text) {
        if (!text) return [];

        try {
            // Synchronizuj model przed użyciem
            this._defaultModel = this._ollamaManager.currentModel;
            if (!this._defaultModel) {
                throw new Error('No model selected in Ollama configuration');
            }

            const prompt = `Task: Generate relevant tags for the given text. Return only comma-separated tags without any additional text.
Example output format: tag1, tag2, tag3

Text: ${text}`;

            console.log('Generating tags with model:', this._defaultModel);
            const response = await fetch(`http://${this._host}:${this._currentPort}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this._defaultModel,
                    prompt: prompt,
                    stream: false,
                    options: {
                        temperature: 0.7
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Tag generation API error:', errorText);
                throw new Error(`Failed to generate tags: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('Raw tag generation response:', data.response);
            
            const tags = data.response
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag.length > 0 && !tag.includes('\n'));
            
            console.log('Processed tags:', tags);
            return tags;
        } catch (error) {
            console.error('Error generating tags:', error);
            throw error;
        }
    }

    async detectAndTranslateText(text) {
        if (!text) return { detectedLanguage: null, translatedText: null };

        try {
            // Synchronizuj model przed użyciem
            this._defaultModel = this._ollamaManager.currentModel;
            if (!this._defaultModel) {
                throw new Error('No model selected in Ollama configuration');
            }

            console.log('Detecting language for text:', text.substring(0, 100) + '...');
            
            const detectPrompt = `Task: Detect the language of the given text. Return only the ISO 639-1 language code (2 letters).
Example: For English text return "en", for Spanish "es", for Polish "pl", etc.
Do not include any other text in your response.

Text: ${text}`;

            console.log('Language detection with model:', this._defaultModel);
            const detectResponse = await fetch(`http://${this._host}:${this._currentPort}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this._defaultModel,
                    prompt: detectPrompt,
                    stream: false,
                    options: {
                        temperature: 0.1
                    }
                })
            });

            if (!detectResponse.ok) {
                const errorText = await detectResponse.text();
                console.error('Language detection API error:', errorText);
                throw new Error(`Failed to detect language: ${detectResponse.status} ${detectResponse.statusText}`);
            }

            const detectData = await detectResponse.json();
            console.log('Raw language detection response:', detectData.response);
            
            const detectedLanguage = detectData.response.trim().toLowerCase().slice(0, 2);
            console.log('Detected language:', detectedLanguage);

            // If the text is already in English, return it as is
            if (detectedLanguage === 'en') {
                return {
                    detectedLanguage: 'en',
                    translatedText: text
                };
            }

            // For now, let's skip the Google Translate part and use Ollama for translation
            const translatePrompt = `Task: Translate the following text from ${detectedLanguage} to English. Return only the translation without any additional text.

Text to translate: ${text}`;

            console.log('Translating with model:', this._defaultModel);
            const translateResponse = await fetch(`http://${this._host}:${this._currentPort}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this._defaultModel,
                    prompt: translatePrompt,
                    stream: false,
                    options: {
                        temperature: 0.3
                    }
                })
            });

            if (!translateResponse.ok) {
                const errorText = await translateResponse.text();
                console.error('Translation API error:', errorText);
                throw new Error(`Failed to translate text: ${translateResponse.status} ${translateResponse.statusText}`);
            }

            const translateData = await translateResponse.json();
            console.log('Raw translation response:', translateData.response);
            
            const translatedText = translateData.response.trim();

            return {
                detectedLanguage,
                translatedText
            };
        } catch (error) {
            console.error('Error in detectAndTranslateText:', error);
            throw error;
        }
    }

    setPort(port) {
        this._currentPort = port;
        this._baseUrl = `http://${this._host}:${port}`;
    }
}

async function getStatus() {
    try {
        const response = await fetch('http://localhost:11434/api/tags');
        if (response.ok) {
            return { status: 'running' };
        }
        return { status: 'stopped' };
    } catch (error) {
        return { status: 'stopped' };
    }
}

module.exports = {
    ollamaManager: new OllamaManager(),
    OllamaManager,
    getStatus
};

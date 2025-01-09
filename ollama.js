const https = require('https');
const http = require('http');
const { exec, spawn } = require('child_process');
const { BrowserWindow } = require('electron');
const configManager = require('./config-manager');
const fsPromises = require('fs').promises;
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const fetch = require('node-fetch');

// Dodaj na początku pliku
const APP_NAME = 'PROMPTR';

// Zaktualizuj funkcję downloadFile
async function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const destDir = path.dirname(destPath);
        fsPromises.mkdir(destDir, { recursive: true })
            .then(() => {
                const file = fs.createWriteStream(destPath);
                https.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; PROMPTR/1.0)'
                    }
                }, response => {
                    if (response.statusCode === 302 || response.statusCode === 301) {
                        // Obsługa przekierowania
                        https.get(response.headers.location, response => {
                            const totalSize = parseInt(response.headers['content-length'], 10);
                            let downloadedSize = 0;

                            response.on('data', (chunk) => {
                                downloadedSize += chunk.length;
                                const progress = (downloadedSize / totalSize) * 100;
                                
                                // Wysyłamy aktualizację postępu
                                BrowserWindow.getAllWindows().forEach(window => {
                                    window.webContents.send('model-import-progress', {
                                        progress: Math.round(progress),
                                        details: `Downloading... ${Math.round(downloadedSize / 1024 / 1024)}MB / ${Math.round(totalSize / 1024 / 1024)}MB`,
                                        modelType: 'Vision'
                                    });
                                });
                            });

                            response.pipe(file);
                            file.on('finish', () => {
                                file.close();
                                resolve();
                            });
                        }).on('error', err => {
                            fs.unlink(destPath, () => {
                                reject(err);
                            });
                        });
                    } else if (response.statusCode !== 200) {
                        fs.unlink(destPath, () => {
                            reject(new Error(`Failed to download: ${response.statusCode}`));
                        });
                    } else {
                        const totalSize = parseInt(response.headers['content-length'], 10);
                        let downloadedSize = 0;

                        response.on('data', (chunk) => {
                            downloadedSize += chunk.length;
                            const progress = (downloadedSize / totalSize) * 100;
                            
                            // Wysyłamy aktualizację postępu
                            BrowserWindow.getAllWindows().forEach(window => {
                                window.webContents.send('model-import-progress', {
                                    progress: Math.round(progress),
                                    details: `Downloading... ${Math.round(downloadedSize / 1024 / 1024)}MB / ${Math.round(totalSize / 1024 / 1024)}MB`,
                                    modelType: 'Vision'
                                });
                            });
                        });

                        response.pipe(file);
                        file.on('finish', () => {
                            file.close();
                            resolve();
                        });
                    }
                }).on('error', err => {
                    fs.unlink(destPath, () => {
                        reject(err);
                    });
                });
            })
            .catch(reject);
    });
}

class OllamaManager {
    constructor() {
        this.endpoint = {
            host: '127.0.0.1',  // Always use IPv4
            port: 11434
        };
        this.isConnected = false;
        
        const savedConfig = configManager.getConfig();
        this.currentModel = savedConfig.currentModel;
        this.visionModel = savedConfig.visionModel;
        
        this.availableModels = [];
        this.lastError = null;
        this.startingServer = false;
        this.currentGeneration = null;
    }

    updateEndpoint(endpoint) {
        console.log('Updating Ollama endpoint to:', endpoint);
        this.endpoint = endpoint;
    }

    getBaseUrl() {
        return `http://${this.endpoint.host}:${this.endpoint.port}`;
    }

    async startServer() {
        if (this.startingServer) {
            console.log('Server startup already in progress');
            return false;
        }
        
        this.startingServer = true;
        console.log('Starting Ollama server...');

        return new Promise((resolve) => {
            // First, check if ollama is installed
            exec('which ollama', async (error) => {
                if (error) {
                    console.error('Ollama not found:', error);
                    this.lastError = 'Ollama is not installed';
                    this.startingServer = false;
                    resolve(false);
                    return;
                }
                
                // Try to start the server
                const ollamaProcess = spawn('ollama', ['serve'], {
                    detached: true,
                    stdio: 'ignore'
                });

                ollamaProcess.unref(); // Allow the process to run independently

                // Give the server some time to start
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Check connection with retries
                let retries = 5;
                const checkConnection = async () => {
                    try {
                        console.log('Checking if server is up (attempt', 6 - retries, 'of 5)...');
                        const response = await this.makeRequest(`${this.getBaseUrl()}/api/tags`);
                        if (response.ok) {
                            console.log('Ollama server started successfully');
                            this.startingServer = false;
                            this.isConnected = true;
                            resolve(true);
                            return;
                        }
                    } catch (error) {
                        console.log('Server not ready yet:', error.message);
                        if (--retries <= 0) {
                            console.error('Failed to start Ollama server after 5 attempts');
                            this.lastError = 'Failed to start Ollama server';
                            this.startingServer = false;
                            this.isConnected = false;
                            resolve(false);
                            return;
                        }
                    }
                    setTimeout(checkConnection, 2000);
                };

                checkConnection();
            });
        });
    }

    async makeRequest(url, options = {}) {
        try {
            console.log('Making request with options:', {
                url,
                method: options.method || 'GET',
                headers: options.headers,
                body: options.body
            });

            const response = await fetch(url, {
                method: options.method || 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                body: options.body ? JSON.stringify(options.body) : undefined
            });

            return response;
        } catch (error) {
            console.error('Request failed:', error);
            throw error;
        }
    }

    async checkConnection() {
        console.log('Checking Ollama connection...');
        try {
            console.log('Trying connection to:', this.getBaseUrl());
            const response = await fetch(this.getBaseUrl() + '/api/tags', {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                this.isConnected = true;
                this.lastError = null;
                console.log('Successfully connected to Ollama');
                
                // Update available models
                const data = await response.json();
                this.availableModels = data.models || [];
                
                return true;
            }

            this.isConnected = false;
            this.lastError = 'Failed to connect to Ollama';
            return false;
        } catch (error) {
            console.error('Ollama connection error:', error);
            this.isConnected = false;
            this.lastError = error.message;
            return false;
        }
    }

    async getStatus() {
        try {
            await this.checkConnection();
            const status = {
                isConnected: this.isConnected,
                currentModel: this.currentModel,
                visionModel: this.visionModel,
                lastError: this.lastError,
                availableModels: this.availableModels
            };
            console.log('Current Ollama status:', status);
            return status;
        } catch (error) {
            console.error('Error getting status:', error);
            return {
                isConnected: false,
                lastError: error.message,
                currentModel: null,
                visionModel: null,
                availableModels: []
            };
        }
    }

    async initialize(progressCallback) {
        try {
            progressCallback?.(0, 'startup', 'Checking Ollama connection...');
            let isConnected = await this.checkConnection();
            
            if (!isConnected) {
                progressCallback?.(20, 'startup', 'Starting Ollama server...');
                const serverStarted = await this.startServer();
                if (!serverStarted) {
                    return false;
                }
                isConnected = await this.checkConnection();
            }
            
            if (isConnected) {
                progressCallback?.(40, 'startup', 'Loading available models...');
                await this.listModels();
                
                progressCallback?.(60, 'startup', 'Checking model configuration...');
                const config = configManager.getConfig();
                this.currentModel = config.currentModel;
                this.visionModel = config.visionModel;
                
                progressCallback?.(100, 'startup', 'Ollama initialized successfully');
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Error initializing Ollama:', error);
            this.lastError = error.message;
            return false;
        }
    }

    async listModels() {
        try {
            const response = await this.makeRequest(`${this.getBaseUrl()}/api/tags`);
            
            if (!response.ok) {
                console.error('Failed to get installed models, response not OK');
                return [];
            }

            const data = await response.json();
            console.log('Raw response from /api/tags:', data);

            if (!data.models || !Array.isArray(data.models)) {
                console.warn('No models array in response:', data);
                return [];
            }

            // Lista modeli do pominięcia
            const excludedModels = ['codellama'];

            // Przetwórz wszystkie modele
            const modelNames = data.models
                .map(model => model.name)
                .filter(name => {
                    const baseName = name.split(':')[0].toLowerCase();
                    return !excludedModels.includes(baseName);
                })
                .filter((name, index, self) => self.indexOf(name) === index);

            console.log('Processed installed models:', modelNames);
            return modelNames;
        } catch (error) {
            console.error('Error getting installed models:', error);
            return [];
        }
    }

    async setModel(modelName) {
        console.log('Setting model to:', modelName);
        if (modelName) {
            const isAvailable = await this.checkModelAvailability(modelName);
            if (!isAvailable) {
                throw new Error(`Model ${modelName} is not available`);
            }
            this.currentModel = modelName;
            
            // Save to config and update our instance
            const currentConfig = configManager.getConfig();
            const newConfig = {
                ...currentConfig,
                currentModel: modelName
            };
            await configManager.saveConfig(newConfig);
            console.log('Saved model to config:', newConfig);
            
            // Notify all windows about the model change
            BrowserWindow.getAllWindows().forEach(window => {
                window.webContents.send('model-changed', newConfig);
            });
        }
    }

    async getCurrentModel() {
        // If we don't have a current model in memory, try to get it from config
        if (!this.currentModel) {
            const config = configManager.getConfig();
            this.currentModel = config.currentModel;
            console.log('Got current model from config:', this.currentModel);
        }
        return this.currentModel;
    }

    async ensureTextModelSelected() {
        const model = await this.getCurrentModel();
        if (!model) {
            throw new Error('No text model selected. Please select a model in settings.');
        }
        return model;
    }

    async generatePrompt(basePrompt, styleId, style) {
        try {
            const model = await this.ensureTextModelSelected();
            console.log('Generating prompt with model:', model);

            if (!style) {
                throw new Error('Style is required for prompt generation');
            }

            // Use style's prefix and suffix if available, otherwise use defaults
            const prefix = style.prefix || 'Generate a Stable Diffusion prompt for: ';
            const suffix = style.suffix || '';
            const systemInstructions = style.systemInstructions || '';

            // Create the system message with instructions
            const systemMessage = `You are an AI assistant specializing in creating image generation prompts.
                ${systemInstructions}
                
                IMPORTANT: 
                1. Do not include any instructions or meta-text in your response.
                2. Just provide the pure description.
                3. Do not repeat or include any of the following in your response:
                   - The prefix: "${prefix}"
                   - The suffix: "${suffix}"
                4. Focus only on describing the image content.
                5. Your description will be automatically formatted later.`;

            // Prepare the request body
            const requestBody = {
                model: model,
                prompt: `${systemMessage}\n\nUser input: ${basePrompt}\n\nProvide only the description, without any instructions, prefix, suffix, or meta-text:`,
                stream: false,
                options: {
                    temperature: style?.modelParams?.temperature || 0.7,
                    top_k: style?.modelParams?.topK || 40,
                    top_p: style?.modelParams?.topP || 0.9
                }
            };

            console.log('Making generate request with body:', requestBody);
            
            const response = await fetch(`${this.getBaseUrl()}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to generate prompt: ${errorText}`);
            }

            const data = await response.json();
            let generatedText = data.response.trim();

            // Remove any remaining instruction-like text
            const instructionPhrases = [
                'Create a humorous and playful description of:',
                'Focus on exaggerated, quirky features',
                'Create a detailed description',
                'Generate a description',
                'Provide a description',
                'Here\'s a description',
                'Create an image of',
                'The scene shows',
                'The image should show',
                'The image features'
            ];

            for (const phrase of instructionPhrases) {
                if (generatedText.toLowerCase().startsWith(phrase.toLowerCase())) {
                    generatedText = generatedText.substring(phrase.length).trim();
                }
            }

            // Remove any trailing instructions
            const trailingInstructions = [
                'Focus on',
                'Make sure to',
                'Remember to',
                'Include',
                'Emphasize'
            ];

            for (const instruction of trailingInstructions) {
                const index = generatedText.toLowerCase().lastIndexOf(instruction.toLowerCase());
                if (index !== -1) {
                    generatedText = generatedText.substring(0, index).trim();
                }
            }

            // Remove the prefix if it somehow got included in the response
            if (generatedText.toLowerCase().startsWith(prefix.toLowerCase())) {
                generatedText = generatedText.substring(prefix.length).trim();
            }

            // Remove the suffix if it somehow got included in the response
            if (generatedText.toLowerCase().endsWith(suffix.toLowerCase())) {
                generatedText = generatedText.substring(0, generatedText.length - suffix.length).trim();
            }

            console.log('Generated description:', generatedText);

            // Return in the expected format
            return {
                prompt: generatedText,
                parameters: requestBody.options
            };
        } catch (error) {
            console.error('Error generating prompt:', error);
            throw error;
        }
    }

    async analyzeImage(imageData, systemPrompt, analysisType = 'content', useCustomModel = false, customModelName = null) {
        try {
            if (useCustomModel) {
                // Użyj custom modelu
                const customModelsDir = path.join(app.getPath('userData'), APP_NAME, 'custom-models');
                const modelDir = path.join(customModelsDir, customModelName);
                const configPath = path.join(modelDir, 'promptr_config.json');
                
                try {
                    const configData = await fsPromises.readFile(configPath, 'utf8');
                    const config = JSON.parse(configData);
                    
                    // Tutaj możesz użyć własnej logiki analizy obrazu dla custom modelu
                    // Na razie zwróćmy przykładowy opis
                    return `Image analysis using custom model: ${config.displayName}\n\n` +
                           `This is a placeholder response for custom model analysis. ` +
                           `The actual implementation would use the model files from: ${modelDir}`;
                } catch (error) {
                    throw new Error(`Failed to load custom model configuration: ${error.message}`);
                }
            } else {
                // Użyj Ollama
                if (!this.isConnected) {
                    throw new Error('Not connected to Ollama');
                }

                const modelToUse = this.visionModel;
                if (!modelToUse) {
                    throw new Error('No vision model selected in Ollama');
                }

                let base64Image = imageData;
                if (imageData.startsWith('data:')) {
                    base64Image = imageData.split(',')[1];
                }

                let prompt;
                if (analysisType === 'style') {
                    prompt = `Focus ONLY on the artistic style of this image. Describe:
- Art style (realistic, cartoon, anime, etc.)
- Color palette and mood
- Lighting and composition
- Artistic techniques used
Keep it brief and concise. Do not describe the content or subjects in the image.`;
                } else if (analysisType === 'detailed') {
                    prompt = systemPrompt || "Provide a detailed description of everything you see in this image.";
                } else {
                    prompt = "Briefly describe what you see in this image. Focus on the main elements and overall composition.";
                }

                const response = await this.makeRequest(`${this.getBaseUrl()}/api/generate`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: modelToUse,
                        prompt: prompt,
                        images: [base64Image],
                        stream: false,
                        options: {
                            temperature: 0.7,
                            num_predict: analysisType === 'detailed' ? 1000 : 300,
                        }
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                if (!data.response) {
                    throw new Error('Empty response from Ollama API');
                }

                return data.response.trim();
            }
        } catch (error) {
            console.error('Error in analyzeImage:', error);
            throw error;
        }
    }

    async installModel(modelName, progressCallback) {
        try {
            const response = await this.makeRequest(`${this.getBaseUrl()}/api/pull`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: modelName })
            });

            // Obsługa streamu dla postępu pobierania
            if (response.ok) {
                const reader = response.body.getReader();
                let downloadedSize = 0;
                let totalSize = 0;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const text = new TextDecoder().decode(value);
                    const lines = text.split('\n').filter(line => line.trim());

                    for (const line of lines) {
                        try {
                            const data = JSON.parse(line);
                            if (data.total) {
                                totalSize = data.total;
                                downloadedSize = data.completed;
                                const progress = (downloadedSize / totalSize) * 100;
                                if (progressCallback) {
                                    progressCallback(progress);
                                }
                            }
                        } catch (e) {
                            console.error('Error parsing progress data:', e);
                        }
                    }
                }

                return true;
            } else {
                throw new Error('Failed to install model');
            }
        } catch (error) {
            console.error('Error installing model:', error);
            throw error;
        }
    }

    async deleteModel(modelName) {
        try {
            const response = await this.makeRequest(`${this.getBaseUrl()}/api/delete`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: modelName })
            });

            if (!response.ok) {
                throw new Error(`Failed to delete model: ${response.status}`);
            }

            return true;
        } catch (error) {
            console.error('Error deleting model:', error);
            throw error;
        }
    }

    async checkModelAvailability(modelName) {
        try {
            console.log('Checking availability for model:', modelName);
            if (!modelName) return false;
            
            const installedModels = await this.getInstalledModels();
            console.log('Installed models:', installedModels);
            
            // Sprawdź dokładne dopasowanie lub warianty z tagami
            const isInstalled = installedModels.some(installed => {
                const installedBase = installed.split(':')[0].toLowerCase();
                const searchBase = modelName.split(':')[0].toLowerCase();
                return installed === modelName || 
                       installedBase === searchBase ||
                       installed.startsWith(modelName + ':') ||
                       modelName.startsWith(installed + ':');
            });
            
            console.log(`Model ${modelName} installed:`, isInstalled);
            return isInstalled;
        } catch (error) {
            console.error('Error checking model availability:', error);
            return false;
        }
    }

    async detectAndTranslateText(text) {
        try {
            // Sprawdź ustawienia
            const settings = require('./settings-manager').getSettings();
            if (!settings.autoTranslate) {
                console.log('Translation is disabled in settings');
                return {
                    isTranslated: false,
                    originalText: text,
                    translatedText: text,
                    originalLanguage: 'unknown'
                };
            }

            // Sprawdź czy tekst jest pusty
            if (!text || text.trim().length === 0) {
                return {
                    isTranslated: false,
                    originalText: text,
                    translatedText: text,
                    originalLanguage: 'unknown'
                };
            }

            console.log('Starting translation process...');

            // Użyj Google Translate API z parametrami w URL
            const encodedText = encodeURIComponent(text);
            const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodedText}`;
            
            console.log('Using Google Translate API...');

            try {
                const response = await fetch(translateUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0'
                    }
                });

                if (!response.ok) {
                    throw new Error(`Translation API error: ${response.status}`);
                }

                const data = await response.json();
                
                // Format odpowiedzi to: [[["tłumaczenie","oryginalny tekst",""]],,"język"]
                if (!data || !data[0] || !data[0][0] || !data[0][0][0]) {
                    throw new Error('Invalid translation response format');
                }

                const translatedText = data[0][0][0];
                const detectedLanguage = data[2] || 'unknown';

                // Jeśli wykryto angielski lub tłumaczenie jest identyczne z oryginałem
                if (detectedLanguage === 'en' || translatedText.toLowerCase().trim() === text.toLowerCase().trim()) {
                    console.log('Text is already in English or no translation needed');
                    return {
                        isTranslated: false,
                        originalText: text,
                        translatedText: text,
                        originalLanguage: 'en'
                    };
                }

                console.log('Translation completed:', {
                    from: detectedLanguage,
                    original: text,
                    translated: translatedText
                });

                return {
                    isTranslated: true,
                    originalText: text,
                    translatedText: translatedText,
                    originalLanguage: detectedLanguage
                };

            } catch (error) {
                console.error('Translation API error:', error);
                return {
                    isTranslated: false,
                    originalText: text,
                    translatedText: text,
                    originalLanguage: 'unknown',
                    error: error.message
                };
            }

        } catch (error) {
            console.error('Translation error:', error);
            return {
                isTranslated: false,
                originalText: text,
                translatedText: text,
                originalLanguage: 'unknown',
                error: error.message
            };
        }
    }

    async ensureModelSelected() {
        console.log('Current model from config:', this.currentModel);
        
        if (!this.currentModel) {
            console.log('No model selected, getting available models...');
            const models = await this.listModels();
            console.log('Available models:', models);
            
            const installedModels = models.filter(m => m.installed);
            console.log('Installed models:', installedModels);
            
            if (installedModels.length > 0) {
                const selectedModel = installedModels[0].name;
                console.log('Setting first installed model:', selectedModel);
                await this.setModel(selectedModel);
            } else {
                throw new Error('No models available. Please install a model first.');
            }
        } else {
            // Verify if the current model is actually installed
            console.log('Verifying if current model is installed:', this.currentModel);
            const models = await this.listModels();
            const isInstalled = models.some(m => m.installed && (m.name === this.currentModel || m.name.split(':')[0] === this.currentModel));
            
            if (!isInstalled) {
                console.log('Current model not found in installed models, resetting...');
                this.currentModel = null;
                return await this.ensureModelSelected();
            }
        }
        
        return this.currentModel;
    }

    async getInstalledModels() {
        try {
            console.log('Fetching installed models...');
            const response = await this.makeRequest(`${this.getBaseUrl()}/api/tags`);
            
            if (!response.ok) {
                console.error('Failed to get installed models, response not OK');
                return [];
            }

            const data = await response.json();
            console.log('Raw response from /api/tags:', data);

            if (!data.models || !Array.isArray(data.models)) {
                console.warn('No models array in response:', data);
                return [];
            }

            // Lista modeli do pominięcia
            const excludedModels = ['codellama'];

            // Przetwórz wszystkie modele
            const modelNames = data.models
                .map(model => model.name)
                .filter(name => {
                    const baseName = name.split(':')[0].toLowerCase();
                    return !excludedModels.includes(baseName);
                })
                .filter((name, index, self) => self.indexOf(name) === index);

            console.log('Processed installed models:', modelNames);
            return modelNames;
        } catch (error) {
            console.error('Error getting installed models:', error);
            return [];
        }
    }

    async pullModel(modelName, progressCallback) {
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify({
                name: modelName,
                stream: true
            });

            const options = {
                hostname: this.endpoint.host,
                port: this.endpoint.port,
                path: '/api/pull',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = http.request(options, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Failed to pull model: ${res.statusCode}`));
                    return;
                }

                let buffer = '';

                res.on('data', (chunk) => {
                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); // Keep the last incomplete line

                    lines.forEach(line => {
                        if (line.trim()) {
                            try {
                                const data = JSON.parse(line);
                                if (data.total && data.completed) {
                                    const progress = (data.completed / data.total) * 100;
                                    if (progressCallback) {
                                        progressCallback(progress);
                                    }
                                }
                            } catch (e) {
                                console.warn('Error parsing JSON:', e);
                            }
                        }
                    });
                });

                res.on('end', () => {
                    // Process any remaining data in buffer
                    if (buffer.trim()) {
                        try {
                            const data = JSON.parse(buffer);
                            if (data.total && data.completed && progressCallback) {
                                const progress = (data.completed / data.total) * 100;
                                progressCallback(progress);
                            }
                        } catch (e) {
                            console.warn('Error parsing JSON:', e);
                        }
                    }
                    resolve(true);
                });
            });

            req.on('error', (error) => {
                console.error('Error pulling model:', error);
                reject(error);
            });

            req.write(postData);
            req.end();
        });
    }

    async generateTags(text, batchSize = 6, totalBatches = 5) {
        try {
            const model = await this.ensureTextModelSelected();
            console.log('Generating tags with model:', model);

            const prompt = `Generate ${batchSize * totalBatches} unique, relevant tags for the following text. Each tag should be a single word or short phrase. Separate tags with commas: ${text}`;

            const response = await fetch(`${this.getBaseUrl()}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    prompt: prompt,
                    stream: false,
                    options: {
                        temperature: 0.7,
                        top_p: 0.9,
                        top_k: 50
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to generate tags: ${errorText}`);
            }

            const data = await response.json();
            const tags = data.response
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag.length > 0);

            // Group tags into batches
            const batches = [];
            for (let i = 0; i < tags.length; i += batchSize) {
                batches.push(tags.slice(i, i + batchSize));
            }

            return batches.slice(0, totalBatches);
        } catch (error) {
            console.error('Error in generateTags:', error);
            throw error;
        }
    }

    async refinePrompt(prompt, style) {
        try {
            const model = await this.ensureTextModelSelected();
            console.log('Refining prompt with model:', model);

            const systemInstruction = `You are a specialized AI trained to enhance and refine prompts for image generation. Your task is to take an existing prompt and make it more detailed and specific, while maintaining its original intent and style.

Follow these guidelines:
1. Analyze the original prompt carefully
2. Add more specific visual details and descriptive elements
3. Enhance atmosphere and mood descriptions
4. Include additional relevant artistic elements
5. Maintain the original style and theme
6. Keep the language natural and flowing
7. DO NOT add any style tags, quality terms, or technical specifications at the end
8. DO NOT drastically change the original concept
9. ONLY return the enhanced prompt text, nothing else
10. DO NOT include any explanations or comments about the changes made
11. DO NOT include phrases like "Original prompt:" or "Enhanced prompt:"

Example input: "A castle in the mountains"
Example output: "A majestic medieval castle perched atop craggy mountain peaks, its ancient stone towers reaching into misty clouds, while snow-capped peaks stretch endlessly into the distance, the fortress walls weathered by centuries of alpine winds"`;

            const requestBody = {
                model: model,
                prompt: systemInstruction + "\n\nEnhance this prompt: " + prompt,
                stream: false,
                options: {
                    temperature: style?.modelParameters?.temperature || 0.75,
                    top_p: style?.modelParameters?.top_p || 0.9,
                    top_k: style?.modelParameters?.top_k || 50,
                    repeat_penalty: style?.modelParameters?.repeat_penalty || 1.2
                }
            };

            console.log('Making refine request with body:', requestBody);
            
            const response = await fetch(`${this.getBaseUrl()}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to refine prompt: ${errorText}`);
            }

            const data = await response.json();
            return data.response.trim();
        } catch (error) {
            console.error('Error in refinePrompt:', error);
            throw error;
        }
    }

    // Dodaj metodę do sprawdzania czy model jest customowy
    isCustomModel(modelName) {
        return modelName.startsWith('custom_');
    }

    getCustomModelsPath() {
        return path.join(app.getPath('userData'), APP_NAME, 'custom-models');
    }

    async getCustomModels() {
        try {
            const customModelsDir = this.getCustomModelsPath();
            console.log('Custom models directory:', customModelsDir);
            
            await fsPromises.mkdir(customModelsDir, { recursive: true });
            const entries = await fsPromises.readdir(customModelsDir, { withFileTypes: true });
            
            const models = [];
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const configPath = path.join(customModelsDir, entry.name, 'promptr_config.json');
                    try {
                        const configData = await fsPromises.readFile(configPath, 'utf8');
                        const config = JSON.parse(configData);
                        models.push({
                            ...config,
                            fullPath: path.join(customModelsDir, entry.name)
                        });
                    } catch (e) {
                        console.warn(`Could not read config for ${entry.name}:`, e);
                    }
                }
            }
            
            console.log('Found custom models:', models);
            return models;
        } catch (error) {
            console.error('Error getting custom models:', error);
            return [];
        }
    }

    async deleteCustomModel(modelName) {
        try {
            // Usuń pliki modelu
            const customModelsDir = path.join(app.getPath('userData'), APP_NAME, 'custom-models');
            const modelDir = path.join(customModelsDir, modelName);
            await fsPromises.rm(modelDir, { recursive: true, force: true });
            
            return true;
        } catch (error) {
            console.error('Error deleting custom model:', error);
            throw error;
        }
    }

    async convertModelToONNX(modelPath) {
        try {
            // Ścieżki plików
            const safetensorsPath = path.join(modelPath, 'model.safetensors');
            const onnxPath = path.join(modelPath, 'model.onnx');
            
            // Zaktualizowany skrypt Python
            const pythonScript = `
import torch
from safetensors import safe_open
import os

def convert_safetensors_to_onnx(safetensors_path, onnx_path):
    try:
        # Wczytaj model z safetensors
        with safe_open(safetensors_path, framework="pt", device="cpu") as f:
            tensors = {k: f.get_tensor(k) for k in f.keys()}
        
        # Utwórz model PyTorch
        class SimpleModel(torch.nn.Module):
            def __init__(self, tensors):
                super().__init__()
                # Zamień kropki na podkreślenia w nazwach parametrów
                self.tensors = torch.nn.ParameterDict({
                    k.replace('.', '_'): torch.nn.Parameter(v) 
                    for k, v in tensors.items()
                })
            
            def forward(self, x):
                # Przykładowa implementacja forward pass
                # Dostosuj to do rzeczywistej architektury modelu
                for tensor in self.tensors.values():
                    if tensor.shape[-2:] == x.shape[-2:]:
                        return tensor * x
                return x

        model = SimpleModel(tensors)
        model.eval()

        # Przykładowe dane wejściowe
        dummy_input = torch.randn(1, 3, 224, 224)

        # Eksportuj do ONNX
        torch.onnx.export(
            model,
            dummy_input,
            onnx_path,
            export_params=True,
            opset_version=11,
            do_constant_folding=True,
            input_names=['input'],
            output_names=['output'],
            dynamic_axes={'input': {0: 'batch_size'},
                         'output': {0: 'batch_size'}}
        )

        # Usuń plik safetensors po udanej konwersji
        if os.path.exists(onnx_path):
            os.remove(safetensorsPath)
            return True
        return False
    except Exception as e:
        print(f"Error during conversion: {str(e)}")
        return False

try:
    success = convert_safetensors_to_onnx("${safetensorsPath}", "${onnxPath}")
    print("SUCCESS" if success else "FAILED")
except Exception as e:
    print(f"Error: {str(e)}")
    print("FAILED")
`;

            // Zapisz skrypt tymczasowo
            const scriptPath = path.join(modelPath, 'convert.py');
            await fsPromises.writeFile(scriptPath, pythonScript);

            // Uruchom konwersję
            return new Promise((resolve, reject) => {
                const pythonProcess = spawn('python3', [scriptPath]);
                
                let output = '';
                let errorOutput = '';

                pythonProcess.stdout.on('data', (data) => {
                    output += data.toString();
                    console.log('Python output:', data.toString());
                });

                pythonProcess.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                    console.error('Python error:', data.toString());
                });

                pythonProcess.on('close', async (code) => {
                    // Usuń tymczasowy skrypt
                    await fsPromises.unlink(scriptPath).catch(console.error);
                    
                    if (code !== 0 || !output.includes('SUCCESS')) {
                        reject(new Error(errorOutput || 'Conversion failed'));
                    } else {
                        resolve(true);
                    }
                });
            });
        } catch (error) {
            console.error('Error converting model:', error);
            throw error;
        }
    }

    // Dodaj metodę do anulowania generowania
    async cancelCurrentGeneration() {
        console.log('Cancelling current generation');
        if (this.currentGeneration) {
            try {
                // Anuluj bieżące żądanie
                await this.makeRequest(`${this.getBaseUrl()}/api/generate`, {
                    method: 'DELETE'
                });
                this.currentGeneration = null;
                console.log('Generation cancelled successfully');
            } catch (error) {
                console.error('Error cancelling generation:', error);
            }
        }
    }

    async installCustomModel(inputUrl, progressCallback) {
        try {
            // Sprawdź czy URL jest poprawny
            if (!inputUrl.includes('huggingface.co')) {
                throw new Error('Invalid model URL. Must be a Hugging Face model URL.');
            }

            // Ekstrakcja nazwy modelu i autora z URL
            const urlParts = inputUrl.split('/');
            const modelName = urlParts.pop();
            const author = urlParts.pop();
            
            // Utworzenie pełnej nazwy modelu
            const fullModelName = `${author}/${modelName}`;
            
            // Utwórz ścieżkę do katalogu modelu
            const customModelsDir = path.join(app.getPath('userData'), APP_NAME, 'custom-models', modelName);
            await fsPromises.mkdir(customModelsDir, { recursive: true });

            // Pobierz konfigurację modelu z Hugging Face
            const configUrl = `https://huggingface.co/${author}/${modelName}/raw/main/config.json`;
            const modelFileUrl = `https://huggingface.co/${author}/${modelName}/resolve/main/model.safetensors`;
            
            // Ścieżki lokalne
            const configPath = path.join(customModelsDir, 'config.json');
            const modelPath = path.join(customModelsDir, 'model.safetensors');
            const promprConfigPath = path.join(customModelsDir, 'promptr_config.json');

            // Pobierz config.json
            await downloadFile(configUrl, configPath);

            // Pobierz model.safetensors z monitorowaniem postępu
            await new Promise((resolve, reject) => {
                const modelFile = fs.createWriteStream(modelPath);
                https.get(modelFileUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; PROMPTR/1.0)'
                    }
                }, response => {
                    if (response.statusCode === 302 || response.statusCode === 301) {
                        // Obsługa przekierowania
                        https.get(response.headers.location, response => {
                            const totalSize = parseInt(response.headers['content-length'], 10);
                            let downloadedSize = 0;

                            response.on('data', (chunk) => {
                                downloadedSize += chunk.length;
                                const progress = (downloadedSize / totalSize) * 100;
                                if (progressCallback) {
                                    progressCallback(Math.round(progress), downloadedSize, totalSize);
                                }
                            });

                            response.pipe(modelFile);
                            modelFile.on('finish', () => {
                                modelFile.close();
                                resolve();
                            });
                        }).on('error', err => {
                            fs.unlink(modelPath, () => reject(err));
                        });
                    } else if (response.statusCode !== 200) {
                        fs.unlink(modelPath, () => {
                            reject(new Error(`Failed to download: ${response.statusCode}`));
                        });
                    } else {
                        const totalSize = parseInt(response.headers['content-length'], 10);
                        let downloadedSize = 0;

                        response.on('data', (chunk) => {
                            downloadedSize += chunk.length;
                            const progress = (downloadedSize / totalSize) * 100;
                            if (progressCallback) {
                                progressCallback(Math.round(progress), downloadedSize, totalSize);
                            }
                        });

                        response.pipe(modelFile);
                        modelFile.on('finish', () => {
                            modelFile.close();
                            resolve();
                        });
                    }
                }).on('error', err => {
                    fs.unlink(modelPath, () => reject(err));
                });
            });

            // Utwórz plik konfiguracyjny PROMPTR
            const promprConfig = {
                name: modelName,
                author: author,
                displayName: `${author}/${modelName}`,
                type: 'Custom',
                importDate: new Date().toISOString()
            };

            await fsPromises.writeFile(
                promprConfigPath,
                JSON.stringify(promprConfig, null, 2)
            );

            return {
                success: true,
                modelName: fullModelName,
                path: customModelsDir
            };

        } catch (error) {
            console.error('Error installing custom model:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async deleteCustomModel(modelName) {
        try {
            // Usuń pliki modelu
            const customModelsDir = path.join(app.getPath('userData'), APP_NAME, 'custom-models');
            const modelDir = path.join(customModelsDir, modelName);
            await fsPromises.rm(modelDir, { recursive: true, force: true });
            
            return true;
        } catch (error) {
            console.error('Error deleting custom model:', error);
            throw error;
        }
    }

    async convertModelToONNX(modelPath) {
        try {
            // Ścieżki plików
            const safetensorsPath = path.join(modelPath, 'model.safetensors');
            const onnxPath = path.join(modelPath, 'model.onnx');
            
            // Zaktualizowany skrypt Python
            const pythonScript = `
import torch
from safetensors import safe_open
import os

def convert_safetensors_to_onnx(safetensors_path, onnx_path):
    try:
        # Wczytaj model z safetensors
        with safe_open(safetensors_path, framework="pt", device="cpu") as f:
            tensors = {k: f.get_tensor(k) for k in f.keys()}
        
        # Utwórz model PyTorch
        class SimpleModel(torch.nn.Module):
            def __init__(self, tensors):
                super().__init__()
                # Zamień kropki na podkreślenia w nazwach parametrów
                self.tensors = torch.nn.ParameterDict({
                    k.replace('.', '_'): torch.nn.Parameter(v) 
                    for k, v in tensors.items()
                })
            
            def forward(self, x):
                # Przykładowa implementacja forward pass
                # Dostosuj to do rzeczywistej architektury modelu
                for tensor in self.tensors.values():
                    if tensor.shape[-2:] == x.shape[-2:]:
                        return tensor * x
                return x

        model = SimpleModel(tensors)
        model.eval()

        # Przykładowe dane wejściowe
        dummy_input = torch.randn(1, 3, 224, 224)

        # Eksportuj do ONNX
        torch.onnx.export(
            model,
            dummy_input,
            onnx_path,
            export_params=True,
            opset_version=11,
            do_constant_folding=True,
            input_names=['input'],
            output_names=['output'],
            dynamic_axes={'input': {0: 'batch_size'},
                         'output': {0: 'batch_size'}}
        )

        # Usuń plik safetensors po udanej konwersji
        if os.path.exists(onnx_path):
            os.remove(safetensorsPath)
            return True
        return False
    except Exception as e:
        print(f"Error during conversion: {str(e)}")
        return False

try:
    success = convert_safetensors_to_onnx("${safetensorsPath}", "${onnxPath}")
    print("SUCCESS" if success else "FAILED")
except Exception as e:
    print(f"Error: {str(e)}")
    print("FAILED")
`;

            // Zapisz skrypt tymczasowo
            const scriptPath = path.join(modelPath, 'convert.py');
            await fsPromises.writeFile(scriptPath, pythonScript);

            // Uruchom konwersję
            return new Promise((resolve, reject) => {
                const pythonProcess = spawn('python3', [scriptPath]);
                
                let output = '';
                let errorOutput = '';

                pythonProcess.stdout.on('data', (data) => {
                    output += data.toString();
                    console.log('Python output:', data.toString());
                });

                pythonProcess.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                    console.error('Python error:', data.toString());
                });

                pythonProcess.on('close', async (code) => {
                    // Usuń tymczasowy skrypt
                    await fsPromises.unlink(scriptPath).catch(console.error);
                    
                    if (code !== 0 || !output.includes('SUCCESS')) {
                        reject(new Error(errorOutput || 'Conversion failed'));
                    } else {
                        resolve(true);
                    }
                });
            });
        } catch (error) {
            console.error('Error converting model:', error);
            throw error;
        }
    }

    async cancelCurrentGeneration() {
        console.log('Cancelling current generation');
        if (this.currentGeneration) {
            try {
                // Anuluj bieżące żądanie
                await this.makeRequest(`${this.getBaseUrl()}/api/generate`, {
                    method: 'DELETE'
                });
                this.currentGeneration = null;
                console.log('Generation cancelled successfully');
            } catch (error) {
                console.error('Error cancelling generation:', error);
            }
        }
    }

    async pullModel(modelName, progressCallback) {
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify({
                name: modelName,
                stream: true
            });

            const options = {
                hostname: this.endpoint.host,
                port: this.endpoint.port,
                path: '/api/pull',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = http.request(options, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Failed to pull model: ${res.statusCode}`));
                    return;
                }

                let buffer = '';

                res.on('data', (chunk) => {
                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); // Keep the last incomplete line

                    lines.forEach(line => {
                        if (line.trim()) {
                            try {
                                const data = JSON.parse(line);
                                if (data.total && data.completed) {
                                    const progress = (data.completed / data.total) * 100;
                                    if (progressCallback) {
                                        progressCallback(progress);
                                    }
                                }
                            } catch (e) {
                                console.warn('Error parsing JSON:', e);
                            }
                        }
                    });
                });

                res.on('end', () => {
                    // Process any remaining data in buffer
                    if (buffer.trim()) {
                        try {
                            const data = JSON.parse(buffer);
                            if (data.total && data.completed && progressCallback) {
                                const progress = (data.completed / data.total) * 100;
                                progressCallback(progress);
                            }
                        } catch (e) {
                            console.warn('Error parsing JSON:', e);
                        }
                    }
                    resolve(true);
                });
            });

            req.on('error', (error) => {
                console.error('Error pulling model:', error);
                reject(error);
            });

            req.write(postData);
            req.end();
        });
    }

    async generateTags(text, batchSize = 6, totalBatches = 5) {
        try {
            const model = await this.ensureTextModelSelected();
            console.log('Generating tags with model:', model);

            const prompt = `Generate ${batchSize * totalBatches} unique, relevant tags for the following text. Each tag should be a single word or short phrase. Separate tags with commas: ${text}`;

            const response = await fetch(`${this.getBaseUrl()}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    prompt: prompt,
                    stream: false,
                    options: {
                        temperature: 0.7,
                        top_p: 0.9,
                        top_k: 50
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to generate tags: ${errorText}`);
            }

            const data = await response.json();
            const tags = data.response
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag.length > 0);

            // Group tags into batches
            const batches = [];
            for (let i = 0; i < tags.length; i += batchSize) {
                batches.push(tags.slice(i, i + batchSize));
            }

            return batches.slice(0, totalBatches);
        } catch (error) {
            console.error('Error in generateTags:', error);
            throw error;
        }
    }

    async refinePrompt(prompt, style) {
        try {
            const model = await this.ensureTextModelSelected();
            console.log('Refining prompt with model:', model);

            const systemInstruction = `You are a specialized AI trained to enhance and refine prompts for image generation. Your task is to take an existing prompt and make it more detailed and specific, while maintaining its original intent and style.

Follow these guidelines:
1. Analyze the original prompt carefully
2. Add more specific visual details and descriptive elements
3. Enhance atmosphere and mood descriptions
4. Include additional relevant artistic elements
5. Maintain the original style and theme
6. Keep the language natural and flowing
7. DO NOT add any style tags, quality terms, or technical specifications at the end
8. DO NOT drastically change the original concept
9. ONLY return the enhanced prompt text, nothing else
10. DO NOT include any explanations or comments about the changes made
11. DO NOT include phrases like "Original prompt:" or "Enhanced prompt:"

Example input: "A castle in the mountains"
Example output: "A majestic medieval castle perched atop craggy mountain peaks, its ancient stone towers reaching into misty clouds, while snow-capped peaks stretch endlessly into the distance, the fortress walls weathered by centuries of alpine winds"`;

            const requestBody = {
                model: model,
                prompt: systemInstruction + "\n\nEnhance this prompt: " + prompt,
                stream: false,
                options: {
                    temperature: style?.modelParameters?.temperature || 0.75,
                    top_p: style?.modelParameters?.top_p || 0.9,
                    top_k: style?.modelParameters?.top_k || 50,
                    repeat_penalty: style?.modelParameters?.repeat_penalty || 1.2
                }
            };

            console.log('Making refine request with body:', requestBody);
            
            const response = await fetch(`${this.getBaseUrl()}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to refine prompt: ${errorText}`);
            }

            const data = await response.json();
            return data.response.trim();
        } catch (error) {
            console.error('Error in refinePrompt:', error);
            throw error;
        }
    }
}

module.exports = new OllamaManager(); 
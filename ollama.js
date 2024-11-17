const https = require('https');
const http = require('http');
const { exec } = require('child_process');
const { BrowserWindow } = require('electron');
const configManager = require('./config-manager');

class OllamaManager {
    constructor() {
        this.baseUrl = 'http://localhost:11434';
        this.isConnected = false;
        
        const savedConfig = configManager.getConfig();
        this.currentModel = savedConfig.currentModel;
        this.visionModel = savedConfig.visionModel;
        
        this.availableModels = [];
        this.lastError = null;
        this.startingServer = false;
    }

    makeRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const requestOptions = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.pathname,
                method: options.method || 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            };

            console.log('Making request with options:', requestOptions);

            const req = http.request(requestOptions, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const jsonData = data ? JSON.parse(data) : {};
                        resolve({
                            ok: res.statusCode === 200,
                            status: res.statusCode,
                            json: () => Promise.resolve(jsonData)
                        });
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', (error) => {
                console.error('Request error:', error);
                reject(error);
            });

            if (options.body) {
                const bodyData = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
                req.write(bodyData);
            }

            req.end();
        });
    }

    async checkConnection() {
        console.log('Checking Ollama connection...');
        try {
            // Sprawdź najpierw /api/version
            const versionResponse = await this.makeRequest(`${this.baseUrl}/api/version`);
            console.log('Version check response:', versionResponse.status);
            
            if (!versionResponse.ok) {
                this.isConnected = false;
                throw new Error('Could not get Ollama version');
            }
            
            const versionData = await versionResponse.json();
            console.log('Ollama version:', versionData);
            
            // Jeśli version działa, sprawdź /api/tags
            const tagsResponse = await this.makeRequest(`${this.baseUrl}/api/tags`);
            console.log('Tags check response:', tagsResponse.status);
            
            if (tagsResponse.ok) {
                const data = await tagsResponse.json();
                console.log('Available models:', data);
                
                this.isConnected = true;
                this.availableModels = data.models || [];
                this.lastError = null;

                // Sprawdź czy aktualnie wybrane modele są dostępne
                if (this.currentModel) {
                    const isCurrentModelAvailable = await this.checkModelAvailability(this.currentModel);
                    if (!isCurrentModelAvailable) {
                        this.currentModel = null;
                    }
                }

                if (this.visionModel) {
                    const isVisionModelAvailable = await this.checkModelAvailability(this.visionModel);
                    if (!isVisionModelAvailable) {
                        this.visionModel = null;
                    }
                }
                
                return {
                    isConnected: true,
                    currentModel: this.currentModel,
                    visionModel: this.visionModel,
                    availableModels: this.availableModels,
                    error: null
                };
            } else {
                this.isConnected = false;
                throw new Error('Could not get available models');
            }
        } catch (error) {
            console.error('Connection check error:', error);
            this.isConnected = false;
            this.lastError = `Ollama connection error: ${error.message}`;
            
            return {
                isConnected: false,
                currentModel: null,
                visionModel: null,
                availableModels: [],
                error: this.lastError
            };
        }
    }

    async startServer() {
        if (this.startingServer) return;
        this.startingServer = true;

        return new Promise((resolve) => {
            console.log('Starting Ollama server...');
            const ollamaProcess = exec('ollama serve', (error) => {
                if (error) {
                    console.error('Error starting Ollama:', error);
                    this.lastError = 'Failed to start Ollama server';
                    this.startingServer = false;
                    resolve(false);
                }
            });

            // Poczekaj na uruchomienie serwera
            const checkConnection = async () => {
                try {
                    console.log('Checking if server is up...');
                    const response = await this.makeRequest(`${this.baseUrl}/api/tags`);
                    if (response.ok) {
                        console.log('Ollama server started successfully');
                        this.startingServer = false;
                        resolve(true);
                        return;
                    }
                } catch (error) {
                    console.log('Server not ready yet, retrying...');
                }
                setTimeout(checkConnection, 1000);
            };

            checkConnection();
        });
    }

    async listModels() {
        try {
            const response = await this.makeRequest(`${this.baseUrl}/api/tags`);
            const data = await response.json();
            return data.models || [];
        } catch (error) {
            console.error('Error fetching models:', error);
            return [];
        }
    }

    async setModel(modelName) {
        if (modelName) {
            const isAvailable = await this.checkModelAvailability(modelName);
            if (!isAvailable) {
                throw new Error(`Model ${modelName} is not available`);
            }
            this.currentModel = modelName;
            configManager.updateConfig({
                currentModel: this.currentModel,
                visionModel: this.visionModel
            });
        }
    }

    async setVisionModel(modelName) {
        if (modelName) {
            const isAvailable = await this.checkModelAvailability(modelName);
            if (!isAvailable) {
                throw new Error(`Vision model ${modelName} is not available`);
            }
            this.visionModel = modelName;
            configManager.updateConfig({
                currentModel: this.currentModel,
                visionModel: this.visionModel
            });
        }
    }

    getStatus() {
        return {
            isConnected: this.isConnected,
            currentModel: this.currentModel,
            visionModel: this.visionModel,
            availableModels: this.availableModels,
            error: this.lastError
        };
    }

    async generatePrompt(basePrompt, style, customStyle = null) {
        if (!this.isConnected || !this.currentModel) {
            throw new Error(this.lastError || 'Not connected or no model selected');
        }

        const systemPrompt = `You are a prompt generator for Stable Diffusion. Output ONLY the enhanced prompt without any additional text, comments, or formatting.`;

        let stylePrompt;
        if (customStyle) {
            stylePrompt = `Enhance this prompt for Stable Diffusion image generation:
Base prompt: ${basePrompt}
Style description: ${customStyle.description}
Required elements: ${customStyle.fixedTags.join(', ')}

Rules:
1. Return ONLY the enhanced prompt
2. Include all required elements
3. Do not add any explanations or comments
4. Do not use quotes or special formatting
5. Do not start with phrases like "Here's" or "This is"`;
        } else {
            const styleInstructions = {
                realistic: "photorealistic, detailed photography, professional camera settings, natural lighting",
                cinematic: "cinematic shot, movie scene, dramatic lighting, film grain, professional cinematography",
                fantasy: "fantasy art, magical, ethereal, mystical atmosphere, enchanted",
                artistic: "artistic, fine art, masterpiece, professional artwork",
                conceptart: "concept art, professional illustration, digital art, detailed design",
                anime: "anime style, manga art, japanese animation, cel shaded"
            };

            stylePrompt = `Enhance this prompt for Stable Diffusion image generation:
Base prompt: ${basePrompt}
Style: ${styleInstructions[style]}

Rules:
1. Return ONLY the enhanced prompt
2. Include style-specific elements
3. Do not add any explanations or comments
4. Do not use quotes or special formatting
5. Do not start with phrases like "Here's" or "This is"`;
        }

        try {
            const response = await this.makeRequest(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.currentModel,
                    prompt: stylePrompt,
                    system: systemPrompt,
                    temperature: 0.7,
                    stream: false,
                    options: {
                        num_predict: 2000,
                        stop: ["\n", "Here", "The", "Note", "Remember", ":", "\"", "'"]
                    }
                })
            });

            const data = await response.json();
            if (!data.response) {
                throw new Error('Empty response from API');
            }

            // Bardziej agresywne czyszczenie odpowiedzi
            let cleanedResponse = data.response
                .trim()
                // Usuń wszystkie znaki specjalne z początku i końca
                .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9,]+$/g, '')
                // Usuń typowe frazy wprowadzające
                .replace(/^["'\s]+|["'\s]+$/g, '')
                .replace(/^(Here's|I've|This|The|Modified|Enhanced|Let me|Would you).*?[:]/i, '')
                .replace(/\n+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            if (customStyle && customStyle.fixedTags.length > 0) {
                const missingTags = customStyle.fixedTags.filter(tag => 
                    !cleanedResponse.toLowerCase().includes(tag.toLowerCase())
                );
                
                if (missingTags.length > 0) {
                    cleanedResponse += `, ${missingTags.join(', ')}`;
                }
            }

            console.log('Cleaned response:', cleanedResponse);

            if (!cleanedResponse) {
                throw new Error('Failed to generate prompt');
            }

            return cleanedResponse;

        } catch (error) {
            console.error('Error generating prompt:', error);
            if (error.message.includes('Empty response')) {
                throw new Error('Failed to generate prompt. Please try again.');
            }
            throw error;
        }
    }

    async generateTags(text) {
        if (!this.isConnected || !this.currentModel) {
            throw new Error(this.lastError || 'Not connected or no model selected');
        }

        const systemPrompt = `You are a tag suggestion system for Stable Diffusion. Generate relevant tags for image generation. Include artistic styles, technical terms, descriptive elements, and quality modifiers. Output ONLY comma-separated tags, no other text.`;

        const prompt = `Generate a comprehensive list of relevant tags for this prompt. Include style descriptors, quality terms, lighting, camera settings, artistic terms, and mood indicators. Return ONLY single words or short compound terms: ${text}`;

        try {
            const response = await this.makeRequest(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.currentModel,
                    prompt: prompt,
                    system: systemPrompt,
                    stream: false,
                    temperature: 0.8 // Zwiększona kreatywność
                })
            });

            const data = await response.json();
            return data.response
                .trim()
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag && tag.length > 1) // Usunięte ograniczenie spacji
                .filter((tag, index, self) => self.indexOf(tag) === index) // Usuń duplikaty
                .slice(0, 15); // Zwiększona liczba tagów
        } catch (error) {
            console.error('Error generating tags:', error);
            throw error;
        }
    }

    async analyzeImage(imageData) {
        if (!this.isConnected) {
            throw new Error('Not connected to Ollama');
        }

        if (!this.visionModel) {
            throw new Error('No vision model selected. Please configure a vision model first.');
        }

        try {
            console.log('Starting image analysis with model:', this.visionModel);
            
            const response = await this.makeRequest(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                body: {
                    model: this.visionModel,
                    prompt: `Analyze this image and create a Stable Diffusion prompt that could generate a similar image.
                    Follow these rules:
                    1. Focus on main subject, style, lighting, composition, and important details
                    2. Include technical aspects like camera settings, shot type, lighting setup
                    3. Add quality enhancing terms like "highly detailed", "professional", "masterpiece" where appropriate
                    4. Format the response as a comma-separated list of descriptors
                    5. Do not include words like "prompt:", "a photo of", or other meta descriptions
                    6. Do not use quotes or special formatting
                    7. Keep artistic and stylistic terms at the beginning
                    8. Put technical and quality terms at the end
                    9. Do not explain or comment on the image, just provide the prompt
                    10. Keep the response concise but comprehensive`,
                    images: [imageData.split(',')[1]],
                    stream: false
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to analyze image: ${response.status}`);
            }

            const data = await response.json();
            console.log('Raw API response:', data);

            if (typeof data === 'string') {
                try {
                    const parsedData = JSON.parse(data);
                    return parsedData.response || data;
                } catch {
                    return data;
                }
            } else if (data.response) {
                // Czyść odpowiedź z niepotrzebnych elementów
                let cleanedResponse = data.response
                    .replace(/^(a photo of|an image of|prompt:|this is|showing)/gi, '')
                    .replace(/\n+/g, ', ')
                    .replace(/\s+/g, ' ')
                    .replace(/,\s*,/g, ',')
                    .replace(/^\s*,\s*/, '')
                    .replace(/\s*,\s*$/, '')
                    .trim();

                return cleanedResponse;
            } else {
                throw new Error('Invalid response format from API');
            }
        } catch (error) {
            console.error('Error in analyzeImage:', error);
            if (error.message.includes('JSON')) {
                console.error('Raw response causing JSON error:', error);
                throw new Error('Error parsing API response');
            }
            throw error;
        }
    }

    async installModel(modelName) {
        return new Promise((resolve, reject) => {
            const process = exec(`ollama pull ${modelName}`, (error) => {
                if (error) {
                    console.error('Error installing model:', error);
                    reject(error);
                }
                resolve();
            });

            process.stdout.on('data', (data) => {
                // Parse progress from Ollama output
                const match = data.toString().match(/(\d+)%/);
                if (match) {
                    const progress = parseInt(match[1]);
                    BrowserWindow.getAllWindows().forEach(window => {
                        window.webContents.send('install-progress', {
                            progress,
                            status: `Downloading: ${progress}%`
                        });
                    });
                }
            });
        });
    }

    async checkModelAvailability(modelName) {
        try {
            const models = await this.listModels();
            return models.some(model => model.name === modelName);
        } catch (error) {
            console.error('Error checking model availability:', error);
            return false;
        }
    }
}

module.exports = new OllamaManager(); 
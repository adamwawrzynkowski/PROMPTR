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
            host: '127.0.0.1',
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

            console.log('Making request with options:', {
                url,
                method: requestOptions.method,
                headers: requestOptions.headers,
                body: options.body
            });

            const req = http.request(requestOptions, (res) => {
                let rawData = '';
                
                res.on('data', (chunk) => {
                    rawData += chunk;
                });
                
                res.on('end', () => {
                    // Dla odpowiedzi strumieniowych
                    if (url.includes('/api/pull') || url.includes('/api/create')) {
                        const lines = rawData.split('\n').filter(line => line.trim());
                        const responses = lines.map(line => {
                            try {
                                return JSON.parse(line);
                            } catch (e) {
                                console.warn('Could not parse line:', line);
                                return null;
                            }
                        }).filter(Boolean);

                        resolve({
                            ok: res.statusCode === 200,
                            status: res.statusCode,
                            responses: responses
                        });
                    } else {
                        // Dla normalnych odpowiedzi JSON
                        try {
                            const jsonData = rawData ? JSON.parse(rawData) : {};
                            resolve({
                                ok: res.statusCode === 200,
                                status: res.statusCode,
                                json: () => Promise.resolve(jsonData)
                            });
                        } catch (error) {
                            console.error('Error parsing JSON response:', error);
                            console.log('Raw response:', rawData);
                            reject(new Error(`Failed to parse JSON response: ${error.message}`));
                        }
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
            const response = await this.makeRequest(`${this.getBaseUrl()}/api/version`);
            console.log('Ollama connection response:', response);
            
            this.isConnected = response.ok;
            this.lastError = response.ok ? null : 'Failed to connect to Ollama';
            
            return this.isConnected;
        } catch (error) {
            console.error('Ollama connection error:', error);
            this.isConnected = false;
            this.lastError = error.message;
            return false;
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
                    const response = await this.makeRequest(`${this.getBaseUrl()}/api/tags`);
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
            const response = await this.makeRequest(`${this.getBaseUrl()}/api/tags`);
            if (!response.ok) {
                throw new Error('Failed to get installed models');
            }

            const data = await response.json();
            const installedModels = data.models || [];
            
            // Convert installed models to our format with type detection
            return installedModels.map(model => {
                // Extract base model name (without tags)
                const baseName = model.name.split(':')[0];
                
                // Vision models typically have "vision" in their modelfile or name
                // This is a basic heuristic - we can expand this logic as needed
                const isVisionModel = 
                    model.modelfile?.toLowerCase().includes('vision') ||
                    baseName.toLowerCase().includes('llava') ||
                    baseName.toLowerCase().includes('bakllava');

                return {
                    name: model.name,
                    type: isVisionModel ? 'Vision' : 'Text',
                    installed: true
                };
            });
        } catch (error) {
            console.error('Error listing models:', error);
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

    async getStatus() {
        try {
            const models = await this.listModels();
            
            // Get current model info
            const currentModelInfo = models.find(m => 
                m.name === this.currentModel || 
                m.name.split(':')[0] === this.currentModel
            );
            
            // Get vision model info
            const visionModelInfo = models.find(m => 
                m.name === this.visionModel || 
                m.name.split(':')[0] === this.visionModel
            );
            
            // Filter models by type
            const textModels = models.filter(m => m.type === 'Text');
            const visionModels = models.filter(m => m.type === 'Vision');
            
            return {
                isConnected: this.isConnected,
                currentModel: currentModelInfo || null,
                visionModel: visionModelInfo || null,
                availableModels: {
                    text: textModels,
                    vision: visionModels
                },
                error: this.lastError
            };
        } catch (error) {
            console.error('Error getting status:', error);
            return {
                isConnected: false,
                currentModel: null,
                visionModel: null,
                availableModels: {
                    text: [],
                    vision: []
                },
                error: error.message
            };
        }
    }

    async ensureTextModelSelected() {
        console.log('Current model from config:', this.currentModel);
        
        // Get available models
        const models = await this.listModels();
        console.log('Available models:', models);
        
        // Filter for installed text models only
        const installedTextModels = models.filter(m => m.installed && m.type === 'Text');
        console.log('Installed text models:', installedTextModels);
        
        // If current model is not a text model or not installed, select a new one
        const currentModelInfo = models.find(m => m.name === this.currentModel);
        if (!currentModelInfo || !currentModelInfo.installed || currentModelInfo.type !== 'Text') {
            if (installedTextModels.length > 0) {
                const selectedModel = installedTextModels[0].name;
                console.log('Setting text model:', selectedModel);
                await this.setModel(selectedModel);
            } else {
                throw new Error('No text models available. Please install a text model first.');
            }
        }
        
        return this.currentModel;
    }

    async generatePrompt(basePrompt, styleId, customStyle = null) {
        if (!this.isConnected) {
            const connected = await this.checkConnection();
            if (!connected) {
                throw new Error('Not connected to Ollama service');
            }
        }

        // Ensure we have a text model selected
        const model = await this.ensureTextModelSelected();
        console.log('Using text model for prompt generation:', model);

        const systemPrompt = `You are an expert prompt engineer specializing in creating detailed, natural-language prompts for Stable Diffusion image generation. Your goal is to enhance prompts while maintaining a natural, descriptive flow that captures both technical aspects and artistic vision.

Key requirements:
1. Create detailed, descriptive prompts that capture the essence of both the subject and style
2. Include important visual elements: lighting, composition, atmosphere, colors, textures
3. Incorporate style-specific elements naturally into the description
4. Use flowing, natural language that reads well
5. Focus on quality over length - be detailed but avoid unnecessary repetition
6. Structure: Start with main subject/scene, then add style elements, then technical details`;

        let stylePrompt;
        if (customStyle) {
            stylePrompt = `Create a detailed, style-specific prompt for image generation:

Base prompt: ${basePrompt}

Style requirements:
- ${customStyle.description}
- Key elements: ${customStyle.fixedTags.join(', ')}

Guidelines:
1. Start with the main subject/scene from the base prompt
2. Incorporate style elements naturally throughout the description
3. Add specific details about:
   - Visual composition and framing
   - Lighting and shadows
   - Colors and textures
   - Atmosphere and mood
4. Use natural, flowing language
5. Be detailed but avoid unnecessary repetition

Return only the enhanced prompt, no additional text.`;
        } else {
            const styleInstructions = new Map([
                ['realistic', {
                    desc: "ultra-realistic photography with meticulous attention to detail",
                    styleGuide: "Create a photorealistic scene with sharp focus, natural lighting, and precise details that make it indistinguishable from a professional photograph. Include subtle imperfections and real-world physics.",
                    elements: [
                        "8K resolution quality",
                        "photographic lens effects",
                        "natural light behavior",
                        "realistic textures and materials",
                        "subtle imperfections for authenticity"
                    ]
                }],
                ['cinematic', {
                    desc: "epic movie scene with dramatic cinematography",
                    styleGuide: "Frame this as a scene from a blockbuster movie with dramatic camera angles, atmospheric effects, and emotional impact. Think of iconic movie moments with perfect timing and composition.",
                    elements: [
                        "anamorphic lens effects",
                        "movie color grading",
                        "dramatic lighting contrasts",
                        "cinematic aspect ratio",
                        "depth of field focus pulls"
                    ]
                }],
                ['vintage', {
                    desc: "nostalgic retro photography with authentic period characteristics",
                    styleGuide: "Capture the essence of classic photography with period-specific imperfections and techniques. Include film grain, color shifts, and era-appropriate processing artifacts.",
                    elements: [
                        "film grain and noise",
                        "faded color palette",
                        "light leaks and vignetting",
                        "slightly blurred edges",
                        "retro color processing"
                    ]
                }],
                ['artistic', {
                    desc: "expressive fine art with bold artistic interpretation",
                    styleGuide: "Transform the scene into a piece of fine art with visible brushstrokes, artistic liberties in color and form, and emotional expression. Think of master painters' techniques and artistic vision.",
                    elements: [
                        "visible brushstrokes",
                        "exaggerated color palette",
                        "artistic composition rules",
                        "textural paint effects",
                        "creative color harmony"
                    ]
                }],
                ['abstract', {
                    desc: "non-representational art focusing on form and emotion",
                    styleGuide: "Break down the subject into abstract forms, focusing on shapes, colors, and emotional impact rather than literal representation. Create a bold, modern art piece that captures the essence without being literal.",
                    elements: [
                        "geometric abstraction",
                        "non-literal interpretation",
                        "bold color blocks",
                        "simplified forms",
                        "modern art techniques"
                    ]
                }],
                ['poetic', {
                    desc: "dreamy, ethereal atmosphere with soft, romantic qualities",
                    styleGuide: "Create a dreamlike, ethereal scene with soft focus, glowing lights, and romantic atmosphere. Think of fairy tales and romantic poetry visualized through a dreamy lens.",
                    elements: [
                        "soft focus effect",
                        "glowing light halos",
                        "pastel color transitions",
                        "ethereal particles",
                        "dreamy blur effects"
                    ]
                }],
                ['anime', {
                    desc: "stylized Japanese anime art with characteristic features",
                    styleGuide: "Render in authentic anime style with characteristic features like large eyes, dynamic poses, and distinctive lighting. Include typical anime elements and artistic techniques.",
                    elements: [
                        "large expressive eyes",
                        "clean cel shading",
                        "sharp line art",
                        "anime-specific coloring",
                        "dynamic action lines"
                    ]
                }],
                ['cartoon', {
                    desc: "bold, stylized cartoon with exaggerated features",
                    styleGuide: "Create a vibrant cartoon with bold outlines, exaggerated features, and simplified forms. Think of professional animation with clean lines and striking designs.",
                    elements: [
                        "thick bold outlines",
                        "exaggerated proportions",
                        "flat color areas",
                        "simplified shadows",
                        "cartoon physics"
                    ]
                }],
                ['cute', {
                    desc: "adorable kawaii style with charming, playful elements",
                    styleGuide: "Make everything extremely cute and adorable with rounded forms, big eyes, and kawaii aesthetics. Include typical cute elements like sparkles and pastel colors.",
                    elements: [
                        "super deformed proportions",
                        "huge cute eyes",
                        "pastel color scheme",
                        "kawaii decorations",
                        "rounded cute shapes"
                    ]
                }],
                ['scifi', {
                    desc: "futuristic science fiction with advanced technology",
                    styleGuide: "Create a high-tech science fiction scene with advanced technology, futuristic lighting, and innovative designs. Include sci-fi elements like holographics and energy effects.",
                    elements: [
                        "holographic effects",
                        "neon lighting",
                        "advanced tech details",
                        "energy field effects",
                        "futuristic materials"
                    ]
                }]
            ]);

            if (!styleInstructions.has(styleId)) {
                throw new Error(`Unknown style: ${styleId}`);
            }

            const style = styleInstructions.get(styleId);
            stylePrompt = `Create a highly stylized prompt that perfectly matches this specific style:

Base prompt: ${basePrompt}

Style: ${style.desc}
Style Guide: ${style.styleGuide}

Required style elements to incorporate:
${style.elements.map(e => '- ' + e).join('\n')}

Guidelines:
1. Transform the base prompt completely to match this specific style
2. Include ALL the listed style elements naturally in the description
3. Focus heavily on the unique aspects of this style
4. Avoid generic descriptions - make it distinctly ${styleId}
5. Be detailed and specific to this style

Return only the enhanced prompt, no additional text.`;
        }

        try {
            console.log('Generating prompt for style:', styleId || 'custom');
            
            const response = await this.makeRequest(`${this.getBaseUrl()}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: model,
                    prompt: stylePrompt,
                    system: systemPrompt,
                    stream: false,
                    options: {
                        temperature: 0.7
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to generate prompt: ${response.status}`);
            }

            const data = await response.json();
            let prompt = data.response || '';
            
            // Clean up the prompt
            prompt = prompt.trim()
                .replace(/^["']|["']$/g, '') // Remove quotes
                .replace(/\\n/g, ' ') // Replace newlines with spaces
                .replace(/\s+/g, ' '); // Normalize spaces
            
            return prompt;
        } catch (error) {
            console.error('Error generating prompt:', error);
            throw error;
        }
    }

    async generateTags(text) {
        if (!text || text.trim().length === 0) {
            throw new Error('No text provided for tag generation');
        }

        if (!this.isConnected) {
            const connected = await this.checkConnection();
            if (!connected) {
                throw new Error('Not connected to Ollama service');
            }
        }

        // Ensure we have a text model selected
        const model = await this.ensureTextModelSelected();
        console.log('Using text model for tag generation:', model);

        try {
            // Anuluj poprzednie generowanie jeśli istnieje
            await this.cancelCurrentGeneration();

            const prompt = `Generate relevant tags for this text. Return only tags separated by commas, without explanations: "${text}"`;
            
            console.log('Making tag generation request with model:', model);
            
            // Make the request to the correct Ollama API endpoint
            const response = await this.makeRequest(`${this.getBaseUrl()}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: model,
                    prompt: prompt,
                    system: "You are a tag generator. Return ONLY tags separated by commas, without any additional text or explanations.",
                    stream: false,
                    options: {
                        temperature: 0.7
                    }
                })
            });

            if (!response.ok) {
                console.error('Failed to generate tags. Response:', response);
                throw new Error(`Failed to generate tags: ${response.status}`);
            }

            const data = await response.json();
            console.log('Raw API response:', data);

            const responseText = data.response || '';
            console.log('Response text:', responseText);
            
            if (!responseText.trim()) {
                throw new Error('Empty response from API');
            }

            // Wyczyść i przetwórz tagi
            const cleanedResponse = responseText
                .trim()
                .replace(/^(Here are|The tags|Tags:|Suggested tags:|Generated tags:)/i, '')
                .replace(/["'`]/g, '')
                .replace(/\.$/, '')
                .replace(/^["'\s]+|["'\s]+$/g, '')
                .replace(/\n+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            console.log('Cleaned response:', cleanedResponse);

            const tags = cleanedResponse
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag.length > 0 && !tag.includes('\n'));

            if (tags.length === 0) {
                throw new Error('No valid tags generated');
            }

            console.log('Final generated tags:', tags);
            return tags;

        } catch (error) {
            console.error('Error in generateTags:', error);
            throw error;
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
                        reject(new Error(`Failed to download: ${response.statusCode}`));
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

    // Zaktualizuj metodę pullModel
    async pullModel(modelName, progressCallback) {
        try {
            const response = await this.makeRequest(`${this.getBaseUrl()}/api/pull`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: modelName,
                    stream: true
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to pull model: ${response.status}`);
            }

            // Przetwarzaj odpowiedzi strumieniowe
            for (const data of response.responses) {
                if (data.total && data.completed) {
                    const progress = (data.completed / data.total) * 100;
                    if (progressCallback) {
                        progressCallback(progress);
                    }
                }
            }

            return true;
        } catch (error) {
            console.error('Error pulling model:', error);
            throw error;
        }
    }
}

module.exports = new OllamaManager(); 
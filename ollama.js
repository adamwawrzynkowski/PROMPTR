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
            
            // Pobierz listę dostępnych modeli
            const availableModels = [
                { name: 'llama2', type: 'Text' },
                { name: 'llama2:13b', type: 'Text' },
                { name: 'llama2:70b', type: 'Text' },
                { name: 'codellama', type: 'Text' },
                { name: 'mistral', type: 'Text' },
                { name: 'mixtral', type: 'Text' },
                { name: 'neural-chat', type: 'Text' },
                { name: 'starling-lm', type: 'Text' },
                { name: 'llava', type: 'Vision' },
                { name: 'bakllava', type: 'Vision' }
            ];

            // Oznacz modele jako zainstalowane
            return availableModels.map(model => ({
                ...model,
                installed: installedModels.some(installed => 
                    installed.name === model.name || 
                    installed.name.split(':')[0] === model.name
                )
            }));
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

    getStatus() {
        return {
            isConnected: this.isConnected,
            currentModel: this.currentModel,
            visionModel: this.visionModel,
            availableModels: this.availableModels,
            error: this.lastError
        };
    }

    async generatePrompt(basePrompt, styleId, customStyle = null) {
        if (!this.isConnected || !this.currentModel) {
            throw new Error(this.lastError || 'Not connected or no model selected');
        }

        const systemPrompt = `You are an expert prompt engineer specializing in creating detailed, natural-language prompts for Stable Diffusion image generation. Your goal is to enhance prompts while maintaining a natural, descriptive flow that captures both technical aspects and artistic vision. Focus on:

1. Natural language descriptions that flow well
2. Specific, vivid details about the subject, setting, and atmosphere
3. Technical aspects like lighting, composition, and camera settings
4. Artistic elements like style, mood, and aesthetic qualities
5. Proper emphasis on important elements using natural language modifiers

Always maintain readability and avoid comma-spam or keyword stuffing.`;

        let stylePrompt;
        if (customStyle) {
            stylePrompt = `Enhance this prompt into a detailed, natural description for Stable Diffusion image generation:

Base prompt: ${basePrompt}

Style requirements:
- Style description: ${customStyle.description}
- Required elements: ${customStyle.fixedTags.join(', ')}

Guidelines:
1. Create a flowing, natural description that reads like a professional photographer or artist's vision
2. Incorporate all required style elements seamlessly into the description
3. Add specific details about lighting, atmosphere, and technical aspects
4. Maintain a balance between artistic vision and technical precision
5. Use natural language rather than just comma-separated keywords
6. Keep the description focused and coherent

Return only the enhanced prompt without any additional text or formatting.`;
        } else {
            const styleInstructions = new Map([
                ['realistic', "photorealistic quality with natural lighting, precise details, and professional photography techniques. Focus on authentic representation with careful attention to textures, materials, and environmental context."],
                ['cinematic', "cinematic composition with dramatic lighting, professional cinematography techniques, and movie-like atmosphere. Consider depth of field, camera angles, and scene composition."],
                ['vintage', "authentic vintage aesthetics with period-appropriate styling, classic photography techniques, and nostalgic elements. Include film grain, color treatment, and era-specific details."],
                ['artistic', "fine art qualities with emphasis on artistic composition, creative expression, and masterful technique. Consider brush strokes, artistic medium, and compositional balance."],
                ['abstract', "abstract artistic interpretation focusing on form, color, and composition. Emphasize geometric elements, non-representational aspects, and modern artistic techniques."],
                ['poetic', "ethereal and romantic qualities with dreamy atmosphere and evocative mood. Focus on soft lighting, delicate details, and emotional resonance."],
                ['anime', "high-quality anime artistry with characteristic style elements, dynamic composition, and distinctive lighting. Include cel-shading, characteristic anime features, and stylistic choices."],
                ['cartoon', "professional cartoon styling with bold design elements, distinctive character features, and vibrant presentation. Focus on clean lines, expressive elements, and stylized details."],
                ['cute', "adorable and charming qualities with soft, appealing elements and warm atmosphere. Include kawaii-style features, gentle colors, and endearing details."],
                ['scifi', "futuristic science fiction elements with advanced technological details and innovative design. Focus on high-tech aesthetics, future-forward concepts, and scientific accuracy."]
            ]);

            if (!styleInstructions.has(styleId)) {
                throw new Error(`Unknown style: ${styleId}`);
            }

            stylePrompt = `Enhance this prompt into a detailed, natural description for Stable Diffusion image generation:

Base prompt: ${basePrompt}

Style focus: ${styleInstructions.get(styleId)}

Guidelines:
1. Create a flowing, natural description that reads like a professional artist's vision
2. Incorporate the style elements seamlessly into the description
3. Add specific details about lighting, atmosphere, and technical aspects
4. Maintain a balance between artistic vision and technical precision
5. Use natural language rather than just comma-separated keywords
6. Keep the description focused and coherent

Return only the enhanced prompt without any additional text or formatting.`;
        }

        try {
            console.log('Generating prompt for style:', styleId);
            console.log('Using prompt template:', stylePrompt);

            // Anuluj poprzednie generowanie jeśli istnieje
            await this.cancelCurrentGeneration();

            // Zapisz bieżące generowanie
            this.currentGeneration = this.makeRequest(`${this.getBaseUrl()}/api/generate`, {
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

            const response = await this.currentGeneration;
            this.currentGeneration = null;

            if (!response.ok) {
                throw new Error('Failed to generate prompt');
            }

            const data = await response.json();
            const responseText = data.response || '';

            if (!responseText.trim()) {
                throw new Error('Empty response from API');
            }

            // Bardziej agresywne czyszczenie odpowiedzi
            let cleanedResponse = responseText
                .trim()
                .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9,]+$/g, '')
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

            console.log('Generated prompt:', cleanedResponse);

            if (!cleanedResponse) {
                throw new Error('Failed to generate prompt');
            }

            return cleanedResponse;

        } catch (error) {
            console.error('Error generating prompt:', error);
            this.currentGeneration = null;
            throw error;
        }
    }

    async generateTags(text) {
        if (!text || text.trim().length === 0) {
            throw new Error('No text provided for tag generation');
        }

        try {
            // Anuluj poprzednie generowanie jeśli istnieje
            await this.cancelCurrentGeneration();

            const prompt = `Generate relevant tags for this text. Return only tags separated by commas, without explanations: "${text}"`;
            
            // Zapisz bieżące generowanie
            this.currentGeneration = this.makeRequest(`${this.getBaseUrl()}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.currentModel,
                    prompt: prompt,
                    system: "You are a tag generator. Return ONLY tags separated by commas, without any additional text or explanations.",
                    stream: false,
                    options: {
                        temperature: 0.7,
                        num_predict: 100,
                        stop: ["\n", ".", "Here", "Tags"],
                    }
                })
            });

            const response = await this.currentGeneration;
            this.currentGeneration = null;

            if (!response.ok) {
                throw new Error('Failed to generate tags');
            }

            const data = await response.json();
            const responseText = data.response || '';
            
            if (!responseText.trim()) {
                throw new Error('Empty response from API');
            }

            // Wyczyść i przetwórz tagi
            const cleanedResponse = responseText
                .trim()
                .replace(/^(Here are|The tags|Tags:|Suggested tags:|Generated tags:)/i, '')
                .replace(/["'`]/g, '')
                .replace(/\.$/, '');

            const tags = cleanedResponse
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag.length > 0 && !tag.includes('\n'));

            if (tags.length === 0) {
                throw new Error('No valid tags generated');
            }

            console.log('Generated tags:', tags);
            return tags;

        } catch (error) {
            console.error('Error in generateTags:', error);
            this.currentGeneration = null;
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
            os.remove(safetensors_path)
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
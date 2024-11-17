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
            // Mapowanie styleId na instrukcje stylu
            const styleInstructions = new Map([
                ['realistic', "photorealistic, detailed photography, professional camera settings, natural lighting"],
                ['cinematic', "cinematic shot, movie scene, dramatic lighting, film grain, professional cinematography"],
                ['vintage', "vintage style, retro aesthetics, old photograph, film photography, nostalgic"],
                ['artistic', "artistic, fine art, masterpiece, professional artwork, expressive"],
                ['abstract', "abstract art, non-representational, geometric shapes, modern art, contemporary"],
                ['poetic', "ethereal, dreamy, romantic, soft lighting, atmospheric, moody"],
                ['anime', "anime style, manga art, japanese animation, cel shaded"],
                ['cartoon', "cartoon style, stylized art, bold lines, vibrant colors"],
                ['cute', "kawaii style, adorable, chibi, pastel colors, charming"],
                ['scifi', "science fiction, futuristic, cyberpunk, high tech, advanced technology"]
            ]);

            if (!styleInstructions.has(styleId)) {
                console.error('Unknown style ID:', styleId);
                throw new Error(`Unknown style: ${styleId}`);
            }

            stylePrompt = `Enhance this prompt for Stable Diffusion image generation:
Base prompt: ${basePrompt}
Style: ${styleInstructions.get(styleId)}

Rules:
1. Return ONLY the enhanced prompt
2. Include style-specific elements
3. Do not add any explanations or comments
4. Do not use quotes or special formatting
5. Do not start with phrases like "Here's" or "This is"`;
        }

        try {
            console.log('Generating prompt for style:', styleId);
            console.log('Using prompt template:', stylePrompt);

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

            console.log('Generated prompt:', cleanedResponse);

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
            throw new Error('Not connected or no model selected');
        }

        try {
            console.log('Generating tags using model:', this.currentModel);
            const response = await this.makeRequest(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                body: JSON.stringify({
                    model: this.currentModel,
                    prompt: `Generate additional descriptive tags for image generation that are NOT already present in the input text. Return only new, unique tags as a comma-separated list.

Input text: "${text}"

Rules:
1. Return ONLY new tags that are NOT in the input text
2. Separate tags with commas
3. Include style descriptors, artistic techniques, lighting, mood, and composition
4. Focus on enhancing the visual description
5. Return at least 10-15 relevant tags
6. Do not repeat words from the input
7. Do not include explanations or metadata`,
                    stream: false,
                    options: {
                        temperature: 0.7,
                        stop: ["\n", "Here", "Tags", "The", "Note", "Remember", ":", "\"", "'"]
                    }
                })
            });

            if (!response.ok) {
                throw new Error('Failed to generate tags');
            }

            const data = await response.json();
            console.log('Raw API response:', data);

            if (!data.response) {
                throw new Error('Empty response from API');
            }

            // Pobierz słowa z oryginalnego tekstu
            const inputWords = new Set(text.toLowerCase().split(/[,\s]+/).map(word => word.trim()));

            // Czyść i przetwórz odpowiedź
            const tags = data.response
                .trim()
                .replace(/^(tags:|here are the tags:|extracted tags:|key tags:)/i, '')
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag.length > 0 && tag.length < 50)
                .filter(tag => !inputWords.has(tag.toLowerCase())) // Usuń tagi które są w oryginalnym tekście
                .filter(Boolean) // usuwa puste stringi
                .filter((tag, index, self) => self.indexOf(tag) === index); // usuń duplikaty

            console.log('Processed tags:', tags);
            return tags;
        } catch (error) {
            console.error('Error generating tags:', error);
            throw error;
        }
    }

    async analyzeImage(imageData, systemPrompt, analysisType = 'content') {
        try {
            if (!this.isConnected || !this.visionModel) {
                throw new Error('Not connected or no vision model selected');
            }

            let base64Image = imageData;
            if (imageData.startsWith('data:')) {
                base64Image = imageData.split(',')[1];
            }

            // Dostosuj prompt i parametry w zależności od typu analizy
            let prompt, numPredict;
            if (analysisType === 'style') {
                prompt = `Focus ONLY on the artistic style of this image. Describe:
- Art style (realistic, cartoon, anime, etc.)
- Color palette and mood
- Lighting and composition
- Artistic techniques used
Keep it brief and concise. Do not describe the content or subjects in the image.`;
                numPredict = 300; // Krótsza odpowiedź dla stylu
            } else if (analysisType === 'detailed') {
                prompt = systemPrompt || "Provide a detailed description of everything you see in this image.";
                numPredict = 1000; // Dłuższa odpowiedź dla szczegółowego opisu
            } else {
                prompt = "Briefly describe what you see in this image. Focus on the main elements and overall composition.";
                numPredict = 300; // Krótsza odpowiedź dla standardowej analizy
            }

            const response = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.visionModel,
                    prompt: prompt,
                    images: [base64Image],
                    stream: false,
                    options: {
                        temperature: 0.7,
                        num_predict: numPredict,
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Ollama API error response:', errorText);
                throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
            }

            const data = await response.json();
            if (!data.response) {
                throw new Error('Empty response from Ollama API');
            }

            // Wyczyść i sformatuj odpowiedź
            let cleanedResponse = data.response
                .trim()
                .replace(/^(Here's|I see|In this image|The image shows)/i, '')
                .trim();

            return cleanedResponse;
        } catch (error) {
            console.error('Error in analyzeImage:', error);
            throw error;
        }
    }

    async installModel(modelName, progressCallback) {
        try {
            const response = await fetch(`${this.baseUrl}/api/pull`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: modelName }),
            });

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
        } catch (error) {
            console.error('Error installing model:', error);
            throw error;
        }
    }

    async deleteModel(modelName) {
        try {
            const response = await fetch(`${this.baseUrl}/api/delete`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: modelName }),
            });

            if (!response.ok) {
                throw new Error(`Failed to delete model: ${response.statusText}`);
            }

            return true;
        } catch (error) {
            console.error('Error deleting model:', error);
            throw error;
        }
    }

    async checkModelAvailability(modelName) {
        try {
            // Pobierz listę zainstalowanych modeli
            const response = await this.makeRequest(`${this.baseUrl}/api/tags`);
            if (!response.ok) {
                throw new Error('Failed to get installed models');
            }

            const data = await response.json();
            const installedModels = data.models || [];
            
            // Sprawdź czy model jest na liście zainstalowanych
            const isInstalled = installedModels.some(model => 
                model.name === modelName || 
                model.name.split(':')[0] === modelName
            );
            
            console.log(`Model ${modelName} installed:`, isInstalled);
            return isInstalled;
        } catch (error) {
            console.error('Error checking model availability:', error);
            return false;
        }
    }

    async detectAndTranslateText(text) {
        try {
            // Najpierw sprawdź czy tekst wygląda na angielski
            const englishWordPattern = /^[a-zA-Z\s,\.!?\-'"]+$/;
            if (englishWordPattern.test(text)) {
                console.log('Text appears to be English, skipping translation');
                return {
                    isTranslated: false,
                    originalText: text,
                    translatedText: text,
                    originalLanguage: 'en'
                };
            }

            // Użyj Google Translate API tylko dla tekstów, które nie wyglądają na angielskie
            const response = await fetch('https://translation.googleapis.com/language/translate/v2/detect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    q: text,
                    key: 'AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw'
                })
            });

            if (!response.ok) {
                throw new Error('Language detection failed');
            }

            const detectionResult = await response.json();
            const detectedLanguage = detectionResult.data.detections[0][0].language;
            console.log('Detected language:', detectedLanguage);

            // Jeśli wykryto angielski, nie tłumacz
            if (detectedLanguage === 'en') {
                return {
                    isTranslated: false,
                    originalText: text,
                    translatedText: text,
                    originalLanguage: 'en'
                };
            }

            // Tłumacz tylko jeśli to na pewno nie jest angielski
            const translateResponse = await fetch('https://translation.googleapis.com/language/translate/v2', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    q: text,
                    source: detectedLanguage,
                    target: 'en',
                    key: 'AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw'
                })
            });

            if (!translateResponse.ok) {
                throw new Error('Translation failed');
            }

            const translationResult = await translateResponse.json();
            return {
                isTranslated: true,
                originalText: text,
                translatedText: translationResult.data.translations[0].translatedText,
                originalLanguage: detectedLanguage
            };
        } catch (error) {
            console.error('Error in detectAndTranslateText:', error);
            
            // Fallback do Ollama tylko jeśli tekst nie wygląda na angielski
            try {
                const englishWordPattern = /^[a-zA-Z\s,\.!?\-'"]+$/;
                if (englishWordPattern.test(text)) {
                    return {
                        isTranslated: false,
                        originalText: text,
                        translatedText: text,
                        originalLanguage: 'en'
                    };
                }

                if (!this.isConnected || !this.currentModel) {
                    throw new Error('Ollama is not connected');
                }

                // Najpierw wykryj język
                const languageResponse = await this.makeRequest(`${this.baseUrl}/api/generate`, {
                    method: 'POST',
                    body: JSON.stringify({
                        model: this.currentModel,
                        prompt: `Detect the language of this text and respond ONLY with language code (en, pl, de, etc): "${text}"`,
                        stream: false,
                        options: {
                            temperature: 0.1,
                            stop: ["\n", "Language", "The", "Code"]
                        }
                    })
                });

                const languageData = await languageResponse.json();
                const detectedLanguage = languageData.response.trim().toLowerCase();

                // Jeśli to nie angielski, przetłumacz
                if (detectedLanguage !== 'en') {
                    const translationResponse = await this.makeRequest(`${this.baseUrl}/api/generate`, {
                        method: 'POST',
                        body: JSON.stringify({
                            model: this.currentModel,
                            prompt: `Translate this text to English. Return ONLY the translation without any additional text:
"${text}"`,
                            stream: false,
                            options: {
                                temperature: 0.3,
                                stop: ["\n", "Translation", "Here"]
                            }
                        })
                    });

                    const translationData = await translationResponse.json();
                    return {
                        isTranslated: true,
                        originalText: text,
                        translatedText: translationData.response.trim(),
                        originalLanguage: detectedLanguage
                    };
                }

                return {
                    isTranslated: false,
                    originalText: text,
                    translatedText: text,
                    originalLanguage: 'en'
                };
            } catch (fallbackError) {
                console.error('Fallback translation error:', fallbackError);
                throw new Error('Translation failed with both services');
            }
        }
    }
}

module.exports = new OllamaManager(); 
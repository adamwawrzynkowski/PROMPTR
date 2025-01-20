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
                        const response = await this.makeRequest('/api/tags');
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
            console.log(`Making request to: ${this.getBaseUrl()}${url}`);
            console.log('With options:', options);

            const response = await fetch(`${this.getBaseUrl()}${url}`, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...(options.headers || {})
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }

            const data = await response.json();
            console.log('Response data:', data);
            return data;
        } catch (error) {
            console.error('Request failed:', error);
            throw error;
        }
    }

    async generateText(systemPrompt, userPrompt, config = { maxTokens: 1024 }) {
        try {
            const model = await this.ensureTextModelSelected();
            console.log('Generating text with model:', model);
            console.log('Using config:', config);

            const requestBody = {
                model: model,
                prompt: `${systemPrompt}\n\nUser: ${userPrompt}\nAssistant: IMPORTANT: Provide a detailed, descriptive response between ${config.minLength} and ${config.maxLength} words. Start directly with the descriptive text, no prefixes or explanations needed.\n\nExample of good response format:\nMajestic mountain landscape at sunset, golden light illuminating snow-capped peaks, dense pine forest in the valley below\n\nYour response:`,
                stream: false,
                options: {
                    temperature: 0.7,
                    top_k: 40,
                    top_p: 0.9,
                    num_predict: config.maxTokens || 1024,
                    stop: ["\n", "User:", "Assistant:", "System:"]
                }
            };

            console.log('Making generate request with body:', requestBody);
            
            const response = await this.makeRequest('/api/generate', {
                method: 'POST',
                body: JSON.stringify(requestBody)
            });

            if (!response || !response.response) {
                console.error('Invalid response format:', response);
                throw new Error('Empty or invalid response from model');
            }

            let responseText = response.response.trim();
            
            // Basic cleanup of obvious prefixes and quotes
            responseText = responseText
                .replace(/^["'\s]*(Here is|This is|I have created|Let me|The following|As requested).*?:/is, '')
                .replace(/["']/g, '')
                .trim();

            // Clean up any potential JSON formatting issues
            if (responseText.startsWith('"') && responseText.endsWith('"')) {
                responseText = responseText.slice(1, -1);
            }
            
            // Unescape any escaped characters
            responseText = responseText.replace(/\\n/g, '\n')
                                    .replace(/\\"/g, '"')
                                    .replace(/\\'/g, "'")
                                    .replace(/\\\\/g, '\\');

            if (!responseText) {
                throw new Error('Empty response text from model');
            }

            console.log('Generated response:', responseText);
            return responseText;

        } catch (error) {
            console.error('Error generating text:', error);
            throw error;
        }
    }

    cleanupGeneratedText(text) {
        if (!text) return '';
        
        let cleanedText = text.trim();

        // Remove only the most common prefixes if they appear at the start
        const startPrefixes = [
            'Here is', 'This is', 'Create a', 'Generate a',
            'I have created', 'Let me', 'The following'
        ];

        for (const prefix of startPrefixes) {
            if (cleanedText.toLowerCase().startsWith(prefix.toLowerCase())) {
                cleanedText = cleanedText.substring(prefix.length).trim();
                break; // Only remove one prefix
            }
        }

        // Remove any remaining quotes and normalize spacing
        cleanedText = cleanedText
            .replace(/["'`]/g, '') // Remove quotes
            .replace(/\s+/g, ' ')  // Normalize spaces
            .replace(/^\s+|\s+$/g, '') // Trim ends
            .replace(/\s*,\s*/g, ', ') // Fix comma spacing
            .replace(/\s*\.\s*/g, '. ') // Fix period spacing
            .replace(/\s+([,\.])/g, '$1') // Remove spaces before punctuation
            .replace(/([,\.])\s+/g, '$1 '); // Single space after punctuation

        // Remove dialogue markers if they appear at the start
        cleanedText = cleanedText
            .replace(/^Assistant:?\s*/i, '')
            .replace(/^User:?\s*/i, '')
            .replace(/^System:?\s*/i, '');

        // Ensure first letter is capitalized and text ends with punctuation
        cleanedText = cleanedText.charAt(0).toUpperCase() + cleanedText.slice(1);
        if (!cleanedText.match(/[.!?]$/)) {
            cleanedText += '.';
        }

        return cleanedText;
    }

    async getSystemPrompt(style, promptType = 'standard') {
        console.log('Getting system prompt for type:', promptType);
        
        // Define length limits based on prompt type
        const config = {
            simple: { minLength: 20, maxLength: 300, maxTokens: 512 },
            standard: { minLength: 100, maxLength: 900, maxTokens: 1024 },
            detailed: { minLength: 300, maxLength: 2000, maxTokens: 2048 }
        };

        // Get the configuration for the requested prompt type
        const promptConfig = config[promptType] || config.standard;
        console.log('Using prompt config:', promptConfig);

        // Base system prompt
        let systemPrompt = `You are an AI prompt engineer specializing in creating high-quality, creative prompts. 
Your task is to enhance the given prompt while following these strict rules:

1. Response length: Keep the response between ${promptConfig.minLength} and ${promptConfig.maxLength} words.
2. Marked words:
   - REQUIRED WORDS: When specified, you MUST include ALL required words at least once.
   - FORBIDDEN WORDS: When specified, you ABSOLUTELY MUST NOT use ANY forbidden words or their variations.
   This is the most important rule - NEVER use forbidden words under any circumstances.
3. Style: Maintain the specified style's characteristics while enhancing the prompt.

Format your response as a single, well-structured paragraph.`;

        if (style?.systemPrompt) {
            systemPrompt += `\n\nStyle-specific instructions: ${style.systemPrompt}`;
        }

        return { prompt: systemPrompt, config: promptConfig };
    }

    async generatePrompt({ basePrompt, styleId, style, promptType = 'standard', markedWords = { positive: [], negative: [] } }) {
        try {
            await this.ensureTextModelSelected();

            // Get system prompt based on style
            const { prompt: systemPrompt, config } = await this.getSystemPrompt(style, promptType);

            // Function to replace negative words with neutral alternatives
            const replaceNegativeWords = (text) => {
                let modifiedText = text;
                const replacements = {
                    'dark': 'bright',
                    'darkness': 'light',
                    'black': 'colorful',
                    'evil': 'peaceful',
                    'death': 'life',
                    'dead': 'alive',
                    'kill': 'nurture',
                    'horror': 'wonder',
                    'scary': 'pleasant',
                    'fear': 'joy',
                    'sad': 'happy',
                    'gloomy': 'cheerful',
                    'nightmare': 'dream',
                    'pain': 'comfort',
                    'suffer': 'thrive',
                    'terrible': 'wonderful',
                    'ugly': 'beautiful',
                    'hate': 'love'
                };

                markedWords.negative.forEach(word => {
                    const replacement = replacements[word.toLowerCase()] || 'pleasant';
                    const regex = new RegExp(`\\b${word}\\b`, 'gi');
                    modifiedText = modifiedText.replace(regex, replacement);
                });

                return modifiedText;
            };

            // First replace any negative words in the base prompt with positive alternatives
            let enhancedBasePrompt = replaceNegativeWords(basePrompt);

            // Ensure positive words are included in base prompt
            if (markedWords.positive.length > 0) {
                const positivePrefix = markedWords.positive.join(', ') + ' in a scene showing ';
                enhancedBasePrompt = positivePrefix + enhancedBasePrompt.charAt(0).toLowerCase() + enhancedBasePrompt.slice(1);
            }

            // Prepare user prompt with marked words - no mention of negative words
            let userPrompt = `Enhance this prompt: "${enhancedBasePrompt}". 
Your response MUST be between ${config.minLength} and ${config.maxLength} words.`;
            
            if (markedWords.positive.length > 0) {
                userPrompt += `\n\n[REQUIRED WORDS]
You MUST include ALL of these EXACT words (at least once each): ${markedWords.positive.join(', ')}
Start your response with these words.`;
            }

            userPrompt += `\n\nBefore providing your response, verify that:
1. It contains ALL required words
2. Length is between ${config.minLength} and ${config.maxLength} words
3. The description is positive and uplifting`;

            // Function to validate and fix text
            const validateAndFix = (text) => {
                let fixedText = text;
                let needsRegeneration = false;

                // First check for negative words
                if (markedWords.negative.length > 0) {
                    const foundNegativeWords = markedWords.negative.filter(word => {
                        const regex = new RegExp(`\\b${word}\\b`, 'i');
                        return regex.test(fixedText);
                    });

                    if (foundNegativeWords.length > 0) {
                        console.warn('Found negative words:', foundNegativeWords);
                        needsRegeneration = true;
                        // Replace negative words with positive alternatives
                        fixedText = replaceNegativeWords(fixedText);
                    }
                }

                // Then ensure all positive words are present
                if (markedWords.positive.length > 0) {
                    const missingWords = markedWords.positive.filter(word => 
                        !fixedText.toLowerCase().includes(word.toLowerCase())
                    );
                    if (missingWords.length > 0) {
                        needsRegeneration = true;
                        // Add missing words at the start
                        const prefix = missingWords.join(', ') + ' in a scene with ';
                        fixedText = prefix + fixedText.charAt(0).toLowerCase() + fixedText.slice(1);
                    }
                }

                return { text: fixedText, needsRegeneration };
            };

            // Generate text with config
            let generatedText = await this.generateText(systemPrompt, userPrompt, config);
            let wordCount;
            let attempts = 0;
            const maxAttempts = 3;

            do {
                // Post-process and validate the generated text
                generatedText = this.cleanupGeneratedText(generatedText);
                const { text: fixedText, needsRegeneration } = validateAndFix(generatedText);
                generatedText = fixedText;

                wordCount = generatedText.split(/\s+/).length;
                console.log(`Attempt ${attempts + 1} - Word count: ${wordCount}, Needs regeneration: ${needsRegeneration}`);

                if (needsRegeneration && attempts < maxAttempts) {
                    console.log('Regenerating due to validation issues...');
                    generatedText = await this.generateText(systemPrompt, userPrompt, config);
                } else if (wordCount < config.minLength && attempts < maxAttempts) {
                    console.log(`Prompt too short (${wordCount} words), regenerating...`);
                    userPrompt = `${userPrompt}\nYour previous response was too short. Please provide a more detailed description with EXACTLY ${config.minLength + Math.floor((config.maxLength - config.minLength) / 2)} words.`;
                    generatedText = await this.generateText(systemPrompt, userPrompt, config);
                } else if (wordCount > config.maxLength) {
                    console.log(`Prompt too long (${wordCount} words), truncating...`);
                    const words = generatedText.split(/\s+/);
                    generatedText = words.slice(0, config.maxLength).join(' ');
                    generatedText = generatedText.replace(/[,\s]+$/, '') + '.';
                    const { text: fixedAfterTruncate } = validateAndFix(generatedText);
                    generatedText = fixedAfterTruncate;
                    break;
                } else {
                    break;
                }

                attempts++;
            } while (attempts < maxAttempts);

            // Add style name if not present and style exists
            if (style?.name && !generatedText.toLowerCase().includes(style.name.toLowerCase())) {
                if (generatedText.includes(',')) {
                    const firstComma = generatedText.indexOf(',');
                    generatedText = generatedText.slice(0, firstComma) + ` in ${style.name} style` + generatedText.slice(firstComma);
                } else {
                    generatedText = `${style.name}-style ` + generatedText;
                }
            }

            // Final validation
            const { text: finalText } = validateAndFix(generatedText);
            generatedText = finalText;

            console.log('Original prompt:', basePrompt);
            console.log('Enhanced prompt:', enhancedBasePrompt);
            console.log('Generated prompt:', generatedText);
            console.log('Final word count:', generatedText.split(/\s+/).length);
            console.log('Length limits:', { min: config.minLength, max: config.maxLength });

            return { prompt: generatedText };
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

                const response = await this.makeRequest('/api/generate', {
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
            const response = await this.makeRequest('/api/pull', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
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
            // First, list all models to see what's actually installed
            const models = await this.listModels();
            console.log('Currently installed models:', models);

            // Find the exact model name that matches our base name
            const baseModelName = modelName.split(':')[0];
            console.log('Looking for model with base name:', baseModelName);
            
            const matchingModel = models.find(model => 
                model.name.startsWith(baseModelName + ':') || model.name === baseModelName
            );

            if (!matchingModel) {
                console.error('Model not found in installed models:', baseModelName);
                throw new Error(`Model ${baseModelName} not found`);
            }

            console.log('Found matching model:', matchingModel);
            
            // According to Ollama API docs, the request should be in this format
            const deleteRequest = {
                name: matchingModel.name
            };
            console.log('Delete request:', deleteRequest);

            const response = await fetch(`${this.getBaseUrl()}/api/delete`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(deleteRequest)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Delete response:', response.status, errorText);
                throw new Error(`Failed to delete model: ${response.status} - ${errorText}`);
            }

            const responseData = await response.json().catch(() => null);
            console.log('Delete response data:', responseData);

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
            const response = await this.makeRequest('/api/tags');
            
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

    async generateSystemInstructions(description) {
        try {
            await this.ensureTextModelSelected();
            const currentModel = await this.getCurrentModel();
            
            const prompt = `Based on the following style description, generate clear and specific system instructions for an AI model that creates image generation prompts:

Description: ${description}

Create instructions that MUST include:
1. Define the visual style and artistic characteristics (e.g., medium, technique, color palette)
2. Specify the mood, atmosphere, and emotional impact
3. List specific visual elements or patterns that MUST be included
4. Describe composition preferences and framing
5. List MANDATORY style-specific keywords and terminology that MUST appear in every output
6. Emphasize that the style name itself MUST be incorporated naturally in every generated description

IMPORTANT: Make it absolutely clear that:
- The style name MUST appear in every generated description
- The specified keywords MUST be used in the output
- The style's unique characteristics MUST be clearly reflected

Keep instructions focused on visual and artistic elements only. Be extremely specific and actionable.
Do not include any meta-instructions about prompt formatting.`;

            const requestBody = {
                model: currentModel,
                prompt: prompt,
                stream: false,
                options: {
                    temperature: 0.7,
                    top_k: 40,
                    top_p: 0.9
                }
            };

            console.log('Making generate request with body:', requestBody);
            const response = await this.makeRequest('/api/generate', {
                method: 'POST',
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to generate system instructions: ${errorText}`);
            }

            let fullResponse = '';
            try {
                const data = await response.json();
                fullResponse = data.response;
            } catch (error) {
                console.error('Error parsing JSON response:', error);
                const text = await response.text();
                console.log('Raw response text:', text);
                const match = text.match(/"response":"([^"]+)"/);
                if (match) {
                    fullResponse = match[1];
                } else {
                    throw new Error('Failed to parse response from Ollama');
                }
            }

            return fullResponse.trim();
        } catch (error) {
            console.error('Error generating system instructions:', error);
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
                await this.makeRequest('/api/generate', {
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
                await this.makeRequest('/api/generate', {
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
                                if (data.total) {
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
1. Keep the prompt concise and natural - avoid technical jargon
2. Focus on the main subject and mood
3. Add only the most relevant details
4. Maintain the original style and theme
5. Keep the language flowing naturally
6. DO NOT add technical terms or quality tags
7. DO NOT change the original concept
8. Return ONLY the enhanced prompt text, nothing else
9. ${style?.modelParameters?.maxLength} words maximum.

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
}

module.exports = new OllamaManager(); 
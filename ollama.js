const https = require('https');
const http = require('http');
const { exec } = require('child_process');

class OllamaManager {
    constructor() {
        this.baseUrl = 'http://localhost:11434';
        this.isConnected = false;
        this.currentModel = null;
        this.availableModels = [];
        this.lastError = null;
        this.startingServer = false;
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
                }
            });

            // Poczekaj na uruchomienie serwera
            const checkConnection = async () => {
                try {
                    const response = await this.makeRequest(`${this.baseUrl}/api/tags`);
                    if (response.ok) {
                        console.log('Ollama server started successfully');
                        this.startingServer = false;
                        resolve(true);
                        return;
                    }
                } catch (error) {
                    // Kontynuuj próby
                }
                setTimeout(checkConnection, 1000);
            };

            checkConnection();
        });
    }

    makeRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            const req = http.request(url, options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        resolve({
                            ok: res.statusCode === 200,
                            json: () => Promise.resolve(JSON.parse(data))
                        });
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', (error) => {
                if (error.code === 'ECONNREFUSED') {
                    this.lastError = 'Ollama is not running. Please start Ollama and try again.';
                } else {
                    this.lastError = error.message;
                }
                reject(error);
            });

            if (options.body) {
                req.write(options.body);
            }
            req.end();
        });
    }

    async checkConnection() {
        try {
            const response = await this.makeRequest(`${this.baseUrl}/api/tags`);
            if (response.ok) {
                const data = await response.json();
                this.isConnected = true;
                this.availableModels = data.models || [];
                this.lastError = null;
                return true;
            }
        } catch (error) {
            console.error('Connection error:', error);
            this.isConnected = false;
            // Spróbuj uruchomić serwer, jeśli nie jest połączony
            if (!this.startingServer) {
                await this.startServer();
            }
            return false;
        }
        return false;
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
        this.currentModel = modelName;
    }

    getStatus() {
        return {
            isConnected: this.isConnected,
            currentModel: this.currentModel,
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
}

module.exports = new OllamaManager(); 
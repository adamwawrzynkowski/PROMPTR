const http = require('http');
const { app } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fetch = require('node-fetch');

const DEFAULT_MODEL = 'llama3.2';
const DEFAULT_VISION_MODEL = 'llava';

class OllamaManager {
    constructor() {
        this._baseUrl = null;
        this._isInitialized = false;
        this._currentPort = null;
        this._modelsPath = null;
        this._defaultModel = DEFAULT_MODEL;
        // Use explicit IPv4
        this._host = '127.0.0.1';
        this._port = 11434;
        this._progressCallback = null;
    }

    get baseUrl() {
        return this._baseUrl || `http://${this._host}:${this._currentPort}`;
    }

    get modelsPath() {
        if (!this._modelsPath) {
            this._modelsPath = path.join(app.getPath('userData'), 'PROMPTR', 'models');
        }
        return this._modelsPath;
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

            // First, check if port is in use
            try {
                const { stdout: psOutput } = await new Promise((resolve, reject) => {
                    require('child_process').exec('lsof -i :11434 -t', (error, stdout, stderr) => {
                        resolve({ stdout, stderr });
                    });
                });

                if (psOutput.trim()) {
                    const pid = psOutput.trim();
                    console.log(`Found Ollama process (PID: ${pid})`);
                    
                    // Try to connect to existing process first
                    try {
                        const response = await fetch(`http://${this._host}:11434/api/version`);
                        if (response.ok) {
                            console.log('Successfully connected to existing Ollama instance');
                            this._currentPort = 11434;
                            this._isInitialized = true;
                            
                            // Check and pull default model if needed
                            await this.checkAndPullDefaultModel();
                            
                            return true;
                        }
                    } catch (error) {
                        console.log('Existing process not responding, attempting restart...');
                        
                        // Gracefully stop the process
                        await new Promise((resolve) => {
                            require('child_process').exec(`kill ${pid}`, (error) => {
                                resolve();
                            });
                        });
                        
                        // Wait for process to stop
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        
                        // Double check if process is still there
                        try {
                            await new Promise((resolve, reject) => {
                                require('child_process').exec(`ps -p ${pid}`, (error) => {
                                    if (error) {
                                        resolve(); // Process is gone
                                    } else {
                                        // Force kill if still running
                                        require('child_process').exec(`kill -9 ${pid}`, () => resolve());
                                    }
                                });
                            });
                        } catch (error) {
                            console.log('Error checking process:', error);
                        }
                        
                        // Wait a bit more after force kill
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
            } catch (error) {
                console.log('Error checking for existing process:', error);
            }

            // Start new Ollama instance
            console.log('Starting new Ollama instance...');
            const ollamaProcess = require('child_process').spawn(ollamaPath, ['serve'], {
                detached: true,
                stdio: 'inherit'
            });
            
            ollamaProcess.unref();
            
            // Give Ollama time to start and verify connection
            let connectionError = null;
            for (let attempt = 0; attempt < 15; attempt++) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                try {
                    const response = await fetch(`http://${this._host}:11434/api/version`);
                    if (response.ok) {
                        console.log('Successfully connected to new Ollama instance');
                        this._currentPort = 11434;
                        this._isInitialized = true;
                        
                        // Check and pull default model if needed
                        await this.checkAndPullDefaultModel();
                        
                        return true;
                    }
                } catch (error) {
                    connectionError = error;
                    console.log('Connection attempt', attempt + 1, 'failed:', error.message);
                }
            }

            console.error('Last connection error:', connectionError);
            throw new Error('Could not establish connection to Ollama. Please check if Ollama is installed and running correctly.');
        } catch (error) {
            console.error('Failed to initialize Ollama manager:', error);
            throw error;
        }
    }

    async checkAndPullDefaultModel() {
        try {
            this.updateStartupProgress(10, 'Checking installed models...', '');
            const response = await fetch(`http://${this._host}:11434/api/tags`);
            if (!response.ok) {
                throw new Error('Failed to fetch models list');
            }
            
            const models = await response.json();
            const installedModels = models.models?.map(m => m.name) || [];
            console.log('Installed models:', installedModels.join(', ') || 'none');
            
            this.updateStartupProgress(20, 'Checking required models...', '');
            
            const modelsToCheck = [
                { name: DEFAULT_MODEL, reason: 'default text model' },
                { name: DEFAULT_VISION_MODEL, reason: 'vision capabilities' }
            ];

            let totalProgress = 20;
            const progressPerModel = 40;

            for (const model of modelsToCheck) {
                if (!installedModels.includes(model.name)) {
                    console.log(`Downloading ${model.name} for ${model.reason}...`);
                    this.updateStartupProgress(totalProgress, `Downloading ${model.name}...`, 'This might take a few minutes');
                    
                    const pullResponse = await fetch(`http://${this._host}:11434/api/pull`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ name: model.name })
                    });

                    if (!pullResponse.ok) {
                        throw new Error(`Failed to pull model ${model.name}: ${pullResponse.statusText}`);
                    }

                    const text = await pullResponse.text();
                    const lines = text.split('\n').filter(Boolean);
                    
                    let downloadProgress = 0;
                    for (const line of lines) {
                        try {
                            const data = JSON.parse(line);
                            if (data.status) {
                                if (data.status.includes('%')) {
                                    const percent = parseInt(data.status.match(/(\d+)%/)[1]);
                                    downloadProgress = percent;
                                    const currentProgress = totalProgress + (downloadProgress * progressPerModel / 100);
                                    this.updateStartupProgress(
                                        currentProgress,
                                        `Downloading ${model.name}...`,
                                        `${data.status}`
                                    );
                                } else {
                                    this.updateStartupProgress(
                                        totalProgress,
                                        `Downloading ${model.name}...`,
                                        data.status
                                    );
                                }
                            }
                            if (data.error) {
                                throw new Error(data.error);
                            }
                        } catch (e) {
                            if (e.message !== 'Unexpected end of JSON input') {
                                console.error('Error parsing model download progress:', e);
                            }
                        }
                    }
                    
                    console.log(`${model.name} downloaded successfully`);
                    totalProgress += progressPerModel;
                    this.updateStartupProgress(totalProgress, `${model.name} downloaded successfully`, '');
                } else {
                    console.log(`${model.name} is already installed`);
                    totalProgress += progressPerModel;
                    this.updateStartupProgress(totalProgress, `${model.name} is already installed`, '');
                }
            }
            
            this.updateStartupProgress(100, 'Initialization complete', '');
            return true;
        } catch (error) {
            console.error('Error checking/pulling models:', error);
            this.updateStartupProgress(0, 'Error', error.message);
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
            const response = await fetch(`http://${this._host}:${this._currentPort}/api/tags`);
            if (!response.ok) throw new Error('Failed to fetch models');
            const data = await response.json();
            return data.models || [];
        } catch (error) {
            console.error('Error listing models:', error);
            return [];
        }
    }

    async generatePrompt(prompt, styleId, customStyle = null) {
        if (!prompt) return { prompt: '' };

        try {
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

            console.log('Generating prompt with options:', { styleId, options, enhancedPrompt });

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

            if (!response.ok) throw new Error('Failed to generate prompt');
            
            const data = await response.json();
            return { prompt: data.response || '' };
        } catch (error) {
            console.error('Error generating prompt:', error);
            throw error;
        }
    }

    async generateTags(text) {
        if (!text) return [];

        try {
            const response = await fetch(`http://${this._host}:${this._currentPort}/api/generate`, {
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
        this._baseUrl = `http://${this._host}:${port}`;
    }

    setDefaultModel(model) {
        this._defaultModel = model;
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

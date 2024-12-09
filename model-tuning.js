const { ipcRenderer } = require('electron');

class ModelTuning {
    constructor() {
        this.styleId = null;
        this.styleName = null;
        this.parameters = {
            temperature: 0.7,
            topP: 0.5,
            topK: 40,
            maxTokens: 2048
        };
        this.defaultParameters = { ...this.parameters };
        
        // Initialize close button
        document.getElementById('closeButton').addEventListener('click', () => {
            window.close();
        });

        // Initialize save and reset buttons
        document.getElementById('saveButton').addEventListener('click', () => this.saveChanges());
        document.getElementById('resetButton').addEventListener('click', () => this.resetToDefaults());

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Temperature
        const temperatureSlider = document.getElementById('temperature');
        const temperatureValue = temperatureSlider.parentElement.nextElementSibling;
        
        temperatureSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            temperatureValue.textContent = value.toFixed(1);
            this.parameters.temperature = value;
            this.updateSliderGradient(e.target);
        });

        // Top P
        const topPSlider = document.getElementById('top-p');
        const topPValue = topPSlider.parentElement.nextElementSibling;
        
        topPSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            topPValue.textContent = value.toFixed(2);
            this.parameters.topP = value;
            this.updateSliderGradient(e.target);
        });

        // Top K
        const topKSlider = document.getElementById('top-k');
        const topKValue = topKSlider.parentElement.nextElementSibling;
        
        topKSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            topKValue.textContent = value;
            this.parameters.topK = value;
            this.updateSliderGradient(e.target);
        });

        // Max Tokens
        const maxTokensSlider = document.getElementById('max-tokens');
        const maxTokensValue = maxTokensSlider.parentElement.nextElementSibling;
        
        maxTokensSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            maxTokensValue.textContent = value;
            this.parameters.maxTokens = value;
            this.updateSliderGradient(e.target);
        });

        // Initialize gradients
        [temperatureSlider, topPSlider, topKSlider, maxTokensSlider].forEach(slider => {
            this.updateSliderGradient(slider);
        });

        // Listen for style data from main process
        ipcRenderer.on('init-model-tuning', (event, data) => {
            this.initializeWithStyle(data);
        });
    }

    updateSliderGradient(slider) {
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        const value = parseFloat(slider.value);
        const percentage = ((value - min) / (max - min)) * 100;
        slider.style.setProperty('--value-percent', `${percentage}%`);
    }

    initializeWithStyle(data) {
        this.styleId = data.styleId;
        this.styleName = data.styleName;
        this.parameters = { ...this.parameters, ...data.parameters };
        
        // Update UI
        document.querySelector('.titlebar-title span').textContent = `${this.styleName} Style - Model Fine-tuning`;
        document.title = `${this.styleName} Style - Model Fine-tuning`;
        
        // Update all inputs
        const inputs = {
            'temperature': this.parameters.temperature,
            'top-p': this.parameters.topP,
            'top-k': this.parameters.topK,
            'max-tokens': this.parameters.maxTokens
        };

        Object.entries(inputs).forEach(([id, value]) => {
            const range = document.getElementById(id);
            const number = document.getElementById(`${id}-value`);
            range.value = value;
            number.value = value;
            this.updateSliderGradient(range);
        });
    }

    resetToDefaults() {
        // Reset parameters to default values
        this.parameters = { ...this.defaultParameters };
        
        // Update UI
        const sliders = {
            temperature: document.getElementById('temperature'),
            topP: document.getElementById('top-p'),
            topK: document.getElementById('top-k'),
            maxTokens: document.getElementById('max-tokens')
        };
        
        // Update each slider and its value display
        for (const [key, slider] of Object.entries(sliders)) {
            slider.value = this.parameters[key];
            const valueDisplay = slider.parentElement.nextElementSibling;
            valueDisplay.textContent = this.parameters[key];
            this.updateSliderGradient(slider);
        }
    }

    saveChanges() {
        // Send updated parameters to main process
        ipcRenderer.send('update-style-parameters', {
            styleId: this.styleId,
            parameters: this.parameters
        });

        // Listen for response
        ipcRenderer.once('style-parameters-updated', () => {
            window.close();
        });

        ipcRenderer.once('style-parameters-update-error', (event, errorMessage) => {
            console.error('Failed to save parameters:', errorMessage);
            // Keep window open if there was an error
        });
    }
}

// Initialize and expose to window
window.modelTuning = new ModelTuning();

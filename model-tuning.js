const { ipcRenderer } = require('electron');

class ModelTuning {
    constructor() {
        this.styleId = null;
        this.styleName = null;
        this.parameters = {
            temperature: 0.7,
            top_p: 0.9,
            top_k: 40,
            max_tokens: 2048,
            repeat_penalty: 1.1
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
            temperatureValue.textContent = value.toFixed(2);
            this.parameters.temperature = value;
            this.updateSliderGradient(e.target);
        });

        // Top P
        const topPSlider = document.getElementById('top-p');
        const topPValue = topPSlider.parentElement.nextElementSibling;
        
        topPSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            topPValue.textContent = value.toFixed(2);
            this.parameters.top_p = value;
            this.updateSliderGradient(e.target);
        });

        // Top K
        const topKSlider = document.getElementById('top-k');
        const topKValue = topKSlider.parentElement.nextElementSibling;
        
        topKSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            topKValue.textContent = value;
            this.parameters.top_k = value;
            this.updateSliderGradient(e.target);
        });

        // Repeat Penalty
        const repeatPenaltySlider = document.getElementById('repeat-penalty');
        const repeatPenaltyValue = repeatPenaltySlider.parentElement.nextElementSibling;
        
        repeatPenaltySlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            repeatPenaltyValue.textContent = value.toFixed(2);
            this.parameters.repeat_penalty = value;
            this.updateSliderGradient(e.target);
        });

        // Max Tokens
        const maxTokensSlider = document.getElementById('max-tokens');
        const maxTokensValue = maxTokensSlider.parentElement.nextElementSibling;
        
        maxTokensSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            maxTokensValue.textContent = value;
            this.parameters.max_tokens = value;
            this.updateSliderGradient(e.target);
        });

        // Initialize gradients
        [temperatureSlider, topPSlider, topKSlider, repeatPenaltySlider, maxTokensSlider].forEach(slider => {
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
        console.log('Initializing with style data:', data);
        
        if (!data || !data.styleId) {
            console.error('Invalid style data:', data);
            return;
        }
        
        // Store the styleId and styleName
        this.styleId = data.styleId;
        this.styleName = data.styleName || 'Unnamed Style';
        
        // First ensure data.parameters exists
        if (!data.parameters) {
            data.parameters = {};
        }
        
        // Merge with default parameters, but give priority to data.parameters
        this.parameters = {
            ...this.defaultParameters,  // First spread defaults
            ...data.parameters         // Then override with actual parameters
        };
        
        console.log('Initialized with styleId:', this.styleId, 'styleName:', this.styleName, 'and parameters:', this.parameters);
        
        // Update UI
        const titleElement = document.querySelector('.titlebar-title span');
        const titleText = `${this.styleName} Style - Model Fine-tuning`;
        
        if (titleElement) {
            titleElement.textContent = titleText;
            document.title = titleText;
        } else {
            console.error('Title element not found');
        }
        
        // Update all inputs
        const inputs = {
            'temperature': this.parameters.temperature,
            'top-p': this.parameters.top_p,
            'top-k': this.parameters.top_k,
            'repeat-penalty': this.parameters.repeat_penalty,
            'max-tokens': this.parameters.max_tokens
        };

        Object.entries(inputs).forEach(([id, value]) => {
            const range = document.getElementById(id);
            if (!range) {
                console.error(`Input element not found: ${id}`);
                return;
            }
            
            const valueDisplay = range.parentElement.nextElementSibling;
            if (!valueDisplay) {
                console.error(`Value display element not found for: ${id}`);
                return;
            }
            
            range.value = value;
            
            // Format the display value based on the parameter type
            if (id === 'temperature' || id === 'top-p' || id === 'repeat-penalty') {
                valueDisplay.textContent = parseFloat(value).toFixed(2);
            } else {
                valueDisplay.textContent = value;
            }
            
            this.updateSliderGradient(range);
        });
    }

    resetToDefaults() {
        // Reset parameters to default values
        this.parameters = { ...this.defaultParameters };
        
        // Update UI
        const inputs = {
            'temperature': this.parameters.temperature,
            'top-p': this.parameters.top_p,
            'top-k': this.parameters.top_k,
            'repeat-penalty': this.parameters.repeat_penalty,
            'max-tokens': this.parameters.max_tokens
        };

        Object.entries(inputs).forEach(([id, value]) => {
            const range = document.getElementById(id);
            const valueDisplay = range.parentElement.nextElementSibling;
            
            range.value = value;
            
            // Format the display value based on the parameter type
            if (id === 'temperature' || id === 'top-p' || id === 'repeat-penalty') {
                valueDisplay.textContent = parseFloat(value).toFixed(2);
            } else {
                valueDisplay.textContent = value;
            }
            
            this.updateSliderGradient(range);
        });
    }

    saveChanges() {
        if (!this.styleId) {
            console.error('Cannot save changes: styleId is not set');
            return;
        }
        
        console.log('Saving changes for styleId:', this.styleId, 'with parameters:', this.parameters);
        
        // Send updated parameters to main process
        ipcRenderer.send('save-model-parameters', {
            styleId: this.styleId,
            parameters: { ...this.parameters } // Create a new object to ensure clean data
        });

        // Close window after saving
        window.close();
    }
}

// Initialize and expose to window
window.modelTuning = new ModelTuning();

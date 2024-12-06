const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    const statusElement = document.getElementById('status');
    const progressElement = document.getElementById('progress');
    const percentageElement = document.getElementById('progress-percentage');

    // Signal that startup window is ready
    ipcRenderer.send('startup-window-ready');

    let currentProgress = 0;
    let targetProgress = 0;
    let animationFrame = null;

    // Enhanced smooth progress animation with easing
    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    function animateProgress() {
        if (currentProgress < targetProgress) {
            const delta = (targetProgress - currentProgress) * 0.1;
            currentProgress = Math.min(currentProgress + Math.max(0.5, delta), targetProgress);
            
            const easedProgress = easeOutCubic(currentProgress / 100) * 100;
            progressElement.style.width = `${easedProgress}%`;
            percentageElement.textContent = `${Math.round(currentProgress)}%`;
            
            animationFrame = requestAnimationFrame(animateProgress);
        }
    }

    // Update UI function with smooth transitions
    function updateUI(data) {
        if (!data) return;
        
        if (data.status) {
            statusElement.textContent = data.status;
            statusElement.style.color = ''; // Reset color
        }
        
        if (typeof data.progress === 'number') {
            targetProgress = data.progress;
            if (!animationFrame) {
                animationFrame = requestAnimationFrame(animateProgress);
            }
        }
    }

    // Create retry button
    function createRetryButton() {
        const retryButton = document.createElement('button');
        retryButton.id = 'retry-button';
        retryButton.textContent = 'Retry';
        retryButton.classList.add('retry-button');
        retryButton.onclick = () => {
            retryButton.disabled = true;
            retryButton.textContent = 'Retrying...';
            statusElement.style.color = '';
            currentProgress = 0;
            targetProgress = 0;
            progressElement.style.width = '0%';
            percentageElement.textContent = '0%';
            ipcRenderer.send('retry-startup');
        };
        return retryButton;
    }

    // Listen for startup progress
    ipcRenderer.on('startup-progress', (event, data) => {
        console.log('Startup progress:', data);
        updateUI(data);
    });

    // Listen for startup errors
    ipcRenderer.on('startup-error', (event, errorMessage) => {
        console.error('Startup error:', errorMessage);
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
        
        statusElement.textContent = errorMessage;
        statusElement.style.color = '#ff4444';
        
        // Remove existing retry button if any
        const existingRetryButton = document.getElementById('retry-button');
        if (existingRetryButton) {
            existingRetryButton.remove();
        }
        
        // Add retry button
        const retryButton = createRetryButton();
        document.body.appendChild(retryButton);
    });
});
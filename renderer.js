import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    DocumentTextIcon, 
    SparklesIcon, 
    BeakerIcon, 
    CodeBracketIcon,
    ArrowPathIcon,
    Cog6ToothIcon,
    BookmarkIcon
} from '@heroicons/react/24/outline';
import './styles.css';

let drawThingsButton = null;

async function checkDrawThingsStatus() {
    try {
        const isRunning = await window.ipcRenderer.invoke('check-draw-things');
        if (drawThingsButton) {
            drawThingsButton.style.display = isRunning ? 'block' : 'none';
        }
    } catch (error) {
        console.error('Error checking Draw Things status:', error);
    }
}

function initializeDrawThings() {
    const promptInput = document.querySelector('#prompt-input');
    const inputWrapper = promptInput.parentElement;
    
    drawThingsButton = document.createElement('button');
    drawThingsButton.className = 'draw-things-button';
    drawThingsButton.innerHTML = '<i class="fas fa-paint-brush"></i>';
    drawThingsButton.title = 'Send to Draw Things';
    drawThingsButton.style.display = 'none';
    
    drawThingsButton.addEventListener('click', async () => {
        const prompt = promptInput.value;
        if (prompt) {
            try {
                await window.ipcRenderer.invoke('send-to-draw-things', prompt);
            } catch (error) {
                console.error('Error sending to Draw Things:', error);
            }
        }
    });
    
    inputWrapper.appendChild(drawThingsButton);
    
    checkDrawThingsStatus();
    setInterval(checkDrawThingsStatus, 5000);
}

const App = () => {
    // ... (poprzedni kod stanu) ...

    return (
        <>
            <div className="titlebar">
                <span>Prompt Enhancer</span>
            </div>
            <div className="app-content">
                <div className="prompt-container">
                    <textarea
                        className="prompt-input"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Enter your prompt here..."
                    />
                </div>

                <div className="suggestions-grid">
                    {suggestions.map((suggestion, index) => (
                        <motion.div
                            key={index}
                            className="suggestion-tile"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                        >
                            <div className="suggestion-tile-content">
                                <div className="suggestion-header">
                                    <Icon name={suggestion.icon} />
                                    <h3>{suggestion.type}</h3>
                                </div>
                                <p>{suggestion.text}</p>
                                <div className="improved-prompt">
                                    {isLoading ? (
                                        "Generating..."
                                    ) : (
                                        suggestion.improvedPrompt || "Enter your prompt above to see suggestions..."
                                    )}
                                </div>
                                <button 
                                    className="apply-button"
                                    onClick={() => {
                                        if (suggestion.improvedPrompt) {
                                            setPrompt(suggestion.improvedPrompt);
                                        }
                                    }}
                                    disabled={!suggestion.improvedPrompt || isLoading}
                                >
                                    Apply
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </>
    );
};

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />); 

// Dodaj obsługę przycisku vision
document.getElementById('vision-button').addEventListener('click', () => {
    ipcRenderer.send('open-vision');
});

// Dodaj obsługę otrzymanego promptu
ipcRenderer.on('set-prompt', (event, prompt) => {
    document.getElementById('prompt-input').value = prompt;
}); 
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
const { generateSuggestions } = require('./api.js');

const App = () => {
    const [prompt, setPrompt] = useState('');
    const [suggestions, setSuggestions] = useState([
        {
            type: 'Detailed',
            text: 'Adds more details and context to your prompt',
            improvedPrompt: '',
            style: 'detailed'
        },
        {
            type: 'Concise',
            text: 'Simplifies and shortens while keeping key elements',
            improvedPrompt: '',
            style: 'concise'
        },
        {
            type: 'Creative',
            text: 'Adds creative elements and unique perspectives',
            improvedPrompt: '',
            style: 'creative'
        },
        {
            type: 'Technical',
            text: 'Enhances with technical details and precise instructions',
            improvedPrompt: '',
            style: 'technical'
        }
    ]);
    const [isLoading, setIsLoading] = useState(false);

    const handleGenerateSuggestions = async (text) => {
        if (text.length < 10) return;
        
        setIsLoading(true);
        try {
            const result = await generateSuggestions(text);
            setSuggestions(prev => prev.map((suggestion, index) => ({
                ...suggestion,
                improvedPrompt: result[index]?.improvedPrompt || ''
            })));
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const debounceTimeout = setTimeout(() => {
            if (prompt.length > 10) {
                handleGenerateSuggestions(prompt);
            }
        }, 1000);

        return () => clearTimeout(debounceTimeout);
    }, [prompt]);

    const SuggestionTile = ({ suggestion }) => (
        <motion.div
            className="suggestion-tile"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
        >
            <h3>{suggestion.type}</h3>
            <p>{suggestion.text}</p>
            <div className="improved-prompt">
                {isLoading ? (
                    <div className="loading-indicator">Generating suggestions...</div>
                ) : (
                    suggestion.improvedPrompt || 'Enter your prompt above to see suggestions...'
                )}
            </div>
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                    if (suggestion.improvedPrompt) {
                        setPrompt(suggestion.improvedPrompt);
                    }
                }}
                disabled={!suggestion.improvedPrompt || isLoading}
                style={{
                    marginTop: '10px',
                    padding: '8px 16px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '5px',
                    color: 'white',
                    cursor: suggestion.improvedPrompt ? 'pointer' : 'not-allowed'
                }}
            >
                Apply
            </motion.button>
        </motion.div>
    );

    return (
        <div className="glass-container">
            <textarea
                className="prompt-input"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter your prompt here..."
            />
            <AnimatePresence>
                <div className="suggestions-grid">
                    {suggestions.map((suggestion, index) => (
                        <SuggestionTile key={index} suggestion={suggestion} />
                    ))}
                </div>
            </AnimatePresence>
        </div>
    );
};

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />); 
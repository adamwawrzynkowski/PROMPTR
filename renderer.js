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
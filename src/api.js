async function generateSuggestions(prompt) {
    try {
        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: "mistral",
                prompt: `Analyze the following prompt and suggest 4 different ways to improve it.
                        Prompt: ${prompt}
                        
                        Return the response in JSON format with an array of objects containing:
                        - type (improvement type)
                        - text (proposed change description)
                        - improvedPrompt (improved text)
                        
                        Example response format:
                        [
                            {
                                "type": "Adding Context",
                                "text": "Added more information about...",
                                "improvedPrompt": "Improved prompt text..."
                            }
                        ]`,
                stream: false
            })
        });

        const data = await response.json();
        try {
            return JSON.parse(data.response);
        } catch (parseError) {
            console.error('Error parsing JSON response:', parseError);
            return [
                { 
                    type: 'Basic Enhancement', 
                    text: 'Failed to generate suggestions',
                    improvedPrompt: prompt 
                }
            ];
        }
    } catch (error) {
        console.error('Error generating suggestions:', error);
        return [];
    }
}

module.exports = { generateSuggestions }; 
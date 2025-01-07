const { ipcRenderer } = require('electron');

// Template tags for empty prompt
const TEMPLATE_TAGS = [
    'portrait', 'landscape', 'realistic', 'fantasy',
    'sci-fi', 'anime', 'digital art', 'oil painting',
    'watercolor', 'sketch', 'black and white', 'colorful',
    'dark', 'bright', 'minimalist', 'detailed'
];

// Generate system prompt for tag generation
function generateTagSystemPrompt() {
    return `You are a helpful AI assistant specializing in generating relevant tags for image generation prompts.
Your task is to analyze the input text and generate relevant, concise tags that capture the key elements, style, mood, and artistic direction.
Each tag should be a single word or short phrase, focusing on visual elements that would be relevant for image generation.

Guidelines for tag generation:
1. Keep tags concise and relevant
2. Focus on visual elements, style, mood, and artistic direction
3. Include a mix of subject matter, style, and technical aspects
4. Avoid repetitive or redundant tags
5. Keep each tag between 1-3 words
6. Return only the tags, separated by newlines
7. Generate 8-12 tags per request

Example input: "A serene mountain lake at sunset with reflection"
Example output:
mountain landscape
sunset colors
lake reflection
serene atmosphere
nature photography
golden hour
peaceful scene
water reflection
outdoor scene`;
}

// Clean and filter tags
function cleanTag(tag) {
    if (!tag) return '';
    
    // Remove control tokens and special characters
    const controlTokens = ['<|', '|>', '_start', '_end', 'system', 'assistant', 'user'];
    let cleanedTag = tag.trim().toLowerCase();
    
    // Remove control tokens
    controlTokens.forEach(token => {
        cleanedTag = cleanedTag.replace(new RegExp(`<\\|?${token}\\|?>`, 'gi'), '');
        cleanedTag = cleanedTag.replace(new RegExp(`${token}`, 'gi'), '');
    });
    
    // Remove special characters and extra spaces
    cleanedTag = cleanedTag
        .replace(/[<>|]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    
    // Check if tag is valid
    return cleanedTag.length > 1 && cleanedTag.length < 30 ? cleanedTag : '';
}

// Generate tags based on input text
async function generateTags(text) {
    try {
        if (!text || !text.trim()) {
            // Return random selection of template tags if no input
            const shuffled = [...TEMPLATE_TAGS].sort(() => 0.5 - Math.random());
            return shuffled.slice(0, 10);
        }

        const systemPrompt = generateTagSystemPrompt();
        const response = await ipcRenderer.invoke('generate-tags', {
            text: text,
            systemPrompt: systemPrompt
        });

        const tags = response
            .split('\n')
            .map(tag => cleanTag(tag))
            .filter(tag => tag !== '');

        // Ensure we have at least some tags
        if (tags.length === 0) {
            const shuffled = [...TEMPLATE_TAGS].sort(() => 0.5 - Math.random());
            return shuffled.slice(0, 10);
        }

        return tags;
    } catch (error) {
        console.error('Error generating tags:', error);
        // Return template tags on error
        const shuffled = [...TEMPLATE_TAGS].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, 10);
    }
}

module.exports = {
    generateTags,
    TEMPLATE_TAGS
};

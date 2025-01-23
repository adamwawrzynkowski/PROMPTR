const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    const styleNameInput = document.getElementById('style-name');
    const styleDescriptionInput = document.getElementById('style-description');
    const systemInstructionsInput = document.getElementById('system-instructions');
    const iconsGrid = document.getElementById('icons-grid');
    const windowTitle = document.getElementById('window-title');
    const saveBtn = document.getElementById('save-btn');
    const closeBtn = document.getElementById('close-btn');
    const generateBtn = document.getElementById('generate-btn');
    const charCount = document.getElementById('char-count');

    // Error message elements
    const nameError = document.getElementById('name-error');
    const iconError = document.getElementById('icon-error');
    const descriptionError = document.getElementById('description-error');
    const instructionsError = document.getElementById('instructions-error');

    let currentStyle = null;
    let selectedIcon = null;

    // Bazowe instrukcje systemowe
    const defaultSystemInstructions = `You are an AI assistant specialized in helping users create prompts. Your role is to enhance and refine the user's input to create more detailed and effective prompts.

When processing the user's input {prompt}, you should:
1. Maintain the original intent and context
2. Add relevant details and specifications
3. Use clear and precise language
4. Ensure the output is well-structured

Focus on {prompt} while applying the style's specific characteristics.`;

    // Walidacja formularza
    function validateForm() {
        let isValid = true;
        const errors = {
            name: '',
            icon: '',
            description: '',
            instructions: ''
        };

        // Sprawdź nazwę
        if (!styleNameInput.value.trim()) {
            errors.name = 'Name is required';
            isValid = false;
        }

        // Sprawdź ikonę
        if (!selectedIcon) {
            errors.icon = 'Please select an icon';
            isValid = false;
        }

        // Sprawdź opis
        if (!styleDescriptionInput.value.trim()) {
            errors.description = 'Description is required';
            isValid = false;
        }

        // Sprawdź instrukcje
        if (!systemInstructionsInput.value.trim()) {
            errors.instructions = 'System instructions are required';
            isValid = false;
        }

        // Wyświetl błędy
        nameError.textContent = errors.name;
        iconError.textContent = errors.icon;
        descriptionError.textContent = errors.description;
        instructionsError.textContent = errors.instructions;

        // Dodaj/usuń klasy błędów
        styleNameInput.parentElement.classList.toggle('error', errors.name !== '');
        iconsGrid.parentElement.classList.toggle('error', errors.icon !== '');
        styleDescriptionInput.parentElement.classList.toggle('error', errors.description !== '');
        systemInstructionsInput.parentElement.classList.toggle('error', errors.instructions !== '');

        return isValid;
    }

    // Aktualizacja stanu przycisku Save
    function updateSaveButtonState() {
        const isValid = styleNameInput.value.trim() &&
                       selectedIcon &&
                       styleDescriptionInput.value.trim() &&
                       systemInstructionsInput.value.trim();
        
        saveBtn.disabled = !isValid;
    }

    // Lista dostępnych ikon
    const availableIcons = [
        // Art & Design
        'paint-brush', 'palette', 'pencil', 'pen', 'pen-nib', 'pen-fancy', 'brush', 'fill-drip',
        'spray-can', 'swatchbook', 'droplet', 'vector-square', 'object-group', 'object-ungroup',
        'layer-group', 'clone',

        // Photography & Media
        'image', 'images', 'camera', 'camera-retro', 'film', 'video',
        'photo-video', 'circle-half-stroke', 'eye', 'eye-dropper',
        'wand-magic-sparkles', 'filter',

        // Nature & Weather
        'mountain', 'tree', 'leaf', 'seedling', 'cloud', 'sun', 'moon', 'star',
        'snowflake', 'fire', 'water', 'earth-americas', 'wind',

        // Animals
        'dog', 'cat', 'dragon', 'dove', 'fish', 'horse', 'hippo', 'otter',
        'paw', 'feather',

        // Fantasy & Magic
        'hat-wizard', 'ghost', 'scroll', 'sparkles', 'wand', 'gem', 'dice-d20',
        'shield-halved',

        // Emotions & Expressions
        'face-smile', 'face-laugh', 'face-grin', 'face-surprise', 'face-meh',
        'face-angry', 'face-sad-tear', 'face-grimace', 'heart', 'heart-pulse',

        // Objects & Items
        'book', 'bookmark', 'newspaper', 'map', 'compass', 'clock',
        'hourglass', 'key', 'lock', 'unlock', 'crown', 'trophy',

        // Music & Sound
        'music', 'guitar', 'drum', 'headphones', 'microphone',
        'volume-high', 'sliders',

        // Technology
        'robot', 'microchip', 'laptop-code', 'code', 'terminal', 'database',
        'server', 'wifi', 'signal',

        // Space & Science
        'rocket', 'user-astronaut', 'atom', 'microscope',
        'telescope', 'meteor',

        // Abstract & Symbols
        'infinity', 'circle', 'square', 'diamond', 'triangle',
        'shapes', 'chart-line', 'chart-pie', 'lightbulb',

        // Food & Drinks
        'utensils', 'pizza-slice', 'burger', 'ice-cream', 'cake-candles',
        'mug-hot', 'wine-glass', 'martini-glass'
    ];

    // Aktualizacja licznika znaków
    function updateCharCount() {
        const count = styleDescriptionInput.value.length;
        charCount.textContent = count;
        charCount.style.color = count === 200 ? 'var(--error-color)' : 'var(--text-secondary)';
        updateSaveButtonState();
    }

    // Generowanie instrukcji systemowych na podstawie opisu
    async function generateInstructions() {
        const description = styleDescriptionInput.value.trim();
        if (!description) {
            descriptionError.textContent = 'Please add a description first';
            styleDescriptionInput.parentElement.classList.add('error');
            return;
        }

        try {
            generateBtn.disabled = true;
            generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

            // Przygotowanie promptu do generowania instrukcji
            const prompt = `Create comprehensive system instructions for an AI that will transform prompts according to this style description: "${description}"

The instructions should be highly specialized and structured as follows:

1. Style Identity & Role:
   - Define the AI's precise role in implementing this style
   - List key characteristics that make this style unique
   - Specify the tone, voice, and perspective to maintain
   - Detail the depth and complexity level expected in outputs
   - Define the optimal length and structure for detailed responses

2. Transformation Process:
   - Provide step-by-step guidelines for converting {prompt} into this style
   - Detail specific elements and patterns to incorporate
   - Explain how to preserve the original meaning while applying the style
   - Include style-specific vocabulary and phrasing preferences
   - Specify how to expand and elaborate on key concepts
   - Guide on incorporating rich descriptive elements

3. Style Requirements:
   - Outline mandatory elements that must be present
   - Specify formatting and structural requirements
   - List style-specific techniques and approaches
   - Provide examples of ideal transformations
   - Define minimum content requirements for detailed outputs
   - Specify required depth of analysis and description

4. Style Boundaries:
   - Define what should NOT be included or changed
   - Identify elements that would break the style
   - Specify how to handle edge cases
   - Set guidelines for maintaining appropriate length
   - Define limits for detail and complexity

5. Quality Assurance:
   - List specific criteria for evaluating style adherence
   - Provide checkpoints for maintaining consistency
   - Include verification steps for style authenticity
   - Ensure comprehensive coverage of all aspects
   - Verify sufficient detail and elaboration
   - Check for proper depth and richness of content

Essential Guidelines:
- Always use {prompt} as the placeholder for user input
- Be highly specific to this style's unique attributes
- Include practical examples and patterns
- Ensure instructions are detailed yet actionable
- Focus on maintaining both style integrity and original intent
- For detailed outputs, aim for comprehensive coverage
- Include rich descriptive elements and thorough analysis
- Maintain proper balance between detail and clarity

Format the response with clear numbering, bullet points, and distinct sections.
For detailed outputs, ensure extensive coverage of each point with rich descriptions and thorough analysis.`;

            // Fallback template for when API generation fails
            const fallbackInstructions = `You are an AI assistant specializing in the following style: "${description}"

Your primary role is to transform user prompts to perfectly match this style while maintaining their core intent.

When processing the user's input {prompt}, follow these guidelines:

1. Style Application:
   - Analyze the core elements of {prompt}
   - Apply the style's unique characteristics
   - Maintain the original message's integrity
   - Ensure consistent tone and approach

2. Transformation Steps:
   - Identify key components to modify
   - Adapt language and structure to match style
   - Add style-specific enhancements
   - Remove elements that don't fit

3. Quality Standards:
   - Verify style consistency throughout
   - Check for proper style integration
   - Ensure clarity and effectiveness
   - Maintain balance between style and meaning

4. Final Refinement:
   - Polish the output for maximum impact
   - Verify all style elements are present
   - Ensure natural flow and readability
   - Confirm style authenticity`;

            const instructions = await ipcRenderer.invoke('generate-system-instructions', {
                description,
                prompt,
                defaultInstructions: defaultSystemInstructions
            });

            if (instructions) {
                systemInstructionsInput.value = instructions;
            } else {
                // Fallback z bardziej szczegółowym szablonem
                const fallbackInstructions = `You are an AI assistant specializing in the following style: "${description}"

Your primary role is to transform user prompts to perfectly match this style while maintaining their core intent.

When processing the user's input {prompt}, follow these guidelines:

1. Style Characteristics:
   - Apply the unique elements described in the style
   - Maintain consistency with the style's tone and approach
   - Ensure the output reflects the style's specific requirements

2. Transformation Process:
   - Preserve the core meaning of {prompt}
   - Adapt the language and structure to match the style
   - Add style-specific elements and enhancements
   - Remove any elements that don't fit the style

3. Quality Control:
   - Verify that the output maintains the original intent
   - Ensure consistent style application throughout
   - Check that all style-specific requirements are met

4. Final Adjustments:
   - Fine-tune the output to perfectly match the style
   - Maintain natural flow and readability
   - Ensure the result is both effective and style-compliant`;

                systemInstructionsInput.value = fallbackInstructions;
            }
        } catch (error) {
            console.error('Error generating instructions:', error);
            systemInstructionsInput.value = defaultSystemInstructions.replace(
                'Your role is to enhance and refine',
                `Your role is to apply the following style: "${description}" and`
            );
        } finally {
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<i class="fas fa-magic"></i> Generate';
            updateSaveButtonState();
            
            // Usuń błąd z pola instrukcji po wygenerowaniu
            instructionsError.textContent = '';
            systemInstructionsInput.parentElement.classList.remove('error');
        }
    }

    // Tworzenie siatki ikon
    function createIconsGrid() {
        iconsGrid.innerHTML = '';
        availableIcons.forEach(iconName => {
            const iconDiv = document.createElement('div');
            iconDiv.className = 'icon-option';
            iconDiv.innerHTML = `<i class="fas fa-${iconName}"></i>`;
            iconDiv.dataset.icon = iconName;
            
            iconDiv.addEventListener('click', () => {
                document.querySelectorAll('.icon-option').forEach(el => el.classList.remove('selected'));
                iconDiv.classList.add('selected');
                selectedIcon = iconName;
                iconError.textContent = '';
                iconsGrid.parentElement.classList.remove('error');
                updateSaveButtonState();
            });

            iconsGrid.appendChild(iconDiv);
        });
    }

    // Nasłuchiwanie na dane stylu
    ipcRenderer.on('style-data', (event, style) => {
        console.log('Received style data:', style);
        currentStyle = style;
        
        // Aktualizacja tytułu okna
        windowTitle.textContent = style.id ? 'Edit Style' : 'New Style';
        
        // Wypełnianie pól formularza
        if (style.id) {
            styleNameInput.value = style.name || '';
            styleDescriptionInput.value = style.description || '';
            systemInstructionsInput.value = style.systemInstructions || defaultSystemInstructions;
            
            // Zaznaczanie wybranej ikony
            if (style.icon) {
                selectedIcon = style.icon;
                setTimeout(() => {
                    const iconElement = document.querySelector(`[data-icon="${style.icon}"]`);
                    if (iconElement) {
                        iconElement.classList.add('selected');
                    }
                }, 100);
            }
        } else {
            // Dla nowego stylu, ustawiamy domyślne instrukcje
            systemInstructionsInput.value = defaultSystemInstructions;
        }

        updateCharCount();
        updateSaveButtonState();
    });

    // Zapisywanie stylu
    async function saveStyle() {
        if (!validateForm()) {
            return;
        }

        // Get the description and system instructions
        const description = styleDescriptionInput.value.trim();
        const systemInstructions = systemInstructionsInput.value.trim();

        const styleData = {
            ...(currentStyle || {}),
            name: styleNameInput.value,
            description: description,
            systemInstructions: systemInstructions || defaultSystemInstructions,
            icon: selectedIcon,
            custom: true,
            prefix: `Create ${description.toLowerCase()}: `,
            suffix: `. Ensure the output matches the style characteristics and maintains high quality.`
        };

        try {
            console.log('Saving style:', styleData);
            await ipcRenderer.invoke('save-style', styleData);
            
            // Wyślij sygnał do odświeżenia listy stylów
            ipcRenderer.send('refresh-styles-list');
            
            window.close();
        } catch (error) {
            console.error('Error saving style:', error);
        }
    }

    // Event listeners
    styleNameInput.addEventListener('input', () => {
        nameError.textContent = '';
        styleNameInput.parentElement.classList.remove('error');
        updateSaveButtonState();
    });

    styleDescriptionInput.addEventListener('input', () => {
        updateCharCount();
        descriptionError.textContent = '';
        styleDescriptionInput.parentElement.classList.remove('error');
    });

    systemInstructionsInput.addEventListener('input', () => {
        instructionsError.textContent = '';
        systemInstructionsInput.parentElement.classList.remove('error');
        updateSaveButtonState();
    });

    if (generateBtn) {
        generateBtn.addEventListener('click', generateInstructions);
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', saveStyle);
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            window.close();
        });
    }

    // Inicjalizacja
    createIconsGrid();
    saveBtn.disabled = true;
});

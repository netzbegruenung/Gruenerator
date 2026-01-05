import React, { useState, useMemo, useCallback, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { HiSparkles, HiArrowUp } from 'react-icons/hi';
import { PiFolder, PiLayout, PiUser } from 'react-icons/pi';
import { generateSharepicFromPrompt } from '../../../services/sharepicPromptService';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { IMAGE_STUDIO_CATEGORIES, IMAGE_STUDIO_TYPES } from '../utils/typeConfig';
import { StartOption } from '../types/componentTypes';

import '../../../assets/styles/components/sharepic/sharepic-type-selector.css';

// Example prompts for the AI chat input
const EXAMPLE_PROMPTS = [
    { label: 'Zitat', text: 'Erstelle ein Zitat zum Thema Klimaschutz' },
    { label: 'Sharepic', text: 'Sharepic mit 3 Zeilen über Windenergie' },
    { label: 'Info', text: 'Info-Grafik über erneuerbare Energien' }
];

const ImageStudioCategorySelector: React.FC = () => {
    const navigate = useNavigate();
    const setCategory = useImageStudioStore((state) => state.setCategory);
    const loadFromAIGeneration = useImageStudioStore((state) => state.loadFromAIGeneration);
    const { user } = useOptimizedAuth();

    // Chat input state
    const [promptInput, setPromptInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationError, setGenerationError] = useState<string | null>(null);

    const firstName = useMemo(() => {
        const displayName = user?.display_name || user?.name || '';
        return displayName.split(' ')[0] || '';
    }, [user]);

    const setType = useImageStudioStore((state) => state.setType);

    const handleCategorySelect = useCallback((cat: string | null, subcat: string | null, directType?: string) => {
        if (directType) {
            setType(directType);
            navigate(`/image-studio/templates/${directType}`);
        } else if (cat) {
            setCategory(cat, subcat);
            navigate(`/image-studio/${cat}`);
        }
    }, [setCategory, setType, navigate]);

    // Handle AI prompt submission
    const handlePromptSubmit = useCallback(async (e?: FormEvent) => {
        if (e) e.preventDefault();

        const trimmedPrompt = promptInput.trim();
        if (!trimmedPrompt || isGenerating) return;

        setIsGenerating(true);
        setGenerationError(null);

        try {
            const result = await generateSharepicFromPrompt(trimmedPrompt);

            if (!result.success) {
                setGenerationError(result.error || 'Ein Fehler ist aufgetreten');
                setIsGenerating(false);
                return;
            }

            // Handle KI types - navigate to KI creation flow
            if (result.isKiType) {
                const kiType = result.type === 'ki-sharepic' ? 'ki-sharepic' : 'pure-create';
                navigate(`/image-studio/ki/create/${kiType}`);
                return;
            }

            // Load the generated data into the store (including selected image if available)
            loadFromAIGeneration(result.type, result.data as unknown as Record<string, string>, result.selectedImage);

            // Navigate to the sharepic edit page
            navigate(`/image-studio/templates/${result.type}`);

        } catch (error: any) {
            console.error('[ImageStudioCategorySelector] Prompt submission error:', error);
            setGenerationError(error.message || 'Ein Fehler ist aufgetreten');
        } finally {
            setIsGenerating(false);
        }
    }, [promptInput, isGenerating, loadFromAIGeneration, navigate]);

    // Handle keyboard submit (Enter without Shift)
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handlePromptSubmit();
        }
    }, [handlePromptSubmit]);

    // Handle example prompt click
    const handleExampleClick = useCallback((text: string) => {
        setPromptInput(text);
    }, []);

    const startOptions: StartOption[] = [
        { id: 'sharepics', category: IMAGE_STUDIO_CATEGORIES.TEMPLATES, subcategory: null, label: 'Sharepics', description: 'Erstelle Sharepics mit vorgefertigten Designs', Icon: PiLayout, previewImage: '/imagine/previews/dreizeilen-preview.png' },
        { id: 'imagine', category: IMAGE_STUDIO_CATEGORIES.KI, subcategory: null, label: 'Imagine (KI)', description: 'Erstelle oder bearbeite Bilder mit KI', Icon: HiSparkles, previewImage: '/imagine/variants-pure/soft-illustration.png' },
        { id: 'profilbild', category: IMAGE_STUDIO_CATEGORIES.TEMPLATES, subcategory: null, label: 'Profilbild', description: 'Erstelle ein Porträt mit grünem Hintergrund', Icon: PiUser, previewImage: '/imagine/previews/profilbild-preview.png', directType: IMAGE_STUDIO_TYPES.PROFILBILD },
        { id: 'vorlagen', category: null, subcategory: null, label: 'Vorlagen', description: 'Durchsuche vorgefertigte Vorlagen', Icon: PiFolder, previewImage: '/imagine/previews/vorlagen-preview.jpg', isEarlyAccess: true }
    ];

    return (
        <div className="type-selector-screen">
            <div className="type-selector-content">
                <div className="type-selector-header-row">
                    <h1>{firstName ? `Hallo, ${firstName}!` : 'Willkommen im Image-Studio'}</h1>
                    <button className="btn-secondary" onClick={() => navigate('/image-studio/gallery')} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-small)' }}>
                        <PiFolder /> Meine Bilder
                    </button>
                </div>

                {/* AI Prompt Input Section */}
                <motion.div
                    className="image-studio-prompt-section"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                >
                    <form className="image-studio-prompt-form" onSubmit={handlePromptSubmit}>
                        <div className="image-studio-prompt-input-container">
                            <div className="image-studio-prompt-input-wrapper">
                                <textarea
                                    value={promptInput}
                                    onChange={(e) => setPromptInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Beschreibe dein Sharepic..."
                                    disabled={isGenerating}
                                    rows={2}
                                    className="image-studio-prompt-input"
                                />
                                <div className="image-studio-prompt-examples">
                                    {EXAMPLE_PROMPTS.map((example, index) => (
                                        <button
                                            key={index}
                                            type="button"
                                            className="image-studio-prompt-example"
                                            onClick={() => handleExampleClick(example.text)}
                                            disabled={isGenerating}
                                        >
                                            {example.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button
                                type="submit"
                                className={`image-studio-prompt-submit ${isGenerating ? 'loading' : ''}`}
                                disabled={!promptInput.trim() || isGenerating}
                                aria-label="Sharepic generieren"
                            >
                                {isGenerating ? (
                                    <span className="spinner-small" />
                                ) : (
                                    <HiArrowUp />
                                )}
                            </button>
                        </div>
                    </form>

                    {generationError && (
                        <motion.p
                            className="image-studio-prompt-error"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                        >
                            {generationError}
                        </motion.p>
                    )}
                </motion.div>

                {/* Section Divider */}
                <div className="image-studio-divider">
                    <span>Oder starte mit einer Vorlage</span>
                </div>

                {/* Existing Category Cards */}
                <div className="type-options-grid type-options-grid--four">
                    {startOptions.map((option) => (
                        <div
                            key={option.id}
                            className={`type-card ${option.previewImage ? 'type-card--image gradient-dark' : ''} ${option.isComingSoon ? 'coming-soon' : ''}`}
                            onClick={() => !option.isComingSoon && (option.isEarlyAccess ? navigate('/datenbank/vorlagen') : handleCategorySelect(option.category, option.subcategory, option.directType))}
                            role="button"
                            tabIndex={option.isComingSoon ? -1 : 0}
                            onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && !option.isComingSoon && (option.isEarlyAccess ? navigate('/datenbank/vorlagen') : handleCategorySelect(option.category, option.subcategory, option.directType))}
                        >
                            {option.isComingSoon && <span className="coming-soon-badge">Coming Soon</span>}
                            {option.isEarlyAccess && <span className="early-access-badge">Early Access</span>}
                            {option.previewImage ? (
                                <>
                                    <img src={option.previewImage} alt={option.label} className="type-card__image" />
                                    <h3>{option.label}</h3>
                                    <p className="type-card__description">{option.description}</p>
                                </>
                            ) : (
                                <>
                                    <div className="type-icon"><option.Icon /></div>
                                    <h3>{option.label}</h3>
                                    <p>{option.description}</p>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ImageStudioCategorySelector;

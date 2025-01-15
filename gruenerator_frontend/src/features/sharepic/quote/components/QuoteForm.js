import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { FontSizeControl } from '../../../../components/utils/ImageModificationForm';
import { FORM_LABELS, ERROR_MESSAGES } from '../../../../components/utils/constants';
import { useSharepicGeneratorContext } from '../../core/utils/SharepicGeneratorContext';

const QuoteForm = ({ 
    formData, 
    handleChange, 
    errors = {},
    fontSize,
    onControlChange
}) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const { generateQuote } = useSharepicGeneratorContext();

    const handleGenerateQuote = async () => {
        if (!formData.thema && !formData.details && !formData.quote) {
            return;
        }
        
        setIsGenerating(true);
        try {
            const result = await generateQuote(
                formData.thema,
                formData.details,
                formData.quote
            );
            
            if (result.quotes && result.quotes.length > 0) {
                handleChange({
                    target: {
                        name: 'alternatives',
                        value: result.quotes
                    }
                });
                handleChange({
                    target: {
                        name: 'quote',
                        value: result.quotes[0].quote
                    }
                });
            }
        } catch (error) {
            console.error('Fehler bei der Zitat-Generierung:', error);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="quote-form">
            <div className="form-group">
                <label htmlFor="thema">
                    {FORM_LABELS.THEME}
                </label>
                <input
                    type="text"
                    id="thema"
                    name="thema"
                    value={formData.thema}
                    onChange={handleChange}
                    placeholder="Optional: Thema für die Zitat-Generierung"
                />
            </div>

            <div className="form-group">
                <label htmlFor="details">
                    {FORM_LABELS.DETAILS}
                </label>
                <textarea
                    id="details"
                    name="details"
                    value={formData.details}
                    onChange={handleChange}
                    placeholder="Optional: Details für die Zitat-Generierung"
                />
            </div>

            <button 
                type="button" 
                onClick={handleGenerateQuote}
                disabled={isGenerating || (!formData.thema && !formData.details && !formData.quote)}
                className="generate-button"
            >
                {isGenerating ? 'Generiere...' : 'Zitat generieren'}
            </button>

            <div className="form-group">
                <label htmlFor="quote">
                    {FORM_LABELS.QUOTE}
                    <span className="required">*</span>
                </label>
                <textarea
                    id="quote"
                    name="quote"
                    value={formData.quote}
                    onChange={handleChange}
                    className={errors.quote ? 'error' : ''}
                    placeholder="Gib hier das Zitat ein..."
                    maxLength={280}
                />
                {errors.quote && <span className="error-message">{ERROR_MESSAGES.QUOTE}</span>}
                <div className="character-count">
                    {formData.quote?.length || 0}/280
                </div>
            </div>

            <div className="form-group">
                <label htmlFor="name">
                    {FORM_LABELS.NAME}
                    <span className="required">*</span>
                </label>
                <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className={errors.name ? 'error' : ''}
                    placeholder="Name der zitierten Person"
                    maxLength={50}
                />
                {errors.name && <span className="error-message">{ERROR_MESSAGES.NAME}</span>}
            </div>

            <div className="form-group">
                <label htmlFor="credit">
                    {FORM_LABELS.CREDIT}
                </label>
                <input
                    type="text"
                    id="credit"
                    name="credit"
                    value={formData.credit}
                    onChange={handleChange}
                    placeholder="Optional: Credit für das Bild"
                    maxLength={100}
                />
            </div>

            <div className="form-group">
                <label>Schriftgröße</label>
                <FontSizeControl
                    fontSize={fontSize}
                    onControlChange={onControlChange}
                />
            </div>
        </div>
    );
};

QuoteForm.propTypes = {
    formData: PropTypes.shape({
        thema: PropTypes.string,
        details: PropTypes.string,
        quote: PropTypes.string,
        name: PropTypes.string,
        credit: PropTypes.string
    }).isRequired,
    handleChange: PropTypes.func.isRequired,
    errors: PropTypes.object,
    fontSize: PropTypes.number,
    onControlChange: PropTypes.func.isRequired
};

export default QuoteForm; 
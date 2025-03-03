import React from 'react';
import PropTypes from 'prop-types';
import { FORM_LABELS, ERROR_MESSAGES } from '../../../../components/utils/constants';

const QuoteForm = ({ 
    formData, 
    handleChange, 
    errors = {}
}) => {
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
        </div>
    );
};

QuoteForm.propTypes = {
    formData: PropTypes.shape({
        thema: PropTypes.string,
        details: PropTypes.string,
        quote: PropTypes.string,
        name: PropTypes.string
    }).isRequired,
    handleChange: PropTypes.func.isRequired,
    errors: PropTypes.object
};

export default QuoteForm; 
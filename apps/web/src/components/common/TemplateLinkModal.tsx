import React, { useState } from 'react';
import { HiExternalLink, HiX, HiCheck, HiExclamationCircle } from 'react-icons/hi';
import * as canvaUtils from '../utils/canvaUtils';

/**
 * Modal component for adding template links to Canva designs
 * Allows users to link their own Canva URLs to server templates
 */
interface TemplateLinkModalProps {
    template: Record<string, unknown>;
    onClose: () => void;
    onSubmit: (url: string) => Promise<void> | void;
}

const TemplateLinkModal = ({ template, onClose, onSubmit }: TemplateLinkModalProps) => {
    const [canvaUrl, setCanvaUrl] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [validationError, setValidationError] = useState('');

    const validateCanvaUrl = (url: string) => {
        return canvaUtils.validateCanvaUrl(url);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const error = validateCanvaUrl(canvaUrl);
        if (error) {
            setValidationError(error);
            return;
        }

        setIsSubmitting(true);
        setValidationError('');

        try {
            await onSubmit(canvaUrl.trim());
        } catch (error) {
            setValidationError('Fehler beim Erstellen des Template Links.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCanvaUrl(e.target.value);
        setValidationError('');
    };

    if (!template) return null;

    return (
        <div className="citation-modal-overlay" onClick={onClose}>
            <div className="citation-modal" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                <div className="citation-modal-header">
                    <div className="share-modal-title">
                        <HiExternalLink className="share-modal-icon" />
                        <h4>Template Link hinzufügen</h4>
                    </div>
                    <button
                        className="citation-modal-close"
                        onClick={onClose}
                        disabled={isSubmitting}
                        aria-label="Modal schließen"
                    >
                        <HiX />
                    </button>
                </div>

                <div className="citation-modal-content">
                    <div className="template-link-info">
                        <p><strong>Server Template:</strong> {typeof template.title === 'string' ? template.title : String(template.title)}</p>
                        <p>Geben Sie Ihre eigene Canva URL ein, um diese mit dem Template zu verknüpfen:</p>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label htmlFor="canva-url">Canva URL:</label>
                            <input
                                id="canva-url"
                                type="url"
                                className={`form-input ${validationError ? 'error' : ''}`}
                                value={canvaUrl}
                                onChange={handleUrlChange}
                                placeholder="https://www.canva.com/design/..."
                                disabled={isSubmitting}
                                autoFocus
                                required
                            />
                            {validationError && (
                                <div className="form-error">
                                    <HiExclamationCircle />
                                    {validationError}
                                </div>
                            )}
                        </div>

                        <div className="template-link-actions">
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={onClose}
                                disabled={isSubmitting}
                            >
                                Abbrechen
                            </button>
                            <button
                                type="submit"
                                className="btn-primary"
                                disabled={!canvaUrl.trim() || isSubmitting}
                            >
                                {isSubmitting ? (
                                    <>
                                        <div className="spinner"></div>
                                        Wird erstellt...
                                    </>
                                ) : (
                                    <>
                                        <HiCheck />
                                        Template Link erstellen
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default TemplateLinkModal;

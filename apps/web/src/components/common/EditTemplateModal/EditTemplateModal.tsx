import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HiX } from 'react-icons/hi';
import { useTagAutocomplete } from '../TemplateModal';
import '../TemplateModal/template-modal.css';

const EditTemplateModal = ({
    isOpen,
    onClose,
    onSuccess,
    onSave,
    template
}) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [externalUrl, setExternalUrl] = useState('');
    const [thumbnailUrl, setThumbnailUrl] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState(null);

    const tagAutocomplete = useTagAutocomplete(description, setDescription);

    useEffect(() => {
        if (isOpen && template) {
            setTitle(template.title || '');
            setDescription(template.description || '');
            setExternalUrl(template.external_url || template.canva_url || '');
            setThumbnailUrl(template.thumbnail_url || template.preview_image_url || '');
            setIsPrivate(template.is_private !== false);
            setSubmitError(null);
            tagAutocomplete.reset();
        }
    }, [isOpen, template]);

    useEffect(() => {
        if (!isOpen) {
            setSubmitError(null);
            tagAutocomplete.reset();
        }
    }, [isOpen]);

    const handleSubmit = useCallback(async () => {
        if (!title.trim()) {
            setSubmitError('Titel ist erforderlich.');
            return;
        }

        setSubmitError(null);
        setIsSubmitting(true);

        try {
            await onSave(template.id, {
                title: title.trim(),
                description: description.trim(),
                canva_url: externalUrl.trim(),
                is_private: isPrivate
            });

            onSuccess?.();
            onClose();
        } catch (error) {
            setSubmitError(error.message || 'Fehler beim Speichern der Vorlage');
        } finally {
            setIsSubmitting(false);
        }
    }, [template, title, description, externalUrl, isPrivate, onSave, onSuccess, onClose]);

    const handleBackdropClick = useCallback((e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }, [onClose]);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Escape') {
            onClose();
        }
    }, [onClose]);

    useEffect(() => {
        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [isOpen, handleKeyDown]);

    if (!isOpen || !template) return null;

    const canSubmit = title.trim().length > 0;

    const modalContent = (
        <div className="template-modal-backdrop" onClick={handleBackdropClick}>
            <div className="template-modal" role="dialog" aria-modal="true" aria-labelledby="template-modal-title">
                <div className="template-modal-header">
                    <h2 id="template-modal-title">Vorlage bearbeiten</h2>
                    <button
                        className="template-modal-close"
                        onClick={onClose}
                        aria-label="Schließen"
                    >
                        <HiX />
                    </button>
                </div>

                <div className="template-modal-body">
                    {thumbnailUrl && (
                        <div className="template-modal-preview-image template-modal-preview-image--large">
                            <img
                                src={thumbnailUrl}
                                alt="Vorschau"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                        </div>
                    )}

                    <div className="template-modal-field">
                        <label htmlFor="edit-title">Titel *</label>
                        <input
                            id="edit-title"
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Titel der Vorlage"
                            disabled={isSubmitting}
                        />
                    </div>

                    <div className="template-modal-field">
                        <label htmlFor="edit-description">Beschreibung</label>
                        <div className="template-modal-textarea-wrapper">
                            {tagAutocomplete.suggestionSuffix && (
                                <div className="template-modal-ghost-text">
                                    <span className="template-modal-ghost-prefix">{tagAutocomplete.ghostPrefix}</span>
                                    <span className="template-modal-ghost-suffix">{tagAutocomplete.suggestionSuffix}</span>
                                </div>
                            )}
                            <textarea
                                id="edit-description"
                                ref={tagAutocomplete.textareaRef}
                                value={description}
                                onChange={tagAutocomplete.handleChange}
                                onKeyDown={tagAutocomplete.handleKeyDown}
                                placeholder="Beschreibung der Vorlage..."
                                rows={3}
                                disabled={isSubmitting}
                            />
                        </div>
                    </div>

                    <div className="template-modal-field">
                        <label htmlFor="edit-url">URL</label>
                        <input
                            id="edit-url"
                            type="url"
                            value={externalUrl}
                            onChange={(e) => setExternalUrl(e.target.value)}
                            placeholder="https://..."
                            disabled={isSubmitting}
                        />
                    </div>

                    <div className="template-modal-field template-modal-checkbox">
                        <label>
                            <input
                                type="checkbox"
                                checked={!isPrivate}
                                onChange={(e) => setIsPrivate(!e.target.checked)}
                                disabled={isSubmitting}
                            />
                            <span>Öffentlich (in Galerie sichtbar)</span>
                        </label>
                    </div>

                    {submitError && (
                        <p className="template-modal-error">{submitError}</p>
                    )}
                </div>

                <div className="template-modal-footer">
                    <button
                        className="pabtn pabtn--m pabtn--ghost"
                        onClick={onClose}
                        disabled={isSubmitting}
                    >
                        Abbrechen
                    </button>
                    <button
                        className="pabtn pabtn--m pabtn--primary"
                        onClick={handleSubmit}
                        disabled={!canSubmit || isSubmitting}
                    >
                        {isSubmitting ? 'Wird gespeichert...' : 'Speichern'}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default EditTemplateModal;

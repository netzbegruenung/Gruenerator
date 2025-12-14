import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HiX } from 'react-icons/hi';
import './EditTemplateModal.css';

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
    const [templateType, setTemplateType] = useState('canva');
    const [isPrivate, setIsPrivate] = useState(false);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState(null);

    useEffect(() => {
        if (isOpen && template) {
            setTitle(template.title || '');
            setDescription(template.description || '');
            setExternalUrl(template.external_url || template.canva_url || '');
            setThumbnailUrl(template.thumbnail_url || template.preview_image_url || '');
            setTemplateType(template.template_type || 'canva');
            setIsPrivate(template.is_private !== false);
            setSubmitError(null);
        }
    }, [isOpen, template]);

    useEffect(() => {
        if (!isOpen) {
            setSubmitError(null);
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
                preview_image_url: thumbnailUrl.trim(),
                template_type: templateType,
                is_private: isPrivate
            });

            onSuccess?.();
            onClose();
        } catch (error) {
            setSubmitError(error.message || 'Fehler beim Speichern der Vorlage');
        } finally {
            setIsSubmitting(false);
        }
    }, [template, title, description, externalUrl, thumbnailUrl, templateType, isPrivate, onSave, onSuccess, onClose]);

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
        <div className="edit-template-modal-backdrop" onClick={handleBackdropClick}>
            <div className="edit-template-modal" role="dialog" aria-modal="true" aria-labelledby="edit-template-modal-title">
                <div className="edit-template-modal-header">
                    <h2 id="edit-template-modal-title">Vorlage bearbeiten</h2>
                    <button
                        className="edit-template-modal-close"
                        onClick={onClose}
                        aria-label="Schließen"
                    >
                        <HiX />
                    </button>
                </div>

                <div className="edit-template-modal-body">
                    {thumbnailUrl && (
                        <div className="edit-template-modal-preview-image">
                            <img
                                src={thumbnailUrl}
                                alt="Vorschau"
                                onError={(e) => { e.target.style.display = 'none'; }}
                            />
                        </div>
                    )}

                    <div className="edit-template-modal-field">
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

                    <div className="edit-template-modal-field">
                        <label htmlFor="edit-description">Beschreibung</label>
                        <textarea
                            id="edit-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Beschreibung der Vorlage..."
                            rows={3}
                            disabled={isSubmitting}
                        />
                    </div>

                    <div className="edit-template-modal-field">
                        <label htmlFor="edit-type">Typ</label>
                        <select
                            id="edit-type"
                            value={templateType}
                            onChange={(e) => setTemplateType(e.target.value)}
                            disabled={isSubmitting}
                        >
                            <option value="canva">Canva</option>
                            <option value="sharepic">Sharepic</option>
                            <option value="external">Externe Vorlage</option>
                            <option value="other">Sonstige</option>
                        </select>
                    </div>

                    <div className="edit-template-modal-field">
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

                    <div className="edit-template-modal-field">
                        <label htmlFor="edit-thumbnail">Vorschaubild URL</label>
                        <input
                            id="edit-thumbnail"
                            type="url"
                            value={thumbnailUrl}
                            onChange={(e) => setThumbnailUrl(e.target.value)}
                            placeholder="https://..."
                            disabled={isSubmitting}
                        />
                    </div>

                    <div className="edit-template-modal-field edit-template-modal-checkbox">
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
                        <p className="edit-template-modal-error">{submitError}</p>
                    )}
                </div>

                <div className="edit-template-modal-footer">
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

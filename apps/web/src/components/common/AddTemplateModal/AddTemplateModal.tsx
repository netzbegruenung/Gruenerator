import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HiX } from 'react-icons/hi';
import { SiCanva } from 'react-icons/si';
import { useAuthStore } from '../../../stores/authStore';
import { suggestTagsFromTemplate } from './tagSuggestions';
import { useTagAutocomplete } from '../TemplateModal';
import '../TemplateModal/template-modal.css';
import apiClient from '../../utils/apiClient';

const READ_ONLY_PERMISSIONS = { read: true, write: false, collaborative: false };

const isCanvaTemplateShareLink = (url) => {
    try {
        const urlObj = new URL(url);
        const utmSource = urlObj.searchParams.get('utm_source');
        return ['publishsharelink', 'sharebutton', 'shareyourdesignpanel'].includes(utmSource);
    } catch {
        return false;
    }
};

const AddTemplateModal = ({
    isOpen,
    onClose,
    onSuccess,
    groupId = null,
    onShareContent = null
}) => {
    const [mode, setMode] = useState('canva');
    const [canvaUrl, setCanvaUrl] = useState('');
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [previewError, setPreviewError] = useState(null);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [externalUrl, setExternalUrl] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState(null);
    const [notShareLinkError, setNotShareLinkError] = useState(false);

    const [authorName, setAuthorName] = useState('');
    const [contactEmail, setContactEmail] = useState('');

    const tagAutocomplete = useTagAutocomplete(description, setDescription);

    useEffect(() => {
        if (!isOpen) {
            setMode('canva');
            setCanvaUrl('');
            setPreviewData(null);
            setPreviewError(null);
            setTitle('');
            setDescription('');
            setExternalUrl('');
            setSubmitError(null);
            setNotShareLinkError(false);
            setAuthorName('');
            setContactEmail('');
            tagAutocomplete.reset();
        } else {
            const user = useAuthStore.getState().user;
            if (user) {
                const name = user.display_name ||
                    [user.first_name, user.last_name].filter(Boolean).join(' ') || '';
                setAuthorName(name);
                setContactEmail(user.email || '');
            }
        }
    }, [isOpen]);

    const handleLoadPreview = useCallback(async () => {
        if (!canvaUrl.trim()) {
            setPreviewError('Bitte eine Canva URL eingeben.');
            return;
        }

        setNotShareLinkError(false);

        if (!isCanvaTemplateShareLink(canvaUrl.trim())) {
            setNotShareLinkError(true);
            setPreviewData(null);
            return;
        }

        setIsLoadingPreview(true);
        setPreviewError(null);
        setPreviewData(null);

        try {
            const response = await apiClient.post('/auth/user-templates/from-url', { url: canvaUrl.trim(), preview: true });
            const data = response.data;

            if (!data.success) {
                throw new Error(data.message || 'Fehler beim Laden der Vorschau');
            }

            setPreviewData(data.preview);
            const existingDesc = data.preview.description || '';
            const suggestedTags = suggestTagsFromTemplate(data.preview, 'canva');
            setDescription(existingDesc + (existingDesc && suggestedTags ? '\n\n' : '') + suggestedTags);
        } catch (error) {
            setPreviewError(error.response?.data?.message || error.message || 'Fehler beim Laden der Vorschau');
        } finally {
            setIsLoadingPreview(false);
        }
    }, [canvaUrl]);

    const handleSubmit = useCallback(async () => {
        setSubmitError(null);
        setIsSubmitting(true);

        try {
            let templateId;

            if (mode === 'canva') {
                if (!previewData) {
                    throw new Error('Bitte zuerst die Vorschau laden.');
                }
                if (!title.trim()) {
                    throw new Error('Titel ist erforderlich.');
                }

                const response = await apiClient.post('/auth/user-templates/from-url', {
                    url: canvaUrl.trim(),
                    title: title.trim(),
                    description: description.trim(),
                    metadata: {
                        author_name: authorName.trim() || null,
                        contact_email: contactEmail.trim() || null
                    }
                });

                const data = response.data;

                if (!data.success) {
                    throw new Error(data.message || 'Fehler beim Erstellen der Vorlage');
                }

                templateId = data.data.id;
            } else {
                if (!title.trim()) {
                    throw new Error('Titel ist erforderlich.');
                }
                if (!description.trim()) {
                    throw new Error('Beschreibung ist erforderlich.');
                }
                if (!externalUrl.trim()) {
                    throw new Error('URL ist erforderlich.');
                }

                const response = await apiClient.post('/auth/user-templates', {
                    title: title.trim(),
                    description: description.trim(),
                    canva_url: externalUrl.trim(),
                    template_type: 'external',
                    metadata: {
                        author_name: authorName.trim() || null,
                        contact_email: contactEmail.trim() || null
                    }
                });

                const data = response.data;

                if (!data.success) {
                    throw new Error(data.message || 'Fehler beim Erstellen der Vorlage');
                }

                templateId = data.data.id;
            }

            if (groupId && onShareContent && templateId) {
                await onShareContent('database', templateId, {
                    permissions: READ_ONLY_PERMISSIONS,
                    targetGroupId: groupId
                });
            }

            onSuccess?.({ id: templateId, title: title.trim() });
            onClose();
        } catch (error) {
            setSubmitError(error.message || 'Fehler beim Erstellen der Vorlage');
        } finally {
            setIsSubmitting(false);
        }
    }, [mode, previewData, title, description, externalUrl, canvaUrl, groupId, onShareContent, onSuccess, onClose, authorName, contactEmail]);

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

    if (!isOpen) return null;

    const isCanvaMode = mode === 'canva';
    const canSubmit = isCanvaMode
        ? (previewData && title.trim() && !notShareLinkError)
        : (title.trim() && description.trim() && externalUrl.trim());

    const renderGhostText = () => (
        tagAutocomplete.suggestionSuffix && (
            <div className="template-modal-ghost-text">
                <span className="template-modal-ghost-prefix">{tagAutocomplete.ghostPrefix}</span>
                <span className="template-modal-ghost-suffix">{tagAutocomplete.suggestionSuffix}</span>
            </div>
        )
    );

    const modalContent = (
        <div className="template-modal-backdrop" onClick={handleBackdropClick}>
            <div className="template-modal" role="dialog" aria-modal="true" aria-labelledby="template-modal-title">
                <div className="template-modal-header">
                    <h2 id="template-modal-title">
                        {groupId ? 'Vorlage zur Gruppe hinzufügen' : 'Neue Vorlage erstellen'}
                    </h2>
                    <button
                        className="template-modal-close"
                        onClick={onClose}
                        aria-label="Schließen"
                    >
                        <HiX />
                    </button>
                </div>

                <div className="template-modal-tabs">
                    <button
                        className={`template-modal-tab ${isCanvaMode ? 'active' : ''}`}
                        onClick={() => setMode('canva')}
                    >
                        <SiCanva className="template-modal-tab-icon" />
                        <span>Canva</span>
                    </button>
                    <button
                        className={`template-modal-tab ${!isCanvaMode ? 'active' : ''}`}
                        onClick={() => setMode('other')}
                    >
                        <span>Andere Vorlage</span>
                    </button>
                </div>

                <div className="template-modal-body">
                    {isCanvaMode ? (
                        <>
                            <div className="template-modal-field">
                                <label>Canva URL</label>
                                <div className="template-modal-url-row">
                                    <input
                                        type="url"
                                        value={canvaUrl}
                                        onChange={(e) => setCanvaUrl(e.target.value)}
                                        placeholder="https://www.canva.com/design/..."
                                        disabled={isLoadingPreview}
                                    />
                                    <button
                                        className="pabtn pabtn--s pabtn--secondary"
                                        onClick={handleLoadPreview}
                                        disabled={isLoadingPreview || !canvaUrl.trim()}
                                    >
                                        {isLoadingPreview ? 'Lädt...' : 'Vorschau laden'}
                                    </button>
                                </div>
                                {previewError && (
                                    <p className="template-modal-error">{previewError}</p>
                                )}
                                {notShareLinkError && (
                                    <div className="template-modal-share-error">
                                        <p>
                                            Diese URL ist kein Vorlagen-Link. Um die Vorlage zu teilen,
                                            musst du in Canva einen Vorlagen-Link erstellen.
                                        </p>
                                        <a
                                            href="https://www.canva.com/de_de/help/share-template-link/"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            Anleitung: Vorlagen-Link erstellen →
                                        </a>
                                    </div>
                                )}
                            </div>

                            {previewData && (
                                <div className="template-modal-preview">
                                    {previewData.thumbnail_url && (
                                        <div className="template-modal-preview-image">
                                            <img
                                                src={previewData.thumbnail_url}
                                                alt="Vorschau"
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
                                        </div>
                                    )}
                                    <div className="template-modal-preview-fields">
                                        <div className="template-modal-field">
                                            <label>Titel *</label>
                                            <input
                                                type="text"
                                                value={title}
                                                onChange={(e) => setTitle(e.target.value)}
                                                placeholder="Titel der Vorlage"
                                            />
                                        </div>
                                        <div className="template-modal-field">
                                            <label>Beschreibung</label>
                                            <div className="template-modal-textarea-wrapper">
                                                {renderGhostText()}
                                                <textarea
                                                    ref={tagAutocomplete.textareaRef}
                                                    value={description}
                                                    onChange={tagAutocomplete.handleChange}
                                                    onKeyDown={tagAutocomplete.handleKeyDown}
                                                    placeholder="Beschreibung der Vorlage..."
                                                    rows={3}
                                                />
                                            </div>
                                        </div>
                                        <div className="template-modal-field">
                                            <label>Autor*in</label>
                                            <input
                                                type="text"
                                                value={authorName}
                                                onChange={(e) => setAuthorName(e.target.value)}
                                                placeholder="Name des Erstellers"
                                            />
                                        </div>
                                        <div className="template-modal-field">
                                            <label>Kontakt E-Mail</label>
                                            <input
                                                type="email"
                                                value={contactEmail}
                                                onChange={(e) => setContactEmail(e.target.value)}
                                                placeholder="email@example.com"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <div className="template-modal-field">
                                <label>Titel *</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Titel der Vorlage"
                                />
                            </div>
                            <div className="template-modal-field">
                                <label>Beschreibung *</label>
                                <div className="template-modal-textarea-wrapper">
                                    {renderGhostText()}
                                    <textarea
                                        ref={tagAutocomplete.textareaRef}
                                        value={description}
                                        onChange={tagAutocomplete.handleChange}
                                        onKeyDown={tagAutocomplete.handleKeyDown}
                                        placeholder="Beschreibung der Vorlage..."
                                        rows={3}
                                    />
                                </div>
                            </div>
                            <div className="template-modal-field">
                                <label>URL *</label>
                                <input
                                    type="url"
                                    value={externalUrl}
                                    onChange={(e) => setExternalUrl(e.target.value)}
                                    placeholder="https://..."
                                />
                            </div>
                            <div className="template-modal-field">
                                <label>Autor*in</label>
                                <input
                                    type="text"
                                    value={authorName}
                                    onChange={(e) => setAuthorName(e.target.value)}
                                    placeholder="Name des Erstellers"
                                />
                            </div>
                            <div className="template-modal-field">
                                <label>Kontakt E-Mail</label>
                                <input
                                    type="email"
                                    value={contactEmail}
                                    onChange={(e) => setContactEmail(e.target.value)}
                                    placeholder="email@example.com"
                                />
                            </div>
                        </>
                    )}

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
                        {isSubmitting ? 'Wird erstellt...' : (groupId ? 'Hinzufügen' : 'Erstellen')}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};

export default AddTemplateModal;

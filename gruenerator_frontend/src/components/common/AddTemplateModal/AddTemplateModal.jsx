import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HiX } from 'react-icons/hi';
import { SiCanva } from 'react-icons/si';
import './AddTemplateModal.css';

const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

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
            const response = await fetch(`${AUTH_BASE_URL}/auth/user-templates/from-url`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: canvaUrl.trim(), preview: true })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Fehler beim Laden der Vorschau');
            }

            setPreviewData(data.preview);
            setDescription(data.preview.description || '');
        } catch (error) {
            setPreviewError(error.message || 'Fehler beim Laden der Vorschau');
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

                const response = await fetch(`${AUTH_BASE_URL}/auth/user-templates/from-url`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: canvaUrl.trim(),
                        title: title.trim(),
                        description: description.trim()
                    })
                });

                const data = await response.json();

                if (!response.ok || !data.success) {
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

                const response = await fetch(`${AUTH_BASE_URL}/auth/user-templates`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: title.trim(),
                        description: description.trim(),
                        canva_url: externalUrl.trim(),
                        template_type: 'external'
                    })
                });

                const data = await response.json();

                if (!response.ok || !data.success) {
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
    }, [mode, previewData, title, description, externalUrl, canvaUrl, groupId, onShareContent, onSuccess, onClose]);

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

    const modalContent = (
        <div className="add-template-modal-backdrop" onClick={handleBackdropClick}>
            <div className="add-template-modal" role="dialog" aria-modal="true" aria-labelledby="add-template-modal-title">
                <div className="add-template-modal-header">
                    <h2 id="add-template-modal-title">
                        {groupId ? 'Vorlage zur Gruppe hinzufügen' : 'Neue Vorlage erstellen'}
                    </h2>
                    <button
                        className="add-template-modal-close"
                        onClick={onClose}
                        aria-label="Schließen"
                    >
                        <HiX />
                    </button>
                </div>

                <div className="add-template-modal-tabs">
                    <button
                        className={`add-template-modal-tab ${isCanvaMode ? 'active' : ''}`}
                        onClick={() => setMode('canva')}
                    >
                        <SiCanva className="add-template-modal-tab-icon" />
                        <span>Canva</span>
                    </button>
                    <button
                        className={`add-template-modal-tab ${!isCanvaMode ? 'active' : ''}`}
                        onClick={() => setMode('other')}
                    >
                        <span>Andere Vorlage</span>
                    </button>
                </div>

                <div className="add-template-modal-body">
                    {isCanvaMode ? (
                        <>
                            <div className="add-template-modal-field">
                                <label>Canva URL</label>
                                <div className="add-template-modal-url-row">
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
                                    <p className="add-template-modal-error">{previewError}</p>
                                )}
                                {notShareLinkError && (
                                    <div className="add-template-modal-share-error">
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
                                <div className="add-template-modal-preview">
                                    {previewData.thumbnail_url && (
                                        <div className="add-template-modal-preview-image">
                                            <img
                                                src={previewData.thumbnail_url}
                                                alt="Vorschau"
                                                onError={(e) => { e.target.style.display = 'none'; }}
                                            />
                                        </div>
                                    )}
                                    <div className="add-template-modal-preview-fields">
                                        <div className="add-template-modal-field">
                                            <label>Titel *</label>
                                            <input
                                                type="text"
                                                value={title}
                                                onChange={(e) => setTitle(e.target.value)}
                                                placeholder="Titel der Vorlage"
                                            />
                                        </div>
                                        <div className="add-template-modal-field">
                                            <label>Beschreibung</label>
                                            <textarea
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                placeholder="Beschreibung der Vorlage..."
                                                rows={3}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <div className="add-template-modal-field">
                                <label>Titel *</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Titel der Vorlage"
                                />
                            </div>
                            <div className="add-template-modal-field">
                                <label>Beschreibung *</label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Beschreibung der Vorlage..."
                                    rows={3}
                                />
                            </div>
                            <div className="add-template-modal-field">
                                <label>URL *</label>
                                <input
                                    type="url"
                                    value={externalUrl}
                                    onChange={(e) => setExternalUrl(e.target.value)}
                                    placeholder="https://..."
                                />
                            </div>
                        </>
                    )}

                    {submitError && (
                        <p className="add-template-modal-error">{submitError}</p>
                    )}
                </div>

                <div className="add-template-modal-footer">
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

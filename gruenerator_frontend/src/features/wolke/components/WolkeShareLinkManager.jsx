import React, { useState, useCallback, useRef, useEffect } from 'react';
import { HiRefresh, HiClipboard, HiOutlineTrash, HiExternalLink, HiUpload, HiAcademicCap } from 'react-icons/hi';
import ProfileCard from '../../../components/common/ProfileCard';
import { validateShareLink, generateShareLinkDisplayName } from '../../../components/utils/nextcloudUtils';
import { useAutosave } from '../../../hooks/useAutosave';
import WolkeTutorial from './WolkeTutorial';

const WolkeShareLinkManager = ({
    shareLinks = [],
    loading = false,
    onAddShareLink,
    onDeleteShareLink,
    onTestConnection,
    onTestUpload,
    onRefresh,
    onSuccessMessage,
    onErrorMessage
}) => {
    const [newShareLink, setNewShareLink] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [testingConnections, setTestingConnections] = useState(new Set());
    const [uploadingFiles, setUploadingFiles] = useState(new Set());
    const [showTutorial, setShowTutorial] = useState(false);
    const isInitialized = useRef(false);

    // Autosave function for ShareLink form
    const autosaveShareLink = useCallback(async () => {
        if (!isInitialized.current || !newShareLink.trim()) return;
        
        const validation = validateShareLink(newShareLink);
        if (!validation.isValid) return; // Don't auto-save invalid links
        
        try {
            await onAddShareLink(newShareLink, newLabel);
            setNewShareLink('');
            setNewLabel('');
            onSuccessMessage('Wolke-Verbindung wurde automatisch hinzugefügt.');
        } catch (error) {
            // Silent failure for autosave - user can still manually save
            console.log('Autosave failed:', error.message);
        }
    }, [newShareLink, newLabel, onAddShareLink, onSuccessMessage]);

    // Auto-save hook
    const { resetTracking } = useAutosave({
        saveFunction: autosaveShareLink,
        formRef: {
            getValues: () => ({ newShareLink, newLabel }),
            watch: () => {} // Not needed for state-based
        },
        enabled: isInitialized.current,
        debounceMs: 3000, // Longer delay for external API calls
        getFieldsToTrack: () => ['newShareLink', 'newLabel'],
        onError: (error) => {
            console.error('ShareLink autosave failed:', error);
        }
    });

    // Initialize autosave tracking
    useEffect(() => {
        if (!isInitialized.current) {
            isInitialized.current = true;
            resetTracking();
        }
    }, [resetTracking]);

    const handleSubmitShareLink = async (e) => {
        e.preventDefault();
        
        const validation = validateShareLink(newShareLink);
        if (!validation.isValid) {
            onErrorMessage(validation.error);
            return;
        }

        setIsSubmitting(true);
        try {
            await onAddShareLink(newShareLink, newLabel);
            setNewShareLink('');
            setNewLabel('');
            onSuccessMessage('Wolke-Verbindung wurde erfolgreich hinzugefügt.');
        } catch (error) {
            onErrorMessage('Fehler beim Hinzufügen der Verbindung: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleTestConnection = async (shareLink) => {
        setTestingConnections(prev => new Set(prev).add(shareLink.id));
        try {
            const result = await onTestConnection(shareLink.share_link);
            if (result.success) {
                onSuccessMessage('Verbindung erfolgreich getestet!');
            } else {
                onErrorMessage('Verbindungstest fehlgeschlagen: ' + result.message);
            }
        } catch (error) {
            onErrorMessage('Fehler beim Testen der Verbindung: ' + error.message);
        } finally {
            setTestingConnections(prev => {
                const newSet = new Set(prev);
                newSet.delete(shareLink.id);
                return newSet;
            });
        }
    };

    const handleTestUpload = async (shareLink) => {
        setUploadingFiles(prev => new Set(prev).add(shareLink.id));
        
        // Create test file content with timestamp
        const timestamp = new Date().toLocaleString('de-DE');
        const testContent = `Grünerator Test-Datei

Diese Datei wurde automatisch erstellt, um die Wolke-Verbindung zu testen.

Erstellt am: ${timestamp}
ShareLink: ${shareLink.label || 'Unbenannt'}
Host: ${new URL(shareLink.share_link).hostname}

✅ Wenn Sie diese Datei sehen können, funktioniert die Verbindung korrekt!`;

        const filename = `test-gruenerator-${Date.now()}.txt`;

        try {
            const result = await onTestUpload(shareLink.id, testContent, filename);
            if (result.success) {
                onSuccessMessage(`Test-Datei "${filename}" erfolgreich hochgeladen!`);
            } else {
                onErrorMessage('Upload fehlgeschlagen: ' + result.message);
            }
        } catch (error) {
            onErrorMessage('Fehler beim Test-Upload: ' + error.message);
        } finally {
            setUploadingFiles(prev => {
                const newSet = new Set(prev);
                newSet.delete(shareLink.id);
                return newSet;
            });
        }
    };

    const handleCopyToClipboard = async (link) => {
        try {
            await navigator.clipboard.writeText(link);
            onSuccessMessage('Link wurde in die Zwischenablage kopiert.');
        } catch (error) {
            onErrorMessage('Fehler beim Kopieren: ' + error.message);
        }
    };

    const handleDeleteWithConfirm = async (shareLink) => {
        if (window.confirm(`Möchten Sie die Verbindung "${generateShareLinkDisplayName(shareLink, shareLink.label)}" wirklich löschen?`)) {
            try {
                await onDeleteShareLink(shareLink.id);
                onSuccessMessage('Wolke-Verbindung wurde gelöscht.');
            } catch (error) {
                onErrorMessage('Fehler beim Löschen: ' + error.message);
            }
        }
    };

    const handleTutorialOpen = () => {
        setShowTutorial(true);
    };

    const handleTutorialClose = () => {
        setShowTutorial(false);
    };

    if (loading) {
        return (
            <ProfileCard title="Share-Links werden geladen...">
                <div className="wolke-loading-state">
                    <p>Lade deine Wolke-Verbindungen...</p>
                </div>
            </ProfileCard>
        );
    }

    return (
        <ProfileCard 
            title="Wolke Integration"
            headerActions={
                <button
                    type="button"
                    className="btn-secondary size-s"
                    onClick={onRefresh}
                    disabled={loading}
                    title="Liste aktualisieren"
                >
                    <HiRefresh className="icon" />
                    Aktualisieren
                </button>
            }
        >
            <div className="wolke-share-manager-container">
                <div className="wolke-add-form-section">
                    <h4>Wolke-Verbindung hinzufügen</h4>
                    <p style={{ marginBottom: 'var(--spacing-medium)', color: 'var(--font-color-muted)' }}>
                        Links werden automatisch gespeichert, wenn sie gültig sind.
                    </p>
                    
                    {/* Tutorial section */}
                    <div className="wolke-setup-tutorial-section">
                        <button
                            type="button"
                            className="wolke-setup-tutorial-button"
                            onClick={handleTutorialOpen}
                        >
                            <HiAcademicCap size={18} />
                            Tutorial starten
                        </button>
                        <p className="wolke-setup-tutorial-description">
                            Schritt-für-Schritt Anleitung zum Erstellen eines Share-Links
                        </p>
                    </div>
                    <form onSubmit={handleSubmitShareLink} className="wolke-add-form">
                            <div className="wolke-form-group">
                                <label htmlFor="shareLink">Wolke Share-Link *</label>
                                <input
                                    type="url"
                                    id="shareLink"
                                    value={newShareLink}
                                    onChange={(e) => setNewShareLink(e.target.value)}
                                    placeholder="https://wolke.netzbegruenung.de/s/ABC123..."
                                    required
                                    disabled={isSubmitting}
                                />
                                <small className="wolke-form-hint">
                                    Gib einen öffentlichen, beschreibbaren Wolke-Share-Link ein.
                                </small>
                            </div>
                            
                            <div className="wolke-form-group">
                                <label htmlFor="label">Bezeichnung (optional)</label>
                                <input
                                    type="text"
                                    id="label"
                                    value={newLabel}
                                    onChange={(e) => setNewLabel(e.target.value)}
                                    placeholder="z.B. Ortsverband, Mein Ordner, Grünerator..."
                                    disabled={isSubmitting}
                                />
                            </div>
                            
                            <div className="wolke-form-actions">
                                <button
                                    type="submit"
                                    className="btn-primary"
                                    disabled={isSubmitting || !newShareLink.trim()}
                                >
                                    {isSubmitting ? 'Wird hinzugefügt...' : 'Hinzufügen'}
                                </button>
                            </div>
                        </form>
                </div>

                {shareLinks.length > 0 && (
                    <div className="wolke-share-links-list">
                        {shareLinks.map(shareLink => (
                            <div key={shareLink.id} className="wolke-share-link-item">
                                <div className="wolke-share-link-info">
                                    <div className="wolke-share-link-header">
                                        <h4 className="wolke-share-link-title">
                                            {shareLink.label || 'Unbenannter Share'}
                                        </h4>
                                        <div className="wolke-share-link-status">
                                            <span className={`status-badge ${shareLink.is_active ? 'active' : 'inactive'}`}>
                                                {shareLink.is_active ? 'Aktiv' : 'Inaktiv'}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div className="wolke-share-link-details">
                                        <span className="wolke-share-link-url">
                                            {new URL(shareLink.share_link).hostname}
                                        </span>
                                        <span className="wolke-share-link-date">
                                            Hinzugefügt am {new Date(shareLink.created_at).toLocaleDateString('de-DE')}
                                        </span>
                                    </div>
                                </div>
                                
                                <div className="wolke-share-link-actions">
                                    <button
                                        type="button"
                                        className="btn-action"
                                        onClick={() => handleTestConnection(shareLink)}
                                        disabled={testingConnections.has(shareLink.id) || !shareLink.is_active}
                                        title="Verbindung testen"
                                    >
                                        <HiRefresh className={testingConnections.has(shareLink.id) ? 'spinning' : ''} />
                                    </button>
                                    
                                    <button
                                        type="button"
                                        className="btn-action"
                                        onClick={() => handleTestUpload(shareLink)}
                                        disabled={uploadingFiles.has(shareLink.id) || !shareLink.is_active}
                                        title="Test-Datei hochladen"
                                    >
                                        <HiUpload className={uploadingFiles.has(shareLink.id) ? 'spinning' : ''} />
                                    </button>
                                    
                                    <button
                                        type="button"
                                        className="btn-action"
                                        onClick={() => handleCopyToClipboard(shareLink.share_link)}
                                        title="Link kopieren"
                                    >
                                        <HiClipboard />
                                    </button>
                                    
                                    <button
                                        type="button"
                                        className="btn-action"
                                        onClick={() => window.open(shareLink.share_link, '_blank')}
                                        title="In neuem Tab öffnen"
                                    >
                                        <HiExternalLink />
                                    </button>
                                    
                                    <button
                                        type="button"
                                        className="btn-action btn-danger"
                                        onClick={() => handleDeleteWithConfirm(shareLink)}
                                        title="Löschen"
                                    >
                                        <HiOutlineTrash />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            
            {/* Tutorial overlay */}
            {showTutorial && (
                <WolkeTutorial onClose={handleTutorialClose} />
            )}
        </ProfileCard>
    );
};

export default WolkeShareLinkManager;
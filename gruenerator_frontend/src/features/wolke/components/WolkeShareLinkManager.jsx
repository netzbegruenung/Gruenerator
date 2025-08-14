import React, { useState } from 'react';
import { HiPlus, HiRefresh, HiUpload, HiClipboard, HiOutlineTrash, HiExternalLink, HiExclamationCircle } from 'react-icons/hi';
import ProfileCard from '../../../components/common/ProfileCard';
import EmptyState from '../../../components/common/EmptyState';
import { validateShareLink, generateShareLinkDisplayName } from '../../../components/utils/nextcloudUtils';

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
    const [showAddForm, setShowAddForm] = useState(false);
    const [newShareLink, setNewShareLink] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [testingConnections, setTestingConnections] = useState(new Set());
    const [uploadingFiles, setUploadingFiles] = useState(new Set());

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
            setShowAddForm(false);
            onSuccessMessage('Nextcloud-Verbindung wurde erfolgreich hinzugefügt.');
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
        try {
            const result = await onTestUpload(shareLink.id);
            if (result.success) {
                onSuccessMessage('Test-Datei erfolgreich hochgeladen!');
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
                onSuccessMessage('Nextcloud-Verbindung wurde gelöscht.');
            } catch (error) {
                onErrorMessage('Fehler beim Löschen: ' + error.message);
            }
        }
    };

    if (loading) {
        return (
            <ProfileCard title="Share-Links werden geladen...">
                <div className="wolke-loading-state">
                    <p>Lade deine Nextcloud-Verbindungen...</p>
                </div>
            </ProfileCard>
        );
    }

    return (
        <ProfileCard 
            title="Nextcloud Share-Links verwalten"
            headerActions={
                <div style={{ display: 'flex', gap: 'var(--spacing-small)' }}>
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
                    <button
                        type="button"
                        className="btn-primary size-s"
                        onClick={() => setShowAddForm(!showAddForm)}
                        disabled={loading}
                    >
                        <HiPlus className="icon" />
                        Share-Link hinzufügen
                    </button>
                </div>
            }
        >
            <div className="wolke-share-manager-container">
                {showAddForm && (
                    <div className="wolke-add-form-section">
                        <form onSubmit={handleSubmitShareLink} className="wolke-add-form">
                            <div className="wolke-form-group">
                                <label htmlFor="shareLink">Nextcloud Share-Link *</label>
                                <input
                                    type="url"
                                    id="shareLink"
                                    value={newShareLink}
                                    onChange={(e) => setNewShareLink(e.target.value)}
                                    placeholder="https://cloud.example.com/s/ABC123..."
                                    required
                                    disabled={isSubmitting}
                                />
                                <small className="wolke-form-hint">
                                    Gib einen öffentlichen, beschreibbaren Nextcloud-Share-Link ein.
                                </small>
                            </div>
                            
                            <div className="wolke-form-group">
                                <label htmlFor="label">Bezeichnung (optional)</label>
                                <input
                                    type="text"
                                    id="label"
                                    value={newLabel}
                                    onChange={(e) => setNewLabel(e.target.value)}
                                    placeholder="z.B. Arbeitsordner, Projektdateien..."
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
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => {
                                        setShowAddForm(false);
                                        setNewShareLink('');
                                        setNewLabel('');
                                    }}
                                    disabled={isSubmitting}
                                >
                                    Abbrechen
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {shareLinks.length === 0 ? (
                    <EmptyState
                        icon={HiExclamationCircle}
                        title="Keine Share-Links vorhanden"
                        description="Füge deinen ersten Nextcloud Share-Link hinzu, um loszulegen."
                    >
                        {!showAddForm && (
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={() => setShowAddForm(true)}
                                style={{ marginTop: 'var(--spacing-medium)' }}
                            >
                                <HiPlus className="icon" />
                                Ersten Share-Link hinzufügen
                            </button>
                        )}
                    </EmptyState>
                ) : (
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
                                        title="Test-Upload"
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
        </ProfileCard>
    );
};

export default WolkeShareLinkManager;
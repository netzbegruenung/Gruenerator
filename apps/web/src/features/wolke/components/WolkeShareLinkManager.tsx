import React, { useState, useCallback, useRef, useEffect } from 'react';
import ProfileCard from '../../../components/common/ProfileCard';
import { NextcloudShareManager, ShareLink } from '../../../utils/nextcloudShareManager';
import { useAutosave } from '../../../hooks/useAutosave';
import { useWolkeStore } from '../../../stores/wolkeStore';
import { getIcon } from '../../../config/icons';

// Wolke Feature CSS - Loaded only when this feature is accessed
import '../../../assets/styles/features/wolke/wolke.css';
// Import ProfileActionButton CSS for consistent button styling
import '../../../assets/styles/components/profile/profile-action-buttons.css';

/** Result type for connection/upload test operations */
interface TestResult {
    success: boolean;
    message?: string;
}

/** Props interface for WolkeShareLinkManager component */
interface WolkeShareLinkManagerProps {
    /** Share links array for backward compatibility - will be used if provided */
    shareLinks?: ShareLink[];
    /** Loading state for backward compatibility */
    loading?: boolean;
    /** Callback to add a new share link */
    onAddShareLink?: (shareLink: string, label: string) => Promise<ShareLink | void>;
    /** Callback to delete a share link by ID */
    onDeleteShareLink?: (shareLinkId: string) => Promise<void>;
    /** Callback to test a share link connection */
    onTestConnection?: (shareLink: string) => Promise<TestResult>;
    /** Callback to test file upload */
    onTestUpload?: (shareLinkId: string, content: string, filename: string) => Promise<TestResult>;
    /** Callback to refresh share links */
    onRefresh?: () => void;
    /** Callback to display success message */
    onSuccessMessage?: (message: string) => void;
    /** Callback to display error message */
    onErrorMessage?: (message: string) => void;
    /** Flag to disable store usage (for explicit prop usage) */
    useStore?: boolean;
}

const WolkeShareLinkManager: React.FC<WolkeShareLinkManagerProps> = ({
    // Props for backward compatibility - will be used if provided
    shareLinks: propShareLinks,
    loading: propLoading,
    onAddShareLink: propOnAddShareLink,
    onDeleteShareLink: propOnDeleteShareLink,
    onTestConnection: propOnTestConnection,
    onTestUpload: propOnTestUpload,
    onRefresh: propOnRefresh,
    onSuccessMessage: propOnSuccessMessage,
    onErrorMessage: propOnErrorMessage,
    // New prop to disable store usage (for explicit prop usage)
    useStore = true
}) => {
    // Zustand store integration
    const {
        shareLinks: storeShareLinks,
        isLoading: storeLoading,
        error: storeError,
        successMessage: storeSuccessMessage,
        permissions,
        scope,
        scopeId,
        initialized: storeInitialized,
        fetchShareLinks: storeFetchShareLinks,
        addShareLink: storeAddShareLink,
        deleteShareLink: storeDeleteShareLink,
        testConnection: storeTestConnection,
        uploadTest: storeUploadTest,
        clearMessages,
        setError,
        setSuccessMessage
    } = useWolkeStore();

    // Use store values if no props provided and store is enabled
    const shareLinks = (!useStore || propShareLinks !== undefined) ? propShareLinks || [] : storeShareLinks;
    const loading = (!useStore || propLoading !== undefined) ? propLoading || false : storeLoading;

    const [newShareLink, setNewShareLink] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [testingConnections, setTestingConnections] = useState(new Set());
    const [uploadingFiles, setUploadingFiles] = useState(new Set());
    const isInitialized = useRef(false);

    // Autosave function for ShareLink form
    const autosaveShareLink = useCallback(async () => {
        if (!isInitialized.current || !newShareLink.trim()) return;

        const validation = NextcloudShareManager.validateShareLink(newShareLink);
        if (!validation.isValid) return; // Don't auto-save invalid links

        try {
            if (useStore && !propOnAddShareLink) {
                // Use store method
                await storeAddShareLink(newShareLink, newLabel);
            } else if (propOnAddShareLink) {
                // Use prop method
                await propOnAddShareLink(newShareLink, newLabel);
                if (propOnSuccessMessage) {
                    propOnSuccessMessage('Wolke-Verbindung wurde automatisch hinzugefügt.');
                }
            }
            setNewShareLink('');
            setNewLabel('');
        } catch (error) {
            // Silent failure for autosave - user can still manually save
            if (error instanceof Error) {
                console.log('Autosave failed:', error.message);
            }
        }
    }, [newShareLink, newLabel, useStore, propOnAddShareLink, storeAddShareLink, propOnSuccessMessage]);

    // Auto-save hook
    const { resetTracking } = useAutosave({
        saveFunction: autosaveShareLink,
        formRef: {
            getValues: () => ({ newShareLink, newLabel }),
            watch: (callback) => {
                // Not needed for state-based, return empty subscription
                return { unsubscribe: undefined };
            }
        },
        enabled: isInitialized.current,
        debounceMs: 3000, // Longer delay for external API calls
        getFieldsToTrack: () => ['newShareLink', 'newLabel'],
        onError: (error: unknown) => {
            if (error instanceof Error) {
                console.error('ShareLink autosave failed:', error);
            }
        }
    });

    // Initialize autosave tracking
    useEffect(() => {
        if (!isInitialized.current) {
            isInitialized.current = true;
            resetTracking();
        }
    }, [resetTracking]);

    const handleSubmitShareLink = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const validation = NextcloudShareManager.validateShareLink(newShareLink);
        if (!validation.isValid) {
            if (useStore) {
                setError(validation.error || 'Ungültiger Share-Link');
            } else if (propOnErrorMessage) {
                propOnErrorMessage(validation.error || 'Ungültiger Share-Link');
            }
            return;
        }

        setIsSubmitting(true);
        try {
            if (useStore && !propOnAddShareLink) {
                // Use store method
                await storeAddShareLink(newShareLink, newLabel);
            } else if (propOnAddShareLink) {
                // Use prop method
                await propOnAddShareLink(newShareLink, newLabel);
                if (propOnSuccessMessage) {
                    propOnSuccessMessage('Wolke-Verbindung wurde erfolgreich hinzugefügt.');
                }
            }
            setNewShareLink('');
            setNewLabel('');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
            if (useStore && !propOnErrorMessage) {
                setError('Fehler beim Hinzufügen der Verbindung: ' + errorMessage);
            } else if (propOnErrorMessage) {
                propOnErrorMessage('Fehler beim Hinzufügen der Verbindung: ' + errorMessage);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleTestConnection = async (shareLink: ShareLink) => {
        setTestingConnections(prev => new Set(prev).add(shareLink.id));
        try {
            let result: TestResult | undefined;
            if (useStore && !propOnTestConnection) {
                result = await storeTestConnection(shareLink.share_link || '');
            } else if (propOnTestConnection) {
                result = await propOnTestConnection(shareLink.share_link || '');
            }

            if (result?.success) {
                if (useStore && !propOnSuccessMessage) {
                    setSuccessMessage('Verbindung erfolgreich getestet!');
                } else if (propOnSuccessMessage) {
                    propOnSuccessMessage('Verbindung erfolgreich getestet!');
                }
            } else {
                const message = 'Verbindungstest fehlgeschlagen: ' + (result?.message || 'Unbekannter Fehler');
                if (useStore && !propOnErrorMessage) {
                    setError(message);
                } else if (propOnErrorMessage) {
                    propOnErrorMessage(message);
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
            const message = 'Fehler beim Testen der Verbindung: ' + errorMessage;
            if (useStore && !propOnErrorMessage) {
                setError(message);
            } else if (propOnErrorMessage) {
                propOnErrorMessage(message);
            }
        } finally {
            setTestingConnections(prev => {
                const newSet = new Set(prev);
                newSet.delete(shareLink.id);
                return newSet;
            });
        }
    };

    const handleTestUpload = async (shareLink: ShareLink) => {
        setUploadingFiles(prev => new Set(prev).add(shareLink.id));

        // Create test file content with timestamp
        const timestamp = new Date().toLocaleString('de-DE');
        const contextLabel = scope === 'group' ? `Gruppe` : 'Persönlich';
        const testContent = `Grünerator Test-Datei

Diese Datei wurde automatisch erstellt, um die Wolke-Verbindung zu testen.

Erstellt am: ${timestamp}
ShareLink: ${shareLink.label || 'Unbenannt'}
Host: ${shareLink.share_link ? new URL(shareLink.share_link).hostname : 'Unbekannt'}
Kontext: ${contextLabel}

✅ Wenn Sie diese Datei sehen können, funktioniert die Verbindung korrekt!`;

        const filename = `test-gruenerator-${Date.now()}.txt`;

        try {
            let result;
            if (useStore && !propOnTestUpload) {
                result = await storeUploadTest(shareLink.id, testContent, filename);
            } else if (propOnTestUpload) {
                result = await propOnTestUpload(shareLink.id, testContent, filename);
            }

            if (result?.success) {
                const message = `Test-Datei "${filename}" erfolgreich hochgeladen!`;
                if (useStore && !propOnSuccessMessage) {
                    setSuccessMessage(message);
                } else if (propOnSuccessMessage) {
                    propOnSuccessMessage(message);
                }
            } else {
                const message = 'Upload fehlgeschlagen: ' + (result?.message || 'Unbekannter Fehler');
                if (useStore && !propOnErrorMessage) {
                    setError(message);
                } else if (propOnErrorMessage) {
                    propOnErrorMessage(message);
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
            const message = 'Fehler beim Test-Upload: ' + errorMessage;
            if (useStore && !propOnErrorMessage) {
                setError(message);
            } else if (propOnErrorMessage) {
                propOnErrorMessage(message);
            }
        } finally {
            setUploadingFiles(prev => {
                const newSet = new Set(prev);
                newSet.delete(shareLink.id);
                return newSet;
            });
        }
    };

    const handleCopyToClipboard = async (link: string) => {
        try {
            await navigator.clipboard.writeText(link);
            const message = 'Link wurde in die Zwischenablage kopiert.';
            if (useStore && !propOnSuccessMessage) {
                setSuccessMessage(message);
            } else if (propOnSuccessMessage) {
                propOnSuccessMessage(message);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
            const message = 'Fehler beim Kopieren: ' + errorMessage;
            if (useStore && !propOnErrorMessage) {
                setError(message);
            } else if (propOnErrorMessage) {
                propOnErrorMessage(message);
            }
        }
    };

    const handleDeleteWithConfirm = async (shareLink: ShareLink) => {
        const contextLabel = scope === 'group' ? 'aus der Gruppe' : '';
        const confirmMessage = `Möchten Sie die Verbindung "${NextcloudShareManager.generateDisplayName(shareLink)}" ${contextLabel} wirklich löschen?`;

        if (window.confirm(confirmMessage)) {
            try {
                if (useStore && !propOnDeleteShareLink) {
                    await storeDeleteShareLink(shareLink.id);
                } else if (propOnDeleteShareLink) {
                    await propOnDeleteShareLink(shareLink.id);
                    const message = scope === 'group'
                        ? 'Wolke-Link wurde aus der Gruppe entfernt.'
                        : 'Wolke-Verbindung wurde gelöscht.';
                    if (propOnSuccessMessage) {
                        propOnSuccessMessage(message);
                    }
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
                const message = 'Fehler beim Löschen: ' + errorMessage;
                if (useStore && !propOnErrorMessage) {
                    setError(message);
                } else if (propOnErrorMessage) {
                    propOnErrorMessage(message);
                }
            }
        }
    };

    const handleRefresh = () => {
        if (useStore && !propOnRefresh) {
            storeFetchShareLinks();
        } else if (propOnRefresh) {
            propOnRefresh();
        }
    };

    // Initialize store if needed
    useEffect(() => {
        if (useStore && !propShareLinks && !storeInitialized && !loading) {
            console.log('[WolkeShareLinkManager] Fetching share links for scope:', scope, scopeId);
            storeFetchShareLinks();
        }
    }, [useStore, propShareLinks, storeInitialized, loading, scope, scopeId]); // Use initialized instead of shareLinks.length

    // Show context-appropriate messages
    const showStoreMessages = useStore && !propOnSuccessMessage && !propOnErrorMessage;
    const currentError = showStoreMessages ? storeError : null;
    const currentSuccessMessage = showStoreMessages ? storeSuccessMessage : null;

    // Auto-clear store messages
    useEffect(() => {
        if (showStoreMessages && (storeError || storeSuccessMessage)) {
            const timer = setTimeout(() => {
                clearMessages();
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [showStoreMessages, storeError, storeSuccessMessage, clearMessages]);

    // Permission checks for group context
    const canAddLinks = scope === 'personal' || permissions.canAddLinks;
    const canDeleteLinks = scope === 'personal' || permissions.canDeleteLinks;

    if (loading) {
        return (
            <div className="wolke-share-manager-container">
                <ProfileCard title="Wolke-Verbindungen werden geladen...">
                    <div className="wolke-loading-state">
                        <p>Lade deine Wolke-Verbindungen...</p>
                    </div>
                </ProfileCard>
            </div>
        );
    }

    return (
        <div className="wolke-share-manager-container">
            {/* Context Messages */}
            {currentError && (
                <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                    {currentError}
                </div>
            )}
            {currentSuccessMessage && (
                <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
                    {currentSuccessMessage}
                </div>
            )}

            {/* Add Share Link Card */}
            <ProfileCard title={scope === 'group' ? 'Wolke-Link zur Gruppe hinzufügen' : 'Wolke-Verbindung hinzufügen'}>
                <div className="wolke-add-form-content">
                    <p className="wolke-form-description">
                        {scope === 'group'
                            ? 'Nur Gruppenadministratoren können Wolke-Links hinzufügen.'
                            : 'Links werden automatisch gespeichert, wenn sie gültig sind.'
                        }
                        {' '}Eine detaillierte Schritt-für-Schritt Anleitung zum Erstellen eines Share-Links findest du <a href="https://doku.services.moritz-waechter.de/docs/Profil/gruene-wolke-tutorial" target="_blank" rel="noopener noreferrer">hier</a> in unserer Dokumentation.
                    </p>

                    {!canAddLinks && (
                        <div className="wolke-permission-notice">
                            <p>⚠️ Sie haben keine Berechtigung, Wolke-Links zu dieser Gruppe hinzuzufügen.</p>
                        </div>
                    )}

                    {canAddLinks && (
                        <form onSubmit={handleSubmitShareLink} className="wolke-add-form">
                        <div className="wolke-form-group">
                            <label htmlFor="shareLink">Wolke Share-Link *</label>
                            <input
                                type="url"
                                id="shareLink"
                                value={newShareLink}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewShareLink(e.target.value)}
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
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewLabel(e.target.value)}
                                placeholder="z.B. Ortsverband, Mein Ordner, Grünerator..."
                                disabled={isSubmitting}
                            />
                        </div>

                        <div className="wolke-form-actions">
                            <button
                                type="submit"
                                className="pabtn pabtn--primary pabtn--s"
                                disabled={isSubmitting || !newShareLink.trim()}
                            >
                                <span className="pabtn__label">{isSubmitting ? 'Wird hinzugefügt...' : 'Hinzufügen'}</span>
                            </button>
                        </div>
                    </form>
                    )}
                </div>
            </ProfileCard>

            {/* Share Links List Card */}
            {shareLinks.length > 0 && (
                <ProfileCard
                    title={`Meine Wolke-Verbindungen (${shareLinks.length})`}
                    headerActions={
                        <button
                            type="button"
                            className="pabtn pabtn--secondary pabtn--s"
                            onClick={handleRefresh}
                            disabled={loading}
                            title="Liste aktualisieren"
                        >
                            {React.createElement(getIcon('actions', 'refresh') as React.ElementType, { className: 'pabtn__icon' })}
                            <span className="pabtn__label">Aktualisieren</span>
                        </button>
                    }
                >
                    <div className="wolke-share-links-list">
                        {shareLinks.map((shareLink: ShareLink) => (
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
                                            {shareLink.share_link ? new URL(shareLink.share_link).hostname : 'Unbekannter Host'}
                                        </span>
                                        <span className="wolke-share-link-date">
                                            Hinzugefügt am {shareLink.created_at ? new Date(shareLink.created_at).toLocaleDateString('de-DE') : 'Unbekanntes Datum'}
                                        </span>
                                    </div>
                                </div>

                                <div className="wolke-share-link-actions">
                                    <button
                                        type="button"
                                        className="pabtn pabtn--ghost pabtn--s"
                                        onClick={() => handleTestConnection(shareLink)}
                                        disabled={testingConnections.has(shareLink.id) || !shareLink.is_active}
                                        title="Verbindung testen"
                                    >
                                        {React.createElement(getIcon('actions', 'refresh') as React.ElementType, { className: `pabtn__icon ${testingConnections.has(shareLink.id) ? 'spinning' : ''}` })}
                                    </button>

                                    <button
                                        type="button"
                                        className="pabtn pabtn--ghost pabtn--s"
                                        onClick={() => handleTestUpload(shareLink)}
                                        disabled={uploadingFiles.has(shareLink.id) || !shareLink.is_active}
                                        title="Test-Datei hochladen"
                                    >
                                        {React.createElement(getIcon('actions', 'upload') as React.ElementType, { className: `pabtn__icon ${uploadingFiles.has(shareLink.id) ? 'spinning' : ''}` })}
                                    </button>

                                    <button
                                        type="button"
                                        className="pabtn pabtn--ghost pabtn--s"
                                        onClick={() => handleCopyToClipboard(shareLink.share_link || '')}
                                        title="Link kopieren"
                                    >
                                        {React.createElement(getIcon('actions', 'copy') as React.ElementType, { className: 'pabtn__icon' })}
                                    </button>

                                    <button
                                        type="button"
                                        className="pabtn pabtn--ghost pabtn--s"
                                        onClick={() => window.open(shareLink.share_link || '', '_blank')}
                                        title="In neuem Tab öffnen"
                                    >
                                        {React.createElement(getIcon('actions', 'share') as React.ElementType, { className: 'pabtn__icon' })}
                                    </button>

                                    {canDeleteLinks && (
                                        <button
                                            type="button"
                                            className="pabtn pabtn--delete pabtn--s"
                                            onClick={() => handleDeleteWithConfirm(shareLink)}
                                            title="Löschen"
                                        >
                                            {React.createElement(getIcon('actions', 'delete') as React.ElementType, { className: 'pabtn__icon' })}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </ProfileCard>
            )}

            {/* Empty state for no share links */}
            {shareLinks.length === 0 && !loading && (
                <ProfileCard
                    title="Meine Wolke-Verbindungen"
                    headerActions={
                        <button
                            type="button"
                            className="pabtn pabtn--secondary pabtn--s"
                            onClick={handleRefresh}
                            disabled={loading}
                            title="Liste aktualisieren"
                        >
                            {React.createElement(getIcon('actions', 'refresh') as React.ElementType, { className: 'pabtn__icon' })}
                            <span className="pabtn__label">Aktualisieren</span>
                        </button>
                    }
                >
                    <div className="wolke-empty-state">
                        <p>Du hast noch keine Wolke-Verbindungen eingerichtet.</p>
                        <p>Füge oben einen Share-Link hinzu, um zu beginnen.</p>
                    </div>
                </ProfileCard>
            )}
        </div>
    );
};

export default WolkeShareLinkManager;

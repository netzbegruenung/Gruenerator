import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useWolkeSync } from '../hooks/useWolkeSync';
import WolkeFolderBrowser from './WolkeFolderBrowser';
import './WolkeSyncManager.css';
import { getIcon } from '../../../config/icons';
// Import ProfileActionButton CSS for consistent button styling
import '../../../assets/styles/components/profile/profile-action-buttons.css';

export const WolkeSyncManager = ({ wolkeShareLinks = [], onRefreshShareLinks, onSyncComplete }) => {
    const [selectedFolder, setSelectedFolder] = useState(null);
    const [showBrowser, setShowBrowser] = useState(true);
    const [shareLinksLoading, setShareLinksLoading] = useState(true);
    const navigate = useNavigate();

    const {
        syncStatuses,
        loading,
        error,
        syncFolder,
        setAutoSync,
        initialized,
        refresh: refreshSyncStatuses
    } = useWolkeSync();

    const hasWolkeFolders = syncStatuses.length > 0;
    const hasShareLinks = Array.isArray(wolkeShareLinks) && wolkeShareLinks.length > 0;

    // Track when share links have been loaded at least once and ensure sync statuses are loaded
    useEffect(() => {
        if (Array.isArray(wolkeShareLinks)) {
            setShareLinksLoading(false);

            // When share links are loaded, ensure sync statuses are also loaded
            if (wolkeShareLinks.length > 0 && (!syncStatuses || syncStatuses.length === 0)) {
                console.log('[WolkeSyncManager] Share links loaded, ensuring sync statuses are fetched...');
                refreshSyncStatuses().catch(error => {
                    console.error('[WolkeSyncManager] Failed to refresh sync statuses:', error);
                });
            }
        }
    }, [wolkeShareLinks, syncStatuses, refreshSyncStatuses]);

    console.log('[WolkeSyncManager] State check:', {
        hasWolkeFolders,
        hasShareLinks,
        shareLinksCount: wolkeShareLinks?.length || 0,
        syncStatusesCount: syncStatuses.length,
        shareLinksLoading,
        initialized,
        loading
    });

    const handleFolderSelect = (folder) => {
        setSelectedFolder(folder);
        setShowBrowser(false);
    };

    const handleBackToBrowser = () => {
        setShowBrowser(true);
        setSelectedFolder(null);
    };

    const handleSyncFolder = async (shareLinkId, folderPath = '') => {
        try {
            await syncFolder(shareLinkId, folderPath);
            // Call sync complete callback to refresh documents
            if (onSyncComplete) {
                onSyncComplete();
            }
        } catch (error) {
            console.error(`Failed to sync folder ${shareLinkId}:`, error);
        }
    };

    const handleConfigureWolke = () => {
        navigate('/profile/integrationen/wolke');
    };

    // Show loading state while either sync status or share links are loading
    if ((loading && !initialized) || shareLinksLoading) {
        return (
            <div className="wolke-sync-manager wolke-loading">
                <div className="manager-header">
                    <div className="title-section">
                        <h2>Wolke-Integration wird geladen...</h2>
                        <p className="subtitle">Lade Konfiguration und Verbindungen...</p>
                    </div>
                </div>
                <div className="wolke-configure-prompt">
                    <div className="configure-message">
                        <p>Einen Moment bitte...</p>
                    </div>
                </div>
            </div>
        );
    }

    // Show setup UI only when no share links are configured at all AND we're done loading
    if (initialized && !shareLinksLoading && !hasShareLinks && !loading) {
        const title = "Wolke-Integration einrichten";
        const subtitle = "Keine Wolke-Verbindungen vorhanden";
        const message = "Richte zunächst deine Nextcloud-Verbindungen ein, um die Wolke-Synchronisation zu nutzen.";
        const buttonText = "Wolke-Verbindung einrichten";

        return (
            <div className="wolke-sync-manager wolke-not-configured">
                <div className="manager-header">
                    <div className="title-section">
                        <h2>{title}</h2>
                        <p className="subtitle">{subtitle}</p>
                    </div>

                    {onRefreshShareLinks && (
                        <div className="header-actions">
                            <button
                                className="pabtn pabtn--secondary pabtn--s"
                                onClick={() => {
                                    console.log('[WolkeSyncManager] Refresh button clicked');
                                    setShareLinksLoading(true);
                                    if (onRefreshShareLinks) {
                                        onRefreshShareLinks(true);
                                    }
                                }}
                                disabled={shareLinksLoading}
                                title="Nach neuen Wolke-Verbindungen suchen"
                            >
                                {React.createElement(getIcon('actions', 'refresh'), { className: `pabtn__icon ${shareLinksLoading ? 'spinning' : ''}` })}
                                <span className="pabtn__label">{shareLinksLoading ? 'Wird aktualisiert...' : 'Aktualisieren'}</span>
                            </button>
                        </div>
                    )}
                </div>

                <div className="wolke-configure-prompt">
                    <div className="configure-message">
                        <p>{message}</p>
                        <button
                            className="pabtn pabtn--primary pabtn--m"
                            onClick={handleConfigureWolke}
                        >
                            {React.createElement(getIcon('actions', 'cloud'), { className: 'pabtn__icon' })}
                            <span className="pabtn__label">{buttonText}</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="wolke-sync-manager">
            <div className="wolke-header-minimal">
                <h2>Wolke-Synchronisation</h2>
                {!showBrowser && selectedFolder && (
                    <button
                        className="pabtn pabtn--ghost pabtn--s"
                        onClick={handleBackToBrowser}
                    >
                        <span className="pabtn__label">← Zurück</span>
                    </button>
                )}
            </div>

            {error && (
                <motion.div
                    className="error-banner"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    {error}
                </motion.div>
            )}

            {/* Share links list with sync toggles */}
            {hasShareLinks ? (
                <ShareLinksWithSync
                    shareLinks={wolkeShareLinks}
                    syncStatuses={syncStatuses}
                    onSyncFolder={handleSyncFolder}
                    onSyncComplete={onSyncComplete}
                    refreshSyncStatuses={refreshSyncStatuses}
                />
            ) : (
                <div className="wolke-no-folders">
                    <p>Noch keine Ordner für die Synchronisation eingerichtet.</p>
                </div>
            )}

        </div>
    );
};

// Share links with sync toggle component
const ShareLinksWithSync = ({ shareLinks, syncStatuses, onSyncFolder, onSyncComplete, refreshSyncStatuses }: { shareLinks: any[]; syncStatuses: any[]; onSyncFolder: (shareLinkId: string, folderPath: string) => Promise<void>; onSyncComplete?: () => void; refreshSyncStatuses?: () => Promise<any> }) => {
    const [syncingFolders, setSyncingFolders] = useState(new Set());
    const { setAutoSync } = useWolkeSync();

    const handleSyncFolder = async (shareLinkId, folderPath) => {
        setSyncingFolders(prev => new Set(prev).add(`${shareLinkId}-${folderPath || ''}`));
        try {
            await onSyncFolder(shareLinkId, folderPath);
        } finally {
            setSyncingFolders(prev => {
                const newSet = new Set(prev);
                newSet.delete(`${shareLinkId}-${folderPath || ''}`);
                return newSet;
            });
        }
    };

    const getSyncStatus = (shareLinkId) => {
        const syncStatus = syncStatuses.find(status => status.share_link_id === shareLinkId);
        return syncStatus ? syncStatus : null;
    };

    // Debug logging for checkbox state
    useEffect(() => {
        if (shareLinks.length > 0 && syncStatuses.length > 0) {
            console.log('[ShareLinksWithSync] Sync status check:', {
                shareLinksCount: shareLinks.length,
                syncStatusesCount: syncStatuses.length,
                syncStatuses: syncStatuses.map(status => ({
                    shareLink: status.share_link_id,
                    autoSync: status.auto_sync_enabled
                }))
            });
        }
    }, [shareLinks, syncStatuses]);

    const getSimpleStatus = (status) => {
        switch (status) {
            case 'syncing': return 'Synchronisiert...';
            case 'completed': return 'Bereit';
            case 'failed': return 'Fehler';
            case 'idle': default: return 'Bereit';
        }
    };

    return (
        <div className="wolke-share-links-simple">
            {shareLinks.map((shareLink) => {
                const syncStatus = getSyncStatus(shareLink.id);
                // Improved: More robust checkbox state determination with explicit boolean conversion
                const isSyncEnabled = Boolean(syncStatus?.auto_sync_enabled);
                const isCurrentlySyncing = syncingFolders.has(`${shareLink.id}-`) || syncStatus?.sync_status === 'syncing';

                // Debug log for each checkbox
                if (process.env.NODE_ENV === 'development') {
                    console.log(`[ShareLinksWithSync] Checkbox state for ${shareLink.id}:`, {
                        syncStatus: syncStatus,
                        autoSyncEnabled: syncStatus?.auto_sync_enabled,
                        isSyncEnabled: isSyncEnabled,
                        rawValue: syncStatus?.auto_sync_enabled
                    });
                }

                return (
                    <div key={shareLink.id} className="wolke-share-link-card">
                        <div className="share-link-info">
                            <div className="share-link-header">
                                <input
                                    type="checkbox"
                                    checked={isSyncEnabled}
                                    onChange={async (e) => {
                                        const newCheckedState = e.target.checked;
                                        console.log(`[ShareLinksWithSync] Toggling auto-sync for ${shareLink.id} to:`, newCheckedState);

                                        try {
                                            const result = await setAutoSync(shareLink.id, '', newCheckedState);
                                            console.log(`[ShareLinksWithSync] Auto-sync toggle result:`, result);

                                            // Force refresh sync statuses to update UI state immediately
                                            setTimeout(async () => {
                                                try {
                                                    await refreshSyncStatuses();
                                                    if (onSyncComplete) {
                                                        onSyncComplete();
                                                    }
                                                } catch (refreshError) {
                                                    console.error('[ShareLinksWithSync] Failed to refresh sync statuses:', refreshError);
                                                }
                                            }, 100);

                                            // If auto-sync was successfully enabled, immediately trigger a sync
                                            if (result && result.success && result.autoSyncEnabled && newCheckedState) {
                                                console.log('[WolkeSyncManager] Auto-sync enabled, triggering immediate sync...');
                                                try {
                                                    await handleSyncFolder(shareLink.id, '');
                                                    console.log('[WolkeSyncManager] Auto-sync initial sync completed');
                                                } catch (syncError) {
                                                    console.error('[WolkeSyncManager] Auto-sync initial sync failed:', syncError);
                                                    // Don't throw here - auto-sync setting was still successful
                                                }
                                            }
                                        } catch (error) {
                                            console.error('Failed to toggle sync:', error);
                                            // Optionally revert the checkbox state if the operation failed
                                            // The checkbox will revert automatically on next render due to state
                                        }
                                    }}
                                    className="sync-enable-checkbox"
                                />
                                <h3>{shareLink.label || `Link ${shareLink.id.slice(-6)}`}</h3>
                            </div>
                            <p>{new URL(shareLink.share_link).hostname}</p>
                            {isSyncEnabled && syncStatus.sync_status !== 'completed' && syncStatus.sync_status !== 'idle' && (
                                <span className="sync-status">{getSimpleStatus(syncStatus.sync_status)}</span>
                            )}
                        </div>

                        <div className="share-link-actions">
                            {isSyncEnabled && (
                                <button
                                    className="pabtn pabtn--ghost pabtn--s"
                                    onClick={() => handleSyncFolder(shareLink.id, '')}
                                    disabled={isCurrentlySyncing}
                                    title={isCurrentlySyncing ? 'Synchronisiert...' : 'Synchronisieren'}
                                >
                                    {React.createElement(getIcon('actions', 'refresh'), { className: `pabtn__icon ${isCurrentlySyncing ? 'spinning' : ''}` })}
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default WolkeSyncManager;

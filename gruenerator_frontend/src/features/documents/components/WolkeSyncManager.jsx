import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { HiRefresh, HiPlus } from 'react-icons/hi';
import { useWolkeSync } from '../hooks/useWolkeSync';
import WolkeFolderBrowser from './WolkeFolderBrowser';
import './WolkeSyncManager.css';

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
        initialized
    } = useWolkeSync();

    const hasWolkeFolders = syncStatuses.length > 0;
    const hasShareLinks = Array.isArray(wolkeShareLinks) && wolkeShareLinks.length > 0;
    
    // Track when share links have been loaded at least once
    useEffect(() => {
        if (Array.isArray(wolkeShareLinks)) {
            setShareLinksLoading(false);
        }
    }, [wolkeShareLinks]);
    
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
        navigate('/profile/dokumente/wolke');
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
                                className="refresh-button"
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
                                <HiRefresh className={shareLinksLoading ? 'spinning' : ''} />
                                {shareLinksLoading ? 'Wird aktualisiert...' : 'Aktualisieren'}
                            </button>
                        </div>
                    )}
                </div>
                
                <div className="wolke-configure-prompt">
                    <div className="configure-message">
                        <p>{message}</p>
                        <button 
                            className="configure-wolke-button"
                            onClick={handleConfigureWolke}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 2L2 7v10c0 5.55 3.84 10 9 9 1.73-.09 3.39-.74 4.73-1.85"/>
                                <path d="M22 12c0-1.66-.45-3.22-1.27-4.56"/>
                                <circle cx="12" cy="12" r="3"/>
                            </svg>
                            {buttonText}
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
                        className="back-link"
                        onClick={handleBackToBrowser}
                    >
                        ← Zurück
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
const ShareLinksWithSync = ({ shareLinks, syncStatuses, onSyncFolder, onSyncComplete }) => {
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
                // Fix: Use actual auto_sync_enabled flag instead of just checking if syncStatus exists
                const isSyncEnabled = syncStatus?.auto_sync_enabled || false;
                const isCurrentlySyncing = syncingFolders.has(`${shareLink.id}-`) || syncStatus?.sync_status === 'syncing';
                
                return (
                    <div key={shareLink.id} className="wolke-share-link-card">
                        <div className="share-link-info">
                            <div className="share-link-header">
                                <input 
                                    type="checkbox" 
                                    checked={isSyncEnabled}
                                    onChange={async (e) => {
                                        try {
                                            const result = await setAutoSync(shareLink.id, '', e.target.checked);
                                            
                                            // Force refresh sync statuses to update UI state
                                            if (onSyncComplete) {
                                                onSyncComplete();
                                            }
                                            
                                            // If auto-sync was successfully enabled, immediately trigger a sync
                                            if (result && result.success && result.autoSyncEnabled && e.target.checked) {
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
                                    className="sync-icon-button"
                                    onClick={() => handleSyncFolder(shareLink.id, '')}
                                    disabled={isCurrentlySyncing}
                                    title={isCurrentlySyncing ? 'Synchronisiert...' : 'Synchronisieren'}
                                >
                                    <HiRefresh className={isCurrentlySyncing ? 'spinning' : ''} />
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
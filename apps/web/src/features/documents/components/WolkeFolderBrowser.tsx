import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useWolkeSync } from '../hooks/useWolkeSync';
import { NextcloudShareManager } from '../../../utils/nextcloudShareManager';
import './WolkeFolderBrowser.css';

interface ShareLink {
    id: string;
    folder_name?: string;
    share_url?: string;
    is_active?: boolean;
    label?: string;
    base_url?: string;
    share_link?: string;
}

interface FolderSelection {
    shareId: string;
    folderPath: string;
}

interface WolkeFolderBrowserProps {
    onFolderSelect?: (selection: FolderSelection) => void;
    selectedFolderId?: string | null;
}

export const WolkeFolderBrowser = ({ onFolderSelect, selectedFolderId }: WolkeFolderBrowserProps): React.ReactElement => {
    const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedShares, setExpandedShares] = useState<Set<string>>(new Set());

    const {
        syncStatuses,
        syncFolder,
        setAutoSync,
        getSyncStatus,
        isSyncing
    } = useWolkeSync();

    useEffect(() => {
        loadShareLinks();
    }, []);

    const loadShareLinks = async () => {
        try {
            setLoading(true);
            setError(null);

            const links = await NextcloudShareManager.getShareLinks();
            setShareLinks(links.filter(link => link.is_active));
        } catch (error) {
            console.error('[WolkeFolderBrowser] Failed to load share links:', error);
            setError('Fehler beim Laden der Wolke-Links');
        } finally {
            setLoading(false);
        }
    };

    const toggleShareExpansion = (shareId: string) => {
        setExpandedShares(prev => {
            const newSet = new Set(prev);
            if (newSet.has(shareId)) {
                newSet.delete(shareId);
            } else {
                newSet.add(shareId);
            }
            return newSet;
        });
    };

    const handleFolderSelect = (shareId: string, folderPath = '') => {
        if (onFolderSelect) {
            onFolderSelect({ shareId, folderPath });
        }
    };

    const handleSyncFolder = async (shareId: string, folderPath = '') => {
        try {
            await syncFolder(shareId, folderPath);
        } catch (error) {
            console.error('[WolkeFolderBrowser] Sync failed:', error);
        }
    };

    const handleToggleAutoSync = async (shareId: string, folderPath = '', enabled: boolean) => {
        try {
            const result = await setAutoSync(shareId, folderPath, enabled);

            // If auto-sync was successfully enabled, immediately trigger a sync
            if (result && result.success && (result as any).autoSyncEnabled && enabled) {
                console.log('[WolkeFolderBrowser] Auto-sync enabled, triggering immediate sync...');
                try {
                    await syncFolder(shareId, folderPath);
                    console.log('[WolkeFolderBrowser] Auto-sync initial sync completed');
                } catch (syncError) {
                    console.error('[WolkeFolderBrowser] Auto-sync initial sync failed:', syncError);
                    // Don't throw here - auto-sync setting was still successful
                }
            }
        } catch (error) {
            console.error('[WolkeFolderBrowser] Auto-sync toggle failed:', error);
        }
    };

    const formatLastSync = (lastSyncAt: string | null | undefined) => {
        if (!lastSyncAt) return 'Nie synchronisiert';

        const date = new Date(lastSyncAt);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Gerade eben';
        if (diffMins < 60) return `vor ${diffMins} Min`;
        if (diffHours < 24) return `vor ${diffHours} Std`;
        return `vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`;
    };

    if (loading) {
        return (
            <div className="wolke-folder-browser">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Lade Wolke-Links...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="wolke-folder-browser">
                <div className="error-state">
                    <p className="error-message">{error}</p>
                    <button
                        onClick={loadShareLinks}
                        className="retry-button"
                    >
                        Erneut versuchen
                    </button>
                </div>
            </div>
        );
    }

    if (shareLinks.length === 0) {
        return (
            <div className="wolke-folder-browser">
                <div className="empty-state">
                    <p>Keine aktiven Wolke-Links gefunden.</p>
                    <p className="hint">Erstelle zuerst einen Wolke-Link in deinem Nextcloud-Account.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="wolke-folder-browser">

            <div className="share-links-list">
                {shareLinks.map(shareLink => {
                    const isExpanded = expandedShares.has(shareLink.id);
                    const syncStatus = getSyncStatus(shareLink.id);
                    const isCurrentlySyncing = isSyncing(shareLink.id);
                    const isSelected = selectedFolderId === shareLink.id;

                    return (
                        <motion.div
                            key={shareLink.id}
                            className={`share-link-item ${isSelected ? 'selected' : ''}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <div className="share-link-header">
                                <button
                                    className="expand-button"
                                    onClick={() => toggleShareExpansion(shareLink.id)}
                                    aria-label={`${isExpanded ? 'Zuklappen' : 'Aufklappen'} ${shareLink.label || 'Unbenannte Verbindung'}`}
                                >
                                    <svg
                                        className={`chevron-icon ${isExpanded ? 'expanded' : ''}`}
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <polyline points="6,9 12,15 18,9"></polyline>
                                    </svg>
                                </button>

                                <div className="share-link-info">
                                    <h4 className="share-name">{shareLink.label || 'Unbenannte Verbindung'}</h4>
                                    <div className="share-meta">
                                        <span className="share-url">{shareLink.base_url || shareLink.share_link}</span>
                                        {syncStatus && (
                                            <span className={`sync-status ${syncStatus.sync_status}`}>
                                                {syncStatus.sync_status === 'syncing' && 'Synchronisiert...'}
                                                {syncStatus.sync_status === 'completed' && 'Synchronisiert'}
                                                {syncStatus.sync_status === 'failed' && 'Fehler'}
                                                {syncStatus.sync_status === 'idle' && 'Bereit'}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="share-actions">
                                    <button
                                        className={`select-button ${isSelected ? 'selected' : ''}`}
                                        onClick={() => handleFolderSelect(shareLink.id)}
                                        disabled={isCurrentlySyncing}
                                    >
                                        {isSelected ? 'Ausgewählt' : 'Auswählen'}
                                    </button>
                                </div>
                            </div>

                            {isExpanded && (
                                <motion.div
                                    className="share-link-details"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <div className="sync-controls">
                                        <div className="sync-actions">
                                            <button
                                                className="sync-button"
                                                onClick={() => handleSyncFolder(shareLink.id)}
                                                disabled={isCurrentlySyncing}
                                            >
                                                {isCurrentlySyncing ? (
                                                    <>
                                                        <div className="sync-spinner"></div>
                                                        Synchronisiert...
                                                    </>
                                                ) : (
                                                    'Jetzt synchronisieren'
                                                )}
                                            </button>

                                            {syncStatus && (
                                                <label className="auto-sync-toggle">
                                                    <input
                                                        type="checkbox"
                                                        checked={syncStatus.auto_sync_enabled || false}
                                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleToggleAutoSync(
                                                            shareLink.id,
                                                            '',
                                                            e.target.checked
                                                        )}
                                                        disabled={isCurrentlySyncing}
                                                    />
                                                    <span className="toggle-label">Auto-Sync</span>
                                                </label>
                                            )}
                                        </div>

                                        {syncStatus && (
                                            <div className="sync-stats">
                                                <div className="stat-item">
                                                    <span className="stat-label">Letzte Sync:</span>
                                                    <span className="stat-value">
                                                        {formatLastSync(syncStatus.last_sync_at)}
                                                    </span>
                                                </div>
                                                {syncStatus.files_processed > 0 && (
                                                    <div className="stat-item">
                                                        <span className="stat-label">Dateien:</span>
                                                        <span className="stat-value">
                                                            {syncStatus.files_processed} verarbeitet
                                                            {syncStatus.files_failed > 0 &&
                                                                `, ${syncStatus.files_failed} fehlgeschlagen`
                                                            }
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
};

export default WolkeFolderBrowser;

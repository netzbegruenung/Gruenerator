import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../../components/utils/apiClient';
import { useWolkeStore } from '../../../stores/wolkeStore';

/**
 * Custom hook for managing Wolke folder synchronization
 * Now integrates with WolkeStore for unified state management
 */
export const useWolkeSync = (useStore = true) => {
    // Local state for backward compatibility
    const [localSyncStatuses, setLocalSyncStatuses] = useState([]);
    const [localLoading, setLocalLoading] = useState(false);
    const [localSyncing, setLocalSyncing] = useState(new Set());
    const [localError, setLocalError] = useState(null);
    const [localInitialized, setLocalInitialized] = useState(false);

    // Zustand store integration
    const {
        syncStatuses: storeSyncStatuses,
        isLoading: storeLoading,
        error: storeError,
        isSyncingFolder,
        fetchSyncStatuses: storeFetchSyncStatuses,
        syncFolder: storeSyncFolder,
        setAutoSync: storeSetAutoSync,
        getSyncStatus: storeGetSyncStatus,
        getSyncStats: storeGetSyncStats,
        scope,
        permissions
    } = useWolkeStore();

    // Use store values if enabled, otherwise use local state
    const syncStatuses = useStore ? storeSyncStatuses : localSyncStatuses;
    const loading = useStore ? storeLoading : localLoading;
    const error = useStore ? storeError : localError;
    const initialized = useStore ? true : localInitialized; // Store is always considered initialized

    // Fetch sync statuses from backend
    const fetchSyncStatuses = useCallback(async () => {
        if (useStore) {
            return storeFetchSyncStatuses();
        }

        try {
            setLocalLoading(true);
            setLocalError(null);
            
            const response = await apiClient.get('/documents/wolke/sync-status');
            
            if (response.data && response.data.success) {
                setLocalSyncStatuses(response.data.syncStatuses || []);
            } else {
                throw new Error('Failed to get sync statuses');
            }
        } catch (error) {
            console.error('[useWolkeSync] Failed to fetch sync statuses:', error);
            setLocalError('Fehler beim Laden der Sync-Status');
            setLocalSyncStatuses([]);
        } finally {
            setLocalLoading(false);
            setLocalInitialized(true);
        }
    }, [useStore, storeFetchSyncStatuses]);

    // Start folder sync
    const syncFolder = useCallback(async (shareLinkId, folderPath = '') => {
        if (useStore) {
            return storeSyncFolder(shareLinkId, folderPath);
        }

        if (!shareLinkId || localSyncing.has(shareLinkId)) {
            return;
        }

        try {
            setLocalSyncing(prev => new Set(prev).add(shareLinkId));
            setLocalError(null);

            const response = await apiClient.post('/documents/wolke/sync', {
                shareLinkId,
                folderPath
            });

            if (response.data && response.data.success) {
                console.log(`[useWolkeSync] Started sync for share link ${shareLinkId}`);
                
                // Refresh sync statuses after a short delay to show the started sync
                setTimeout(() => {
                    fetchSyncStatuses();
                }, 1000);
                
                return { success: true, message: response.data.message };
            } else {
                throw new Error('Backend returned unsuccessful response');
            }
        } catch (error) {
            console.error(`[useWolkeSync] Failed to start sync for ${shareLinkId}:`, error);
            setLocalError(`Fehler beim Starten der Synchronisation: ${error.message}`);
            throw error;
        } finally {
            setLocalSyncing(prev => {
                const newSet = new Set(prev);
                newSet.delete(shareLinkId);
                return newSet;
            });
        }
    }, [useStore, storeSyncFolder, localSyncing, fetchSyncStatuses]);

    // Set auto-sync for a folder
    const setAutoSync = useCallback(async (shareLinkId, folderPath = '', enabled) => {
        if (useStore) {
            const result = await storeSetAutoSync(shareLinkId, folderPath, enabled);
            // Force refresh sync statuses to ensure UI state update
            setTimeout(() => {
                storeFetchSyncStatuses();
            }, 100);
            return result;
        }

        try {
            setLocalError(null);

            const response = await apiClient.post('/documents/wolke/auto-sync', {
                shareLinkId,
                folderPath,
                enabled
            });

            if (response.data && response.data.success) {
                console.log(`[useWolkeSync] Auto-sync ${enabled ? 'enabled' : 'disabled'} for ${shareLinkId}`);
                
                // Update local state immediately
                setLocalSyncStatuses(prev => prev.map(status => 
                    status.share_link_id === shareLinkId && status.folder_path === folderPath
                        ? { ...status, auto_sync_enabled: enabled }
                        : status
                ));
                
                // If no existing sync status, create one
                setLocalSyncStatuses(prev => {
                    const hasStatus = prev.some(status => 
                        status.share_link_id === shareLinkId && status.folder_path === folderPath
                    );
                    
                    if (!hasStatus) {
                        return [...prev, {
                            share_link_id: shareLinkId,
                            folder_path: folderPath,
                            auto_sync_enabled: enabled,
                            sync_status: 'idle',
                            last_sync_at: null,
                            files_processed: 0,
                            files_failed: 0
                        }];
                    }
                    
                    return prev;
                });
                
                // Force refresh from backend after a short delay
                setTimeout(() => {
                    fetchSyncStatuses();
                }, 100);
                
                return { success: true, autoSyncEnabled: enabled };
            } else {
                throw new Error('Backend returned unsuccessful response');
            }
        } catch (error) {
            console.error(`[useWolkeSync] Failed to set auto-sync for ${shareLinkId}:`, error);
            setLocalError(`Fehler beim ${enabled ? 'Aktivieren' : 'Deaktivieren'} der Auto-Synchronisation`);
            throw error;
        }
    }, [useStore, storeSetAutoSync, storeFetchSyncStatuses, fetchSyncStatuses]);

    // Get sync status for a specific share link
    const getSyncStatus = useCallback((shareLinkId, folderPath = '') => {
        if (useStore) {
            return storeGetSyncStatus(shareLinkId, folderPath);
        }

        return syncStatuses.find(status => 
            status.share_link_id === shareLinkId && 
            status.folder_path === folderPath
        );
    }, [useStore, storeGetSyncStatus, syncStatuses]);

    // Check if a folder is currently syncing
    const isSyncing = useCallback((shareLinkId) => {
        if (useStore) {
            return isSyncingFolder(shareLinkId);
        }

        const status = getSyncStatus(shareLinkId);
        return localSyncing.has(shareLinkId) || status?.sync_status === 'syncing';
    }, [useStore, isSyncingFolder, localSyncing, getSyncStatus]);

    // Get sync statistics
    const getSyncStats = useCallback(() => {
        if (useStore) {
            return storeGetSyncStats();
        }

        const totalFolders = syncStatuses.length;
        const activeFolders = syncStatuses.filter(status => status.auto_sync_enabled).length;
        const syncingFolders = syncStatuses.filter(status => status.sync_status === 'syncing').length;
        const completedFolders = syncStatuses.filter(status => status.sync_status === 'completed').length;
        const failedFolders = syncStatuses.filter(status => status.sync_status === 'failed').length;
        
        const totalFilesProcessed = syncStatuses.reduce((sum, status) => 
            sum + (status.files_processed || 0), 0
        );
        
        const totalFilesFailed = syncStatuses.reduce((sum, status) => 
            sum + (status.files_failed || 0), 0
        );

        return {
            totalFolders,
            activeFolders,
            syncingFolders,
            completedFolders,
            failedFolders,
            totalFilesProcessed,
            totalFilesFailed
        };
    }, [useStore, storeGetSyncStats, syncStatuses]);

    // Initialize on mount - ensure sync statuses are loaded
    useEffect(() => {
        if (useStore) {
            // For store mode, ensure sync statuses are available
            const { syncStatuses, initialized } = useWolkeStore.getState();
            if (!initialized || syncStatuses.length === 0) {
                console.log('[useWolkeSync] Ensuring sync statuses are loaded...');
                storeFetchSyncStatuses().catch(error => {
                    console.error('[useWolkeSync] Failed to ensure sync statuses:', error);
                });
            }
        } else {
            // For local mode, fetch if not initialized
            if (!localInitialized) {
                fetchSyncStatuses();
            }
        }
    }, [useStore, localInitialized, fetchSyncStatuses, storeFetchSyncStatuses]);

    // Auto-refresh sync statuses periodically
    useEffect(() => {
        if (initialized && syncStatuses.some(status => status.sync_status === 'syncing')) {
            const interval = setInterval(() => {
                fetchSyncStatuses();
            }, 5000); // Refresh every 5 seconds if any sync is in progress

            return () => clearInterval(interval);
        }
    }, [initialized, syncStatuses, fetchSyncStatuses]);

    // Clear error after some time (only for local mode)
    useEffect(() => {
        if (!useStore && localError) {
            const timer = setTimeout(() => {
                setLocalError(null);
            }, 5000);
            
            return () => clearTimeout(timer);
        }
    }, [useStore, localError]);

    return {
        syncStatuses,
        loading,
        error,
        initialized,
        syncing: useStore ? [] : Array.from(localSyncing), // Store manages syncing state internally
        syncFolder,
        setAutoSync,
        getSyncStatus,
        isSyncing,
        getSyncStats,
        refresh: fetchSyncStatuses
    };
};
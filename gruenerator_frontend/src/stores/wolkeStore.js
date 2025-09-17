import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import apiClient from '../components/utils/apiClient';
import { NextcloudShareManager } from '../utils/nextcloudShareManager';

/**
 * Unified Zustand store for Wolke management
 * Supports both personal and group contexts with automatic API routing
 */
export const useWolkeStore = create(immer((set, get) => ({
  // Current scope context
  scope: 'personal', // 'personal' | 'group'
  scopeId: null,     // null for personal, groupId for groups

  // Shared state for both contexts
  shareLinks: [],
  syncStatuses: [],
  isLoading: false,
  isSyncing: new Set(),
  error: null,
  successMessage: '',

  // Permissions (context-dependent)
  permissions: {
    canAddLinks: true,
    canDeleteLinks: true,
    canSync: true,
    isAdmin: false
  },

  // Internal state
  initialized: false,
  lastFetchTimestamp: 0,
  fetchPromise: null,

  // Actions
  setScope: (scope, scopeId = null, permissions = null) => set(state => {
    const currentScope = state.scope;
    const currentScopeId = state.scopeId;
    
    console.log('[WolkeStore] Setting scope:', { 
      from: { scope: currentScope, scopeId: currentScopeId }, 
      to: { scope, scopeId, permissions } 
    });
    
    // Only clear data if scope actually changes
    const scopeChanged = currentScope !== scope || currentScopeId !== scopeId;
    
    if (scopeChanged) {
      console.log('[WolkeStore] Scope changed - clearing data and resetting initialized');
      // Clear data when switching contexts
      state.shareLinks = [];
      state.syncStatuses = [];
      state.error = null;
      state.successMessage = '';
      state.initialized = false;
    } else {
      console.log('[WolkeStore] Scope unchanged - keeping existing data and initialization state');
      // Don't reset initialized flag when scope hasn't changed
      // This prevents unnecessary re-fetching of data when component remounts
    }
    
    state.scope = scope;
    state.scopeId = scopeId;

    // Update permissions
    if (permissions) {
      state.permissions = { ...state.permissions, ...permissions };
    } else {
      // Default permissions for personal context
      state.permissions = {
        canAddLinks: true,
        canDeleteLinks: true,
        canSync: true,
        isAdmin: scope === 'personal'
      };
    }
  }),

  // Reset to personal context
  resetToPersonal: () => set(state => {
    console.log('[WolkeStore] Resetting to personal context');
    
    state.scope = 'personal';
    state.scopeId = null;
    state.shareLinks = [];
    state.syncStatuses = [];
    state.error = null;
    state.successMessage = '';
    state.initialized = false;
    state.permissions = {
      canAddLinks: true,
      canDeleteLinks: true,
      canSync: true,
      isAdmin: true
    };
  }),

  // Get API base path based on current scope
  getApiBasePath: () => {
    const { scope, scopeId } = get();
    return scope === 'group' ? `/groups/${scopeId}/wolke` : '/nextcloud';
  },

  // Set loading state
  setLoading: (isLoading) => set(state => {
    state.isLoading = isLoading;
  }),

  // Set error
  setError: (error) => set(state => {
    state.error = error;
    state.successMessage = '';
  }),

  // Clear error
  clearError: () => set(state => {
    state.error = null;
  }),

  // Set success message
  setSuccessMessage: (message) => set(state => {
    state.successMessage = message;
    state.error = null;
  }),

  // Clear messages
  clearMessages: () => set(state => {
    state.error = null;
    state.successMessage = '';
  }),

  // Fetch share links for current scope
  fetchShareLinks: async () => {
    try {
      set(state => {
        state.isLoading = true;
        state.error = null;
      });

      const { scope, scopeId } = get();
      
      if (scope === 'group') {
        // For groups, we'll use a dedicated API endpoint
        const basePath = `/groups/${scopeId}/wolke`;
        const response = await apiClient.get(`${basePath}/share-links`);
        
        if (response.data && response.data.success) {
          set(state => {
            state.shareLinks = response.data.shareLinks || [];
            state.isLoading = false;
            state.initialized = true;
          });
        } else {
          throw new Error('Failed to fetch group share links');
        }
      } else {
        // Use existing NextcloudShareManager for personal context
        const shareLinks = await NextcloudShareManager.getShareLinks();
        set(state => {
          state.shareLinks = shareLinks;
          state.isLoading = false;
          state.initialized = true;
        });
      }

      console.log('[WolkeStore] Fetched share links:', get().shareLinks.length);
      
    } catch (error) {
      console.error('[WolkeStore] Error fetching share links:', error);
      set(state => {
        state.error = error.message;
        state.isLoading = false;
        state.shareLinks = [];
        state.initialized = true;
      });
    }
  },

  // Add share link
  addShareLink: async (shareLink, label = '') => {
    try {
      const { scope, scopeId, permissions } = get();
      
      if (!permissions.canAddLinks) {
        throw new Error('Keine Berechtigung zum Hinzufügen von Links');
      }

      set(state => {
        state.error = null;
      });

      let newShareLink;

      if (scope === 'group') {
        const basePath = `/groups/${scopeId}/wolke`;
        const response = await apiClient.post(`${basePath}/share-links`, {
          shareLink: shareLink.trim(),
          label: label.trim()
        });

        if (response.data && response.data.success) {
          newShareLink = response.data.shareLink;
        } else {
          throw new Error(response.data?.message || 'Failed to add group share link');
        }
      } else {
        // Use existing NextcloudShareManager for personal context
        newShareLink = await NextcloudShareManager.saveShareLink(shareLink, label);
      }

      // Update the local state immediately
      set(state => {
        state.shareLinks.push(newShareLink);
        state.successMessage = scope === 'group' 
          ? 'Wolke-Link zur Gruppe hinzugefügt.'
          : 'Wolke-Verbindung wurde erfolgreich hinzugefügt.';
      });

      console.log('[WolkeStore] Added share link:', newShareLink.id);
      
      return newShareLink;

    } catch (error) {
      console.error('[WolkeStore] Error adding share link:', error);
      set(state => {
        state.error = error.message;
      });
      throw error;
    }
  },

  // Delete share link
  deleteShareLink: async (shareLinkId) => {
    try {
      const { scope, scopeId, permissions } = get();
      
      if (!permissions.canDeleteLinks) {
        throw new Error('Keine Berechtigung zum Löschen von Links');
      }

      set(state => {
        state.error = null;
      });

      if (scope === 'group') {
        const basePath = `/groups/${scopeId}/wolke`;
        const response = await apiClient.delete(`${basePath}/share-links/${shareLinkId}`);
        
        if (!response.data || !response.data.success) {
          throw new Error(response.data?.message || 'Failed to delete group share link');
        }
      } else {
        // Use existing NextcloudShareManager for personal context
        await NextcloudShareManager.deleteShareLink(shareLinkId);
      }

      set(state => {
        state.shareLinks = state.shareLinks.filter(link => link.id !== shareLinkId);
        state.successMessage = scope === 'group'
          ? 'Wolke-Link aus Gruppe entfernt.'
          : 'Wolke-Verbindung wurde gelöscht.';
      });

      console.log('[WolkeStore] Deleted share link:', shareLinkId);
      
    } catch (error) {
      console.error('[WolkeStore] Error deleting share link:', error);
      set(state => {
        state.error = error.message;
      });
      throw error;
    }
  },

  // Test connection
  testConnection: async (shareLink) => {
    try {
      const { scope, scopeId } = get();
      
      if (scope === 'group') {
        const basePath = `/groups/${scopeId}/wolke`;
        const response = await apiClient.post(`${basePath}/test-connection`, {
          shareLink: shareLink.trim()
        });
        
        return response.data;
      } else {
        // Use existing NextcloudShareManager for personal context
        return await NextcloudShareManager.testConnection(shareLink);
      }
    } catch (error) {
      console.error('[WolkeStore] Error testing connection:', error);
      throw error;
    }
  },

  // Upload test file
  uploadTest: async (shareLinkId, content, filename) => {
    try {
      const { scope, scopeId } = get();
      
      if (scope === 'group') {
        const basePath = `/groups/${scopeId}/wolke`;
        const response = await apiClient.post(`${basePath}/upload-test`, {
          shareLinkId,
          content,
          filename
        });
        
        return response.data;
      } else {
        // Use existing NextcloudShareManager for personal context
        return await NextcloudShareManager.uploadTest(shareLinkId, content, filename);
      }
    } catch (error) {
      console.error('[WolkeStore] Error testing upload:', error);
      throw error;
    }
  },

  // Fetch sync statuses
  fetchSyncStatuses: async (forceRefresh = false) => {
    const state = get();

    // Check if we have a recent fetch and don't force refresh
    const now = Date.now();
    const timeSinceLastFetch = now - state.lastFetchTimestamp;
    const CACHE_DURATION = 3000; // 3 seconds

    if (!forceRefresh && timeSinceLastFetch < CACHE_DURATION && state.syncStatuses.length > 0) {
      return state.syncStatuses;
    }

    // Deduplicate concurrent requests
    if (state.fetchPromise) {
      return state.fetchPromise;
    }

    const fetchPromise = (async () => {
      try {
        // Only show loading if we don't have existing sync statuses or force refresh
        const currentSyncStatuses = get().syncStatuses;
        const shouldShowLoading = forceRefresh || !currentSyncStatuses || currentSyncStatuses.length === 0;

        if (shouldShowLoading) {
          set(state => {
            state.isLoading = true;
            state.error = null;
          });
        }

        const { scope, scopeId } = get();
      let syncStatuses = [];

      if (scope === 'group') {
        const basePath = `/groups/${scopeId}/wolke`;
        const response = await apiClient.get(`${basePath}/sync-status`);
        
        if (response.data && response.data.success) {
          syncStatuses = response.data.syncStatuses || [];
        } else {
          throw new Error('Failed to fetch group sync statuses');
        }
      } else {
        const response = await apiClient.get('/documents/wolke/sync-status');
        
        if (response.data && response.data.success) {
          syncStatuses = response.data.syncStatuses || [];
        } else {
          throw new Error('Failed to fetch sync statuses');
        }
      }

        set(state => {
          state.syncStatuses = syncStatuses;
          state.isLoading = false;
          state.lastFetchTimestamp = Date.now();
          state.fetchPromise = null;
          // Mark as initialized after successful fetch
          if (!state.initialized) {
            state.initialized = true;
          }
        });

        console.log('[WolkeStore] Fetched sync statuses:', syncStatuses.length);
        return syncStatuses;

      } catch (error) {
        console.error('[WolkeStore] Error fetching sync statuses:', error);
        set(state => {
          state.error = error.message;
          state.isLoading = false;
          state.fetchPromise = null;
          // Still mark as initialized even on error to prevent infinite retry loops
          if (!state.initialized) {
            state.initialized = true;
          }
        });
        throw error;
      }
    })();

    // Store the promise to deduplicate
    set(state => {
      state.fetchPromise = fetchPromise;
    });

    return fetchPromise;
  },

  // Ensure sync statuses are available (fetch if needed)
  ensureSyncStatuses: async () => {
    const { syncStatuses, isLoading, initialized } = get();
    
    // If we already have sync statuses and we're not currently loading, return them
    if (syncStatuses.length > 0 && !isLoading) {
      return syncStatuses;
    }
    
    // If we're already loading, wait a bit and try again
    if (isLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return get().syncStatuses;
    }
    
    // Otherwise, fetch them
    return await get().fetchSyncStatuses();
  },

  // Sync folder
  syncFolder: async (shareLinkId, folderPath = '') => {
    try {
      const { scope, scopeId, permissions } = get();
      
      if (!permissions.canSync) {
        throw new Error('Keine Berechtigung zum Synchronisieren');
      }

      set(state => {
        state.isSyncing.add(shareLinkId);
        state.error = null;
      });

      const basePath = scope === 'group' 
        ? `/groups/${scopeId}/wolke`
        : '/documents/wolke';

      const response = await apiClient.post(`${basePath}/sync`, {
        shareLinkId,
        folderPath
      });

      if (response.data && response.data.success) {
        set(state => {
          state.successMessage = 'Synchronisation gestartet.';
        });
        
        // Refresh sync statuses immediately
        get().fetchSyncStatuses();

        return response.data;
      } else {
        throw new Error(response.data?.message || 'Failed to start sync');
      }

    } catch (error) {
      console.error('[WolkeStore] Error syncing folder:', error);
      set(state => {
        state.error = error.message;
      });
      throw error;
    } finally {
      set(state => {
        state.isSyncing.delete(shareLinkId);
      });
    }
  },

  // Set auto-sync
  setAutoSync: async (shareLinkId, folderPath = '', enabled) => {
    try {
      const { scope, scopeId, permissions } = get();
      
      if (scope === 'group' && !permissions.isAdmin) {
        throw new Error('Nur Admins können Auto-Sync für Gruppen aktivieren');
      }

      set(state => {
        state.error = null;
      });

      const basePath = scope === 'group'
        ? `/groups/${scopeId}/wolke`
        : '/documents/wolke';

      const response = await apiClient.post(`${basePath}/auto-sync`, {
        shareLinkId,
        folderPath,
        enabled
      });

      if (response.data && response.data.success) {
        // Update local sync status immediately
        set(state => {
          // Find existing status or prepare to create new one
          const existingStatusIndex = state.syncStatuses.findIndex(status => 
            status.share_link_id === shareLinkId && status.folder_path === folderPath
          );
          
          if (existingStatusIndex >= 0) {
            // Update existing status
            state.syncStatuses[existingStatusIndex] = {
              ...state.syncStatuses[existingStatusIndex],
              auto_sync_enabled: enabled
            };
          } else {
            // Create new sync status entry
            state.syncStatuses.push({
              share_link_id: shareLinkId,
              folder_path: folderPath,
              auto_sync_enabled: enabled,
              sync_status: 'idle',
              last_sync_at: null,
              files_processed: 0,
              files_failed: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          }
          
          state.successMessage = `Auto-Sync ${enabled ? 'aktiviert' : 'deaktiviert'}.`;
        });

        // Refresh from backend to ensure consistency
        get().fetchSyncStatuses();

        return response.data;
      } else {
        throw new Error(response.data?.message || 'Failed to set auto-sync');
      }

    } catch (error) {
      console.error('[WolkeStore] Error setting auto-sync:', error);
      set(state => {
        state.error = error.message;
      });
      throw error;
    }
  },

  // Check if syncing
  isSyncingFolder: (shareLinkId) => {
    const { isSyncing, syncStatuses } = get();
    const status = syncStatuses.find(s => s.share_link_id === shareLinkId);
    return isSyncing.has(shareLinkId) || status?.sync_status === 'syncing';
  },

  // Get sync status for a folder
  getSyncStatus: (shareLinkId, folderPath = '') => {
    const { syncStatuses } = get();
    return syncStatuses.find(status => 
      status.share_link_id === shareLinkId && 
      status.folder_path === folderPath
    );
  },

  // Get sync statistics
  getSyncStats: () => {
    const { syncStatuses } = get();
    
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
  }
})));

export default useWolkeStore;
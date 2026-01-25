import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import apiClient from '../components/utils/apiClient';
import { NextcloudShareManager } from '../utils/nextcloudShareManager';

interface WolkeFileItem {
  path: string;
  name: string;
  size?: number;
  mimeType?: string;
  lastModified?: string;
  isDirectory?: boolean;
}

interface ShareLink {
  id: string;
  share_link?: string;
  label?: string;
  folder_name?: string;
  base_url?: string;
  share_token?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  display_name?: string;
  user_id?: string;
}

interface SyncStatus {
  share_link_id: string;
  folder_path: string;
  auto_sync_enabled: boolean;
  sync_status: 'idle' | 'syncing' | 'completed' | 'failed';
  last_sync_at: string | null;
  files_processed: number;
  files_failed: number;
  created_at?: string;
  updated_at?: string;
}

interface FileCache {
  files: WolkeFileItem[];
  timestamp: number;
  loading: boolean;
}

interface WolkePermissions {
  canAddLinks: boolean;
  canDeleteLinks: boolean;
  canSync: boolean;
  isAdmin: boolean;
}

interface SyncStats {
  totalFolders: number;
  activeFolders: number;
  syncingFolders: number;
  completedFolders: number;
  failedFolders: number;
  totalFilesProcessed: number;
  totalFilesFailed: number;
}

interface CachedFilesResult {
  files: WolkeFileItem[];
  loading: boolean;
  isCached: boolean;
  timestamp: number;
}

interface WolkeTestResult {
  success: boolean;
  message?: string;
}

interface WolkeSyncResult {
  success: boolean;
  message?: string;
}

interface WolkeStore {
  scope: 'personal' | 'group';
  scopeId: string | null;
  shareLinks: ShareLink[];
  syncStatuses: SyncStatus[];
  isLoading: boolean;
  isSyncing: Set<string>;
  error: string | null;
  successMessage: string;
  filesCache: Map<string, FileCache>;
  preloadPromises: Map<string, Promise<WolkeFileItem[]>>;
  permissions: WolkePermissions;
  initialized: boolean;
  lastFetchTimestamp: number;
  fetchPromise: Promise<SyncStatus[]> | null;
  shareLinksPreloaded: boolean;

  setScope: (
    scope: 'personal' | 'group',
    scopeId?: string | null,
    permissions?: Partial<WolkePermissions> | null
  ) => void;
  resetToPersonal: () => void;
  getApiBasePath: () => string;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  setSuccessMessage: (message: string) => void;
  clearMessages: () => void;
  fetchShareLinks: () => Promise<void>;
  addShareLink: (shareLink: string, label?: string) => Promise<ShareLink>;
  deleteShareLink: (shareLinkId: string) => Promise<void>;
  testConnection: (shareLink: string) => Promise<WolkeTestResult>;
  uploadTest: (shareLinkId: string, content: string, filename: string) => Promise<WolkeTestResult>;
  fetchSyncStatuses: (forceRefresh?: boolean) => Promise<SyncStatus[]>;
  ensureSyncStatuses: () => Promise<SyncStatus[]>;
  syncFolder: (shareLinkId: string, folderPath?: string) => Promise<WolkeSyncResult>;
  setAutoSync: (
    shareLinkId: string,
    folderPath: string | undefined,
    enabled: boolean
  ) => Promise<WolkeSyncResult>;
  isSyncingFolder: (shareLinkId: string) => boolean;
  getSyncStatus: (shareLinkId: string, folderPath?: string) => SyncStatus | undefined;
  getSyncStats: () => SyncStats;
  preloadShareLinks: () => Promise<ShareLink[]>;
  preloadFiles: (shareLinkId: string) => Promise<WolkeFileItem[]>;
  progressivePreload: () => Promise<void>;
  getCachedFiles: (shareLinkId: string) => CachedFilesResult;
  areFilesCached: (shareLinkId: string, maxAge?: number) => boolean;
  clearFileCache: (shareLinkId: string) => void;
  clearAllFileCaches: () => void;
}

export const useWolkeStore = create<WolkeStore>()(
  immer((set, get) => ({
    scope: 'personal',
    scopeId: null,
    shareLinks: [],
    syncStatuses: [],
    isLoading: false,
    isSyncing: new Set<string>(),
    error: null,
    successMessage: '',
    filesCache: new Map<string, FileCache>(),
    preloadPromises: new Map<string, Promise<WolkeFileItem[]>>(),
    permissions: {
      canAddLinks: true,
      canDeleteLinks: true,
      canSync: true,
      isAdmin: false,
    },
    initialized: false,
    lastFetchTimestamp: 0,
    fetchPromise: null,
    shareLinksPreloaded: false,

    setScope: (scope, scopeId = null, permissions = null) =>
      set((state) => {
        const currentScope = state.scope;
        const currentScopeId = state.scopeId;

        const scopeChanged = currentScope !== scope || currentScopeId !== scopeId;

        if (scopeChanged) {
          state.shareLinks = [];
          state.syncStatuses = [];
          state.error = null;
          state.successMessage = '';
          state.initialized = false;
          state.shareLinksPreloaded = false;
          state.filesCache.clear();
          state.preloadPromises.clear();
        }

        state.scope = scope;
        state.scopeId = scopeId;

        if (permissions) {
          state.permissions = { ...state.permissions, ...permissions };
        } else {
          state.permissions = {
            canAddLinks: true,
            canDeleteLinks: true,
            canSync: true,
            isAdmin: scope === 'personal',
          };
        }
      }),

    resetToPersonal: () =>
      set((state) => {
        state.scope = 'personal';
        state.scopeId = null;
        state.shareLinks = [];
        state.syncStatuses = [];
        state.error = null;
        state.successMessage = '';
        state.initialized = false;
        state.shareLinksPreloaded = false;
        state.filesCache.clear();
        state.preloadPromises.clear();
        state.permissions = {
          canAddLinks: true,
          canDeleteLinks: true,
          canSync: true,
          isAdmin: true,
        };
      }),

    getApiBasePath: () => {
      const { scope, scopeId } = get();
      return scope === 'group' ? `/groups/${scopeId}/wolke` : '/nextcloud';
    },

    setLoading: (isLoading) =>
      set((state) => {
        state.isLoading = isLoading;
      }),

    setError: (error) =>
      set((state) => {
        state.error = error;
        state.successMessage = '';
      }),

    clearError: () =>
      set((state) => {
        state.error = null;
      }),

    setSuccessMessage: (message) =>
      set((state) => {
        state.successMessage = message;
        state.error = null;
      }),

    clearMessages: () =>
      set((state) => {
        state.error = null;
        state.successMessage = '';
      }),

    fetchShareLinks: async () => {
      try {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        const { scope, scopeId } = get();

        if (scope === 'group') {
          const basePath = `/groups/${scopeId}/wolke`;
          const response = await apiClient.get(`${basePath}/share-links`);

          if (response.data && response.data.success) {
            set((state) => {
              state.shareLinks = response.data.shareLinks || [];
              state.isLoading = false;
              state.initialized = true;
              state.shareLinksPreloaded = true;
            });
          } else {
            throw new Error('Failed to fetch group share links');
          }
        } else {
          const shareLinks = await NextcloudShareManager.getShareLinks();
          set((state) => {
            state.shareLinks = shareLinks;
            state.isLoading = false;
            state.initialized = true;
            state.shareLinksPreloaded = true;
          });
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        set((state) => {
          state.error = errorMessage;
          state.isLoading = false;
          state.shareLinks = [];
          state.initialized = true;
        });
      }
    },

    addShareLink: async (shareLink, label = '') => {
      const { scope, scopeId, permissions } = get();

      if (!permissions.canAddLinks) {
        throw new Error('Keine Berechtigung zum Hinzufügen von Links');
      }

      set((state) => {
        state.error = null;
      });

      let newShareLink: ShareLink;

      if (scope === 'group') {
        const basePath = `/groups/${scopeId}/wolke`;
        const response = await apiClient.post(`${basePath}/share-links`, {
          shareLink: shareLink.trim(),
          label: label.trim(),
        });

        if (response.data && response.data.success) {
          newShareLink = response.data.shareLink;
        } else {
          throw new Error(response.data?.message || 'Failed to add group share link');
        }
      } else {
        newShareLink = await NextcloudShareManager.saveShareLink(shareLink, label);
      }

      set((state) => {
        state.shareLinks.push(newShareLink);
        state.successMessage =
          scope === 'group'
            ? 'Wolke-Link zur Gruppe hinzugefügt.'
            : 'Wolke-Verbindung wurde erfolgreich hinzugefügt.';
      });

      return newShareLink;
    },

    deleteShareLink: async (shareLinkId) => {
      const { scope, scopeId, permissions } = get();

      if (!permissions.canDeleteLinks) {
        throw new Error('Keine Berechtigung zum Löschen von Links');
      }

      set((state) => {
        state.error = null;
      });

      if (scope === 'group') {
        const basePath = `/groups/${scopeId}/wolke`;
        const response = await apiClient.delete(`${basePath}/share-links/${shareLinkId}`);

        if (!response.data || !response.data.success) {
          throw new Error(response.data?.message || 'Failed to delete group share link');
        }
      } else {
        await NextcloudShareManager.deleteShareLink(shareLinkId);
      }

      set((state) => {
        state.shareLinks = state.shareLinks.filter((link) => link.id !== shareLinkId);
        state.successMessage =
          scope === 'group'
            ? 'Wolke-Link aus Gruppe entfernt.'
            : 'Wolke-Verbindung wurde gelöscht.';
      });
    },

    testConnection: async (shareLink) => {
      const { scope, scopeId } = get();

      if (scope === 'group') {
        const basePath = `/groups/${scopeId}/wolke`;
        const response = await apiClient.post(`${basePath}/test-connection`, {
          shareLink: shareLink.trim(),
        });

        return response.data;
      } else {
        return await NextcloudShareManager.testConnection(shareLink);
      }
    },

    uploadTest: async (shareLinkId, content, filename) => {
      const { scope, scopeId } = get();

      if (scope === 'group') {
        const basePath = `/groups/${scopeId}/wolke`;
        const response = await apiClient.post(`${basePath}/upload-test`, {
          shareLinkId,
          content,
          filename,
        });

        return response.data;
      } else {
        return await NextcloudShareManager.uploadTest(shareLinkId, content, filename);
      }
    },

    fetchSyncStatuses: async (forceRefresh = false) => {
      const state = get();

      const now = Date.now();
      const timeSinceLastFetch = now - state.lastFetchTimestamp;
      const CACHE_DURATION = 3000;

      if (!forceRefresh && timeSinceLastFetch < CACHE_DURATION && state.syncStatuses.length > 0) {
        return state.syncStatuses;
      }

      if (state.fetchPromise) {
        return state.fetchPromise;
      }

      const fetchPromise = (async () => {
        try {
          const currentSyncStatuses = get().syncStatuses;
          const shouldShowLoading =
            forceRefresh || !currentSyncStatuses || currentSyncStatuses.length === 0;

          if (shouldShowLoading) {
            set((state) => {
              state.isLoading = true;
              state.error = null;
            });
          }

          const { scope, scopeId } = get();
          let syncStatuses: SyncStatus[] = [];

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

          set((state) => {
            state.syncStatuses = syncStatuses;
            state.isLoading = false;
            state.lastFetchTimestamp = Date.now();
            state.fetchPromise = null;
            if (!state.initialized) {
              state.initialized = true;
            }
          });

          return syncStatuses;
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          set((state) => {
            state.error = errorMessage;
            state.isLoading = false;
            state.fetchPromise = null;
            if (!state.initialized) {
              state.initialized = true;
            }
          });
          throw error;
        }
      })();

      set((state) => {
        state.fetchPromise = fetchPromise;
      });

      return fetchPromise;
    },

    ensureSyncStatuses: async () => {
      const { syncStatuses, isLoading } = get();

      if (syncStatuses.length > 0 && !isLoading) {
        return syncStatuses;
      }

      if (isLoading) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return get().syncStatuses;
      }

      return await get().fetchSyncStatuses();
    },

    syncFolder: async (shareLinkId, folderPath = '') => {
      const { scope, scopeId, permissions } = get();

      if (!permissions.canSync) {
        throw new Error('Keine Berechtigung zum Synchronisieren');
      }

      set((state) => {
        state.isSyncing.add(shareLinkId);
        state.error = null;
      });

      try {
        const basePath = scope === 'group' ? `/groups/${scopeId}/wolke` : '/documents/wolke';

        const response = await apiClient.post(`${basePath}/sync`, {
          shareLinkId,
          folderPath,
        });

        if (response.data && response.data.success) {
          set((state) => {
            state.successMessage = 'Synchronisation gestartet.';
          });

          get().fetchSyncStatuses();

          return response.data;
        } else {
          throw new Error(response.data?.message || 'Failed to start sync');
        }
      } finally {
        set((state) => {
          state.isSyncing.delete(shareLinkId);
        });
      }
    },

    setAutoSync: async (shareLinkId, folderPath = '', enabled) => {
      const { scope, scopeId, permissions } = get();

      if (scope === 'group' && !permissions.isAdmin) {
        throw new Error('Nur Admins können Auto-Sync für Gruppen aktivieren');
      }

      set((state) => {
        state.error = null;
      });

      const basePath = scope === 'group' ? `/groups/${scopeId}/wolke` : '/documents/wolke';

      const response = await apiClient.post(`${basePath}/auto-sync`, {
        shareLinkId,
        folderPath,
        enabled,
      });

      if (response.data && response.data.success) {
        set((state) => {
          const existingStatusIndex = state.syncStatuses.findIndex(
            (status) => status.share_link_id === shareLinkId && status.folder_path === folderPath
          );

          if (existingStatusIndex >= 0) {
            state.syncStatuses[existingStatusIndex] = {
              ...state.syncStatuses[existingStatusIndex],
              auto_sync_enabled: enabled,
            };
          } else {
            state.syncStatuses.push({
              share_link_id: shareLinkId,
              folder_path: folderPath,
              auto_sync_enabled: enabled,
              sync_status: 'idle',
              last_sync_at: null,
              files_processed: 0,
              files_failed: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }

          state.successMessage = `Auto-Sync ${enabled ? 'aktiviert' : 'deaktiviert'}.`;
        });

        get().fetchSyncStatuses();

        return response.data;
      } else {
        throw new Error(response.data?.message || 'Failed to set auto-sync');
      }
    },

    isSyncingFolder: (shareLinkId) => {
      const { isSyncing, syncStatuses } = get();
      const status = syncStatuses.find((s) => s.share_link_id === shareLinkId);
      return isSyncing.has(shareLinkId) || status?.sync_status === 'syncing';
    },

    getSyncStatus: (shareLinkId, folderPath = '') => {
      const { syncStatuses } = get();
      return syncStatuses.find(
        (status) => status.share_link_id === shareLinkId && status.folder_path === folderPath
      );
    },

    getSyncStats: () => {
      const { syncStatuses } = get();

      const totalFolders = syncStatuses.length;
      const activeFolders = syncStatuses.filter((status) => status.auto_sync_enabled).length;
      const syncingFolders = syncStatuses.filter(
        (status) => status.sync_status === 'syncing'
      ).length;
      const completedFolders = syncStatuses.filter(
        (status) => status.sync_status === 'completed'
      ).length;
      const failedFolders = syncStatuses.filter((status) => status.sync_status === 'failed').length;

      const totalFilesProcessed = syncStatuses.reduce(
        (sum, status) => sum + (status.files_processed || 0),
        0
      );

      const totalFilesFailed = syncStatuses.reduce(
        (sum, status) => sum + (status.files_failed || 0),
        0
      );

      return {
        totalFolders,
        activeFolders,
        syncingFolders,
        completedFolders,
        failedFolders,
        totalFilesProcessed,
        totalFilesFailed,
      };
    },

    preloadShareLinks: async () => {
      const { shareLinksPreloaded, isLoading } = get();

      if (shareLinksPreloaded || isLoading) {
        return get().shareLinks;
      }

      return new Promise((resolve) => {
        const doPreload = async () => {
          try {
            await get().fetchShareLinks();
            resolve(get().shareLinks);
          } catch (error) {
            resolve([]);
          }
        };

        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          window.requestIdleCallback(doPreload, { timeout: 2000 });
        } else {
          setTimeout(doPreload, 100);
        }
      });
    },

    preloadFiles: async (shareLinkId) => {
      const state = get();
      const CACHE_DURATION = 5 * 60 * 1000;
      const now = Date.now();

      const cached = state.filesCache.get(shareLinkId);
      if (cached && now - cached.timestamp < CACHE_DURATION) {
        return cached.files;
      }

      const existingPromise = state.preloadPromises.get(shareLinkId);
      if (existingPromise) {
        return existingPromise;
      }

      const loadPromise = (async () => {
        try {
          set((state) => {
            state.filesCache.set(shareLinkId, {
              files: cached?.files || [],
              timestamp: cached?.timestamp || 0,
              loading: true,
            });
          });

          const response = await apiClient.get(`/documents/wolke/browse/${shareLinkId}`);

          if (response.data && response.data.success) {
            const files = response.data.files || [];

            set((state) => {
              state.filesCache.set(shareLinkId, {
                files,
                timestamp: now,
                loading: false,
              });
              state.preloadPromises.delete(shareLinkId);
            });

            return files;
          } else {
            throw new Error('Failed to preload files');
          }
        } catch (error) {
          set((state) => {
            const cached = state.filesCache.get(shareLinkId);
            if (cached) {
              state.filesCache.set(shareLinkId, {
                ...cached,
                loading: false,
              });
            }
            state.preloadPromises.delete(shareLinkId);
          });

          return [];
        }
      })();

      set((state) => {
        state.preloadPromises.set(shareLinkId, loadPromise);
      });

      return loadPromise;
    },

    progressivePreload: async () => {
      try {
        const shareLinks = await get().preloadShareLinks();

        if (shareLinks.length > 0) {
          const primaryShareLink = shareLinks[0];

          if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            window.requestIdleCallback(
              () => {
                get().preloadFiles(primaryShareLink.id);
              },
              { timeout: 5000 }
            );
          } else {
            setTimeout(() => {
              get().preloadFiles(primaryShareLink.id);
            }, 500);
          }
        }
      } catch (error) {
        // Silent fail for preload
      }
    },

    getCachedFiles: (shareLinkId) => {
      const cached = get().filesCache.get(shareLinkId);
      return cached
        ? {
            files: cached.files,
            loading: cached.loading,
            isCached: true,
            timestamp: cached.timestamp,
          }
        : {
            files: [],
            loading: false,
            isCached: false,
            timestamp: 0,
          };
    },

    areFilesCached: (shareLinkId, maxAge = 5 * 60 * 1000) => {
      const cached = get().filesCache.get(shareLinkId);
      if (!cached) return false;

      const now = Date.now();
      return now - cached.timestamp < maxAge;
    },

    clearFileCache: (shareLinkId) => {
      set((state) => {
        state.filesCache.delete(shareLinkId);
        state.preloadPromises.delete(shareLinkId);
      });
    },

    clearAllFileCaches: () => {
      set((state) => {
        state.filesCache.clear();
        state.preloadPromises.clear();
      });
    },
  }))
);

export default useWolkeStore;
export type {
  ShareLink,
  SyncStatus,
  FileCache,
  WolkePermissions,
  SyncStats,
  CachedFilesResult,
  WolkeStore,
  WolkeFileItem,
  WolkeTestResult,
  WolkeSyncResult,
};

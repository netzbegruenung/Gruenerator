/**
 * Cross-Tab Sync Middleware for Zustand
 * Synchronizes state changes across browser tabs via localStorage events
 */

import type { StateCreator, StoreApi, StoreMutatorIdentifier } from 'zustand';

interface CrossTabSyncConfig {
  storageKey: string;
  syncKeys?: string[] | null;
}

interface ConfigWithCrossTabSync<T> {
  crossTabSync?: CrossTabSyncConfig;
  (
    set: (partial: Partial<T> | ((state: T) => Partial<T>), replace?: boolean) => void,
    get: () => T,
    api: StoreApi<T>
  ): T;
}

type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T>), replace?: boolean) => void;
type GetState<T> = () => T;

export const crossTabSyncMiddleware =
  <T extends object>(config: ConfigWithCrossTabSync<T>) =>
  (set: SetState<T>, get: GetState<T>, api: StoreApi<T> & { destroy?: () => void }): T => {
    const storeApi = config(set, get, api);

    // Storage event listener for cross-tab sync
    const handleStorageChange = (event: StorageEvent) => {
      if (!config.crossTabSync) return;

      const { storageKey, syncKeys } = config.crossTabSync;

      // Only handle changes to our storage key
      if (event.key === storageKey && event.newValue) {
        try {
          const newData = JSON.parse(event.newValue) as Record<string, unknown>;
          const currentState = get() as Record<string, unknown>;
          const updates: Record<string, unknown> = {};
          let hasUpdates = false;

          // Check which keys need to be synced
          if (syncKeys && Array.isArray(syncKeys)) {
            syncKeys.forEach((key: string) => {
              if (newData[key] !== undefined && newData[key] !== currentState[key]) {
                updates[key] = newData[key];
                hasUpdates = true;
              }
            });
          } else {
            // Sync all keys if no specific keys specified
            Object.keys(newData).forEach((key: string) => {
              if (newData[key] !== currentState[key]) {
                updates[key] = newData[key];
                hasUpdates = true;
              }
            });
          }

          // Apply updates if any
          if (hasUpdates) {
            console.log('Cross-tab sync: Updating state from other tab', updates);
            set(updates as Partial<T>);
          }
        } catch (error) {
          console.warn('Cross-tab sync error:', error);
        }
      }
    };

    // Set up storage event listener
    if (typeof window !== 'undefined' && config.crossTabSync) {
      window.addEventListener('storage', handleStorageChange);

      // Cleanup function (store this for later cleanup)
      const originalDestroy = api.destroy;
      api.destroy = () => {
        window.removeEventListener('storage', handleStorageChange);
        if (originalDestroy) originalDestroy();
      };
    }

    return storeApi;
  };

/**
 * Configuration helper for cross-tab sync
 */
export const createCrossTabSyncConfig = (
  storageKey: string,
  syncKeys: string[] | null = null
): { crossTabSync: CrossTabSyncConfig } => ({
  crossTabSync: {
    storageKey,
    syncKeys,
  },
});

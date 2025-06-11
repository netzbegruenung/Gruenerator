/**
 * Cross-Tab Sync Middleware for Zustand
 * Synchronizes state changes across browser tabs via localStorage events
 */

export const crossTabSyncMiddleware = (config) => (set, get, api) => {
  const storeApi = config(set, get, api);

  // Storage event listener for cross-tab sync
  const handleStorageChange = (event) => {
    if (!config.crossTabSync) return;

    const { storageKey, syncKeys } = config.crossTabSync;

    // Only handle changes to our storage key
    if (event.key === storageKey && event.newValue) {
      try {
        const newData = JSON.parse(event.newValue);
        const currentState = get();
        const updates = {};
        let hasUpdates = false;

        // Check which keys need to be synced
        if (syncKeys && Array.isArray(syncKeys)) {
          syncKeys.forEach(key => {
            if (newData[key] !== undefined && newData[key] !== currentState[key]) {
              updates[key] = newData[key];
              hasUpdates = true;
            }
          });
        } else {
          // Sync all keys if no specific keys specified
          Object.keys(newData).forEach(key => {
            if (newData[key] !== currentState[key]) {
              updates[key] = newData[key];
              hasUpdates = true;
            }
          });
        }

        // Apply updates if any
        if (hasUpdates) {
          console.log('Cross-tab sync: Updating state from other tab', updates);
          set(updates);
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
export const createCrossTabSyncConfig = (storageKey, syncKeys = null) => ({
  crossTabSync: {
    storageKey,
    syncKeys
  }
}); 
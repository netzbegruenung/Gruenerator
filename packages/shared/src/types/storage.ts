/**
 * Platform-agnostic storage interface
 * Web: Uses localStorage
 * Mobile: Uses expo-secure-store or async-storage
 */
export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Web storage adapter - wraps localStorage with async interface
 */
export const createWebStorageAdapter = (): StorageAdapter => ({
  getItem: async (key: string) => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  },
  setItem: async (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  },
});

/**
 * In-memory storage adapter for SSR/testing
 */
export const createMemoryStorageAdapter = (): StorageAdapter => {
  const store = new Map<string, string>();
  return {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: async (key: string) => {
      store.delete(key);
    },
  };
};

// Global storage instance - set by platform-specific code
let globalStorage: StorageAdapter = createMemoryStorageAdapter();

export const setGlobalStorage = (adapter: StorageAdapter): void => {
  globalStorage = adapter;
};

export const getGlobalStorage = (): StorageAdapter => globalStorage;

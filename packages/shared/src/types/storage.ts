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

// Type for window with localStorage
interface WindowWithStorage {
  localStorage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
}

/**
 * Web storage adapter - wraps localStorage with async interface
 */
export const createWebStorageAdapter = (): StorageAdapter => {
  // Type-safe window access for cross-platform compatibility
  const getWindow = (): WindowWithStorage | undefined => {
    if (typeof globalThis !== 'undefined' && 'window' in globalThis) {
      return (globalThis as unknown as { window: WindowWithStorage }).window;
    }
    return undefined;
  };

  return {
    getItem: async (key: string) => {
      const win = getWindow();
      if (!win) return null;
      return win.localStorage.getItem(key);
    },
    setItem: async (key: string, value: string) => {
      const win = getWindow();
      if (!win) return;
      win.localStorage.setItem(key, value);
    },
    removeItem: async (key: string) => {
      const win = getWindow();
      if (!win) return;
      win.localStorage.removeItem(key);
    },
  };
};

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

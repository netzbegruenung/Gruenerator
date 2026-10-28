// SPDX-License-Identifier: MPL-2.0

/**
 * Where a host keeps its offline document caches. Both names end up in users'
 * browsers: a host that renames them orphans every cache already written.
 */
export interface DocCacheStorage {
  /** IndexedDB database name of a document: `${dbPrefix}${documentId}`. */
  dbPrefix: string;
  /** localStorage key of the LRU registry of cached documents. */
  registryKey: string;
  /** Documents kept before the least recently opened one is deleted. Default 50. */
  maxEntries?: number;
}

export interface DocCacheRegistry {
  dbName: (documentId: string) => string;
  registerAccess: (documentId: string) => void;
  remove: (documentId: string) => void;
  clearAll: () => void;
}

interface CacheEntry {
  documentId: string;
  lastAccess: number;
}

const DEFAULT_MAX_ENTRIES = 50;

export function createDocCacheRegistry({
  dbPrefix,
  registryKey,
  maxEntries = DEFAULT_MAX_ENTRIES,
}: DocCacheStorage): DocCacheRegistry {
  const dbName = (documentId: string) => `${dbPrefix}${documentId}`;

  function getRegistry(): CacheEntry[] {
    try {
      const raw = localStorage.getItem(registryKey);
      if (!raw) return [];
      return JSON.parse(raw) as CacheEntry[];
    } catch {
      return [];
    }
  }

  function saveRegistry(entries: CacheEntry[]): void {
    try {
      localStorage.setItem(registryKey, JSON.stringify(entries));
    } catch {
      // localStorage full or unavailable
    }
  }

  function deleteDb(documentId: string): void {
    try {
      indexedDB.deleteDatabase(dbName(documentId));
    } catch {
      // best-effort
    }
  }

  return {
    dbName,
    registerAccess(documentId) {
      const registry = getRegistry();
      const existing = registry.findIndex((e) => e.documentId === documentId);
      if (existing >= 0) {
        registry[existing]!.lastAccess = Date.now();
      } else {
        registry.push({ documentId, lastAccess: Date.now() });
      }

      if (registry.length > maxEntries) {
        registry.sort((a, b) => b.lastAccess - a.lastAccess);
        const toEvict = registry.splice(maxEntries);
        for (const entry of toEvict) deleteDb(entry.documentId);
      }

      saveRegistry(registry);
    },
    remove(documentId) {
      const registry = getRegistry().filter((e) => e.documentId !== documentId);
      saveRegistry(registry);
      deleteDb(documentId);
    },
    clearAll() {
      const registry = getRegistry();
      for (const entry of registry) deleteDb(entry.documentId);
      saveRegistry([]);
    },
  };
}

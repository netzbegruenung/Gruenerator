const STORAGE_KEY = 'gruenerator-doc-cache-registry';
const MAX_CACHED_DOCS = 50;
const DB_PREFIX = 'gruenerator-doc-';

interface CacheEntry {
  documentId: string;
  lastAccess: number;
}

function getRegistry(): CacheEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CacheEntry[];
  } catch {
    return [];
  }
}

function saveRegistry(entries: CacheEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage full or unavailable
  }
}

function deleteDb(documentId: string): void {
  try {
    indexedDB.deleteDatabase(`${DB_PREFIX}${documentId}`);
  } catch {
    // best-effort
  }
}

export function registerDocAccess(documentId: string): void {
  const registry = getRegistry();
  const existing = registry.findIndex((e) => e.documentId === documentId);
  if (existing >= 0) {
    registry[existing]!.lastAccess = Date.now();
  } else {
    registry.push({ documentId, lastAccess: Date.now() });
  }

  if (registry.length > MAX_CACHED_DOCS) {
    registry.sort((a, b) => b.lastAccess - a.lastAccess);
    const toEvict = registry.splice(MAX_CACHED_DOCS);
    for (const entry of toEvict) deleteDb(entry.documentId);
  }

  saveRegistry(registry);
}

export function removeDocCache(documentId: string): void {
  const registry = getRegistry().filter((e) => e.documentId !== documentId);
  saveRegistry(registry);
  deleteDb(documentId);
}

export function clearAllDocCaches(): void {
  const registry = getRegistry();
  for (const entry of registry) deleteDb(entry.documentId);
  saveRegistry([]);
}

import { createDocCacheRegistry, type DocCacheStorage } from '@ggraphic/collab';

// F0: both names live in users' browsers. Renaming either orphans every
// offline document cache (`gruenerator-doc-<documentId>` in IndexedDB).
export const GRUENERATOR_DOC_CACHE: DocCacheStorage = {
  dbPrefix: 'gruenerator-doc-',
  registryKey: 'gruenerator-doc-cache-registry',
  maxEntries: 50,
};

const registry = createDocCacheRegistry(GRUENERATOR_DOC_CACHE);

export function removeDocCache(documentId: string): void {
  registry.remove(documentId);
}

export function clearAllDocCaches(): void {
  registry.clearAll();
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearAllDocCaches, removeDocCache } from './cacheRegistry';

// Characterisation: the IndexedDB database names (`gruenerator-doc-<id>`) and
// the localStorage key of the cache registry are F0 — they live in users'
// browsers. A different name orphans every offline document cache.
const REGISTRY_KEY = 'gruenerator-doc-cache-registry';

let storage: Map<string, string>;
let deleted: string[];

beforeEach(() => {
  storage = new Map();
  deleted = [];
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal('indexedDB', { deleteDatabase: (name: string) => deleted.push(name) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Grünerator doc cache storage keys', () => {
  it('reads and writes the registry under its F0 key and deletes by the F0 db prefix', () => {
    storage.set(
      REGISTRY_KEY,
      JSON.stringify([
        { documentId: 'a', lastAccess: 1 },
        { documentId: 'b', lastAccess: 2 },
      ])
    );

    removeDocCache('a');
    expect(deleted).toEqual(['gruenerator-doc-a']);
    expect(JSON.parse(storage.get(REGISTRY_KEY)!)).toEqual([{ documentId: 'b', lastAccess: 2 }]);

    clearAllDocCaches();
    expect(deleted).toEqual(['gruenerator-doc-a', 'gruenerator-doc-b']);
    expect(storage.get(REGISTRY_KEY)).toBe('[]');
    expect([...storage.keys()]).toEqual([REGISTRY_KEY]);
  });
});

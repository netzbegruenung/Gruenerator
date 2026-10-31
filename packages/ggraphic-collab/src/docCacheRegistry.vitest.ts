// SPDX-License-Identifier: MPL-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDocCacheRegistry } from './docCacheRegistry';

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
  vi.useRealTimers();
});

describe('createDocCacheRegistry', () => {
  it('names databases and the registry only from what the host passes', () => {
    const registry = createDocCacheRegistry({
      dbPrefix: 'studio-doc-',
      registryKey: 'studio-cache',
      maxEntries: 2,
    });
    expect(registry.dbName('x')).toBe('studio-doc-x');

    vi.useFakeTimers();
    for (const [i, id] of ['a', 'b', 'c'].entries()) {
      vi.setSystemTime(i + 1);
      registry.registerAccess(id);
    }
    expect(deleted).toEqual(['studio-doc-a']);
    expect([...storage.keys()]).toEqual(['studio-cache']);

    registry.remove('b');
    registry.clearAll();
    expect(deleted).toEqual(['studio-doc-a', 'studio-doc-b', 'studio-doc-c']);
    expect(storage.get('studio-cache')).toBe('[]');
  });
});

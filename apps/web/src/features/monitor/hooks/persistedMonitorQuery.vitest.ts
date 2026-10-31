import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { lvName } from '../bundeslaender';

import { persistedMonitorQuery } from './persistedMonitorQuery';

const schema = z.object({ n: z.number() });
const KEY = ['monitor', 'test', 'de'] as const;
const STORAGE_KEY = `gruenerator:monitor-cache:v1:${JSON.stringify(KEY)}`;

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

let store: Storage;

beforeEach(() => {
  store = memoryStorage();
  vi.stubGlobal('window', { localStorage: store });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('persistedMonitorQuery', () => {
  it('starts empty, writes the fetched answer and serves it to the next mount', async () => {
    const first = persistedMonitorQuery(KEY, schema, () => Promise.resolve({ n: 1 }));
    expect(first.initialData()).toBeUndefined();
    await first.queryFn();

    const next = persistedMonitorQuery(KEY, schema, () => Promise.resolve({ n: 2 }));
    expect(next.initialData()).toEqual({ n: 1 });
    // The stored timestamp lets the hook's staleTime decide about refetching.
    expect(typeof next.initialDataUpdatedAt()).toBe('number');
  });

  it('drops entries that no longer match the contract schema', () => {
    store.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), data: { n: 'alt' } }));
    expect(persistedMonitorQuery(KEY, schema, vi.fn()).initialData()).toBeUndefined();
    expect(store.getItem(STORAGE_KEY)).toBeNull();
  });

  it('drops entries older than twelve hours', () => {
    store.setItem(
      STORAGE_KEY,
      JSON.stringify({ at: Date.now() - 13 * 60 * 60 * 1000, data: { n: 1 } })
    );
    expect(persistedMonitorQuery(KEY, schema, vi.fn()).initialData()).toBeUndefined();
    expect(store.getItem(STORAGE_KEY)).toBeNull();
  });

  it('clears the entry when the server answers with no data', async () => {
    store.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), data: { n: 1 } }));
    const q = persistedMonitorQuery<{ n: number } | null>(KEY, schema, () => Promise.resolve(null));
    await q.queryFn();
    expect(store.getItem(STORAGE_KEY)).toBeNull();
  });

  it('keeps the stored answer when the request fails', async () => {
    store.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), data: { n: 1 } }));
    const q = persistedMonitorQuery(KEY, schema, () => Promise.reject(new Error('down')));
    await expect(q.queryFn()).rejects.toThrow('down');
    expect(store.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('works without storage', async () => {
    vi.stubGlobal('window', undefined);
    const q = persistedMonitorQuery(KEY, schema, () => Promise.resolve({ n: 1 }));
    expect(q.initialData()).toBeUndefined();
    await expect(q.queryFn()).resolves.toEqual({ n: 1 });
  });
});

describe('lvName', () => {
  it('shows only the Bundesland for Landesverband and Landtagsfraktion codes', () => {
    expect(lvName('SL')).toBe('Saarland');
    expect(lvName('BY-F')).toBe('Bayern');
    expect(lvName('LSA-F')).toBe('Sachsen-Anhalt');
    expect(lvName('XX')).toBe('XX');
  });
});

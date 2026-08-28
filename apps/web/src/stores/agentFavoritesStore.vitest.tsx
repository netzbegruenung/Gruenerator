import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * jsdom lane, not node: the persist middleware reads `localStorage`, and
 * `migrate` only ever runs while rehydrating from it. Each case seeds storage
 * first, then imports the module fresh so the store is built against it.
 */
const KEY = 'sidebar-agent-favorites';

async function loadStore(persisted?: { state: unknown; version: number }) {
  localStorage.clear();
  if (persisted) localStorage.setItem(KEY, JSON.stringify(persisted));
  vi.resetModules();
  const mod = await import('./agentFavoritesStore');
  return mod.default;
}

describe('agentFavoritesStore migration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('gives a v1 state an empty title map instead of leaving it undefined', async () => {
    const store = await loadStore({
      state: { favoriteIdentifiers: ['presse-agent'] },
      version: 1,
    });

    expect(store.getState().favoriteIdentifiers).toEqual(['presse-agent']);
    // The resolvers index into this on every render — undefined would throw.
    expect(store.getState().favoriteTitles).toEqual({});
  });

  it('keeps titles a v2 state already carries', async () => {
    const store = await loadStore({
      state: {
        favoriteIdentifiers: ['geteilter-agent'],
        favoriteTitles: { 'geteilter-agent': 'Pressemitteilung Bezirk' },
      },
      version: 2,
    });

    expect(store.getState().favoriteTitles).toEqual({
      'geteilter-agent': 'Pressemitteilung Bezirk',
    });
  });

  it('carries a v0 mention list through to v2 with an empty title map', async () => {
    const store = await loadStore({ state: { mentions: ['presse'] }, version: 0 });

    expect(store.getState().favoriteTitles).toEqual({});
    // v0 held skill mentions; unknown ones are dropped rather than passed on.
    expect(store.getState().favoriteIdentifiers).not.toContain('presse');
  });
});

describe('agentFavoritesStore titles', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores the title on toggle and drops it again on untoggle', async () => {
    const store = await loadStore();

    store.getState().toggle('geteilter-agent', 'Pressemitteilung Bezirk');
    expect(store.getState().favoriteTitles).toEqual({
      'geteilter-agent': 'Pressemitteilung Bezirk',
    });

    store.getState().toggle('geteilter-agent');
    expect(store.getState().favoriteIdentifiers).toEqual([]);
    expect(store.getState().favoriteTitles).toEqual({});
  });

  it('keeps a favourite starred without a title — the star must not depend on it', async () => {
    const store = await loadStore();

    store.getState().toggle('presse-agent');
    expect(store.getState().favoriteIdentifiers).toEqual(['presse-agent']);
    expect(store.getState().favoriteTitles).toEqual({});
  });

  it('recordTitles backfills only identifiers that are actually favourites', async () => {
    const store = await loadStore();
    store.getState().add('geteilter-agent');

    store.getState().recordTitles({
      'geteilter-agent': 'Pressemitteilung Bezirk',
      'nicht-favorisiert': 'Irgendwas anderes',
    });

    expect(store.getState().favoriteTitles).toEqual({
      'geteilter-agent': 'Pressemitteilung Bezirk',
    });
  });

  it('recordTitles does not touch state when nothing changed', async () => {
    const store = await loadStore();
    store.getState().add('geteilter-agent', 'Pressemitteilung Bezirk');
    const before = store.getState().favoriteTitles;

    store.getState().recordTitles({ 'geteilter-agent': 'Pressemitteilung Bezirk' });

    // Identity, not equality: it runs from a render effect, so a fresh object
    // every time would re-trigger any consumer that depends on it.
    expect(store.getState().favoriteTitles).toBe(before);
  });

  it('recordTitles picks up a rename', async () => {
    const store = await loadStore();
    store.getState().add('geteilter-agent', 'Alter Name');

    store.getState().recordTitles({ 'geteilter-agent': 'Neuer Name' });

    expect(store.getState().favoriteTitles['geteilter-agent']).toBe('Neuer Name');
  });
});

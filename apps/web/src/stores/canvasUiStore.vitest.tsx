import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * jsdom lane: persist reads `localStorage` and `migrate` only runs while
 * rehydrating from it, so each case seeds storage, then imports fresh.
 */
const KEY = 'gruenerator-canvas-ui';

async function loadStore(persisted?: { state: unknown; version: number }) {
  localStorage.clear();
  if (persisted) localStorage.setItem(KEY, JSON.stringify(persisted));
  vi.resetModules();
  const mod = await import('./canvasUiStore');
  return mod.default;
}

describe('canvasUiStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('remembers an open chat per canvas across a reload', async () => {
    const store = await loadStore();
    store.getState().setActiveTab('canvas-a', 'chat');
    expect(store.getState().initialTabFor('canvas-a')).toBe('chat');
    expect(store.getState().initialTabFor('canvas-b')).toBeNull();

    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as {
      state: unknown;
      version: number;
    };
    const reloaded = await loadStore(saved);
    expect(reloaded.getState().initialTabFor('canvas-a')).toBe('chat');
  });

  it('forgets the chat when another tab or none is open', async () => {
    const store = await loadStore();
    store.getState().setActiveTab('canvas-a', 'chat');
    store.getState().setActiveTab('canvas-a', 'text');
    expect(store.getState().initialTabFor('canvas-a')).toBeNull();
    store.getState().setActiveTab('canvas-a', 'chat');
    store.getState().setActiveTab('canvas-a', null);
    expect(store.getState().initialTabFor('canvas-a')).toBeNull();
  });

  it('keeps only the most recent 50 canvases', async () => {
    const store = await loadStore();
    for (let i = 0; i < 55; i++) store.getState().setActiveTab(`c${i}`, 'chat');
    // Re-opening an old one moves it to the front instead of duplicating it.
    store.getState().setActiveTab('c10', 'chat');
    const ids = store.getState().chatOpenCanvasIds;
    expect(ids).toHaveLength(50);
    expect(ids.at(-1)).toBe('c10');
    expect(store.getState().initialTabFor('c4')).toBeNull();
    expect(store.getState().initialTabFor('c5')).toBe('chat');
  });

  it('does not rewrite storage when nothing changed', async () => {
    const store = await loadStore();
    store.getState().setActiveTab('canvas-a', 'chat');
    const before = store.getState().chatOpenCanvasIds;
    store.getState().setActiveTab('canvas-a', 'chat');
    store.getState().setActiveTab('canvas-b', null);
    expect(store.getState().chatOpenCanvasIds).toBe(before);
  });

  it('drops a malformed persisted state instead of crashing', async () => {
    const store = await loadStore({ state: { chatOpenCanvasIds: 'nope' }, version: 0 });
    expect(store.getState().chatOpenCanvasIds).toEqual([]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

const page = (id: string, text: string) => ({
  id,
  configId: 'freeform',
  state: { additionalTexts: [{ text }] },
});

function hocuspocusAnswers(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
  );
}

async function load() {
  vi.resetModules();
  vi.stubEnv('HOCUSPOCUS_INTERNAL_TOKEN', 'test');
  return import('./canvasStateService.js');
}

beforeEach(() => query.mockReset());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getCanvasSnapshotState', () => {
  it('keeps every page of a multi-page freeform canvas', async () => {
    const pages = [page('a', 'Eins'), page('b', 'Zwei'), page('c', 'Drei')];
    hocuspocusAnswers({ hasYState: true, state: pages[0]!.state, pages });

    const { getCanvasSnapshotState } = await load();
    const snapshot = await getCanvasSnapshotState('canvas-1');

    expect(snapshot.pageCount).toBe(3);
    expect(snapshot.state.pages).toEqual(pages);
    // Flat cover keys of the first page stay beside `pages` for gallery readers.
    expect(snapshot.state.additionalTexts).toEqual([{ text: 'Eins' }]);
  });

  it('falls back to the flat state when the canvas has no page list', async () => {
    hocuspocusAnswers({ hasYState: false, state: {} });
    query.mockResolvedValue([{ initial_state: { headline: 'Flach' } }]);

    const { getCanvasSnapshotState } = await load();
    const snapshot = await getCanvasSnapshotState('canvas-2');

    expect(snapshot).toEqual({ state: { headline: 'Flach' }, pageCount: null });
  });
});

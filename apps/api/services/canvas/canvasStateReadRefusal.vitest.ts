import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

const refusal = () =>
  new Response(
    JSON.stringify({
      error: 'canvas document is newer than this service supports',
      code: 'CANVAS_DOCUMENT_NEWER',
      found: 5,
      known: 4,
    }),
    { status: 426 }
  );

function hocuspocusAnswers(make: () => Response) {
  const fetchMock = vi.fn(async () => make());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function load() {
  vi.resetModules();
  vi.stubEnv('HOCUSPOCUS_INTERNAL_TOKEN', 'test');
  return import('./canvasStateService.js');
}

/** Answers the mirror read with `initialState` and the Yjs-rows probe with `yjsRows` rows. */
function database(initialState: Record<string, unknown>, yjsRows: number) {
  query.mockImplementation(async (sql: string) =>
    sql.includes('yjs_document_updates')
      ? Array.from({ length: yjsRows }, () => ({ '?column?': 1 }))
      : [{ initial_state: initialState }]
  );
}

// A block body: a returned function would run as a teardown hook (here: `query()` with no SQL).
beforeEach(() => {
  query.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** A read of a document newer than the server is refused, never answered from `initial_state`. */
describe('a refused canvas read', () => {
  it.each(['getCurrentCanvasState', 'getCurrentDeckState', 'getCanvasSnapshotState'] as const)(
    '%s throws CanvasDocumentNewerReadError and does not fall back to the mirror',
    async (reader) => {
      hocuspocusAnswers(refusal);
      query.mockResolvedValue([{ initial_state: { headline: 'Alt' } }]);
      const service = await load();

      await expect(service[reader]('c1')).rejects.toBeInstanceOf(
        service.CanvasDocumentNewerReadError
      );
      expect(query).not.toHaveBeenCalled();
    }
  );

  it('a plain 426 without the code is an ordinary failure and falls back', async () => {
    hocuspocusAnswers(() => new Response('upgrade', { status: 426 }));
    database({ headline: 'Alt' }, 0);
    const { getCurrentCanvasState } = await load();

    await expect(getCurrentCanvasState('c1')).resolves.toEqual({
      state: { headline: 'Alt' },
      source: 'initial_state',
    });
  });

  it('a 500 still falls back to the mirror for a canvas without a Yjs document', async () => {
    hocuspocusAnswers(() => new Response('boom', { status: 500 }));
    database({ headline: 'Alt' }, 0);
    const { getCurrentCanvasState } = await load();

    await expect(getCurrentCanvasState('c1')).resolves.toMatchObject({ source: 'initial_state' });
  });
});

/** Hocuspocus cannot answer for a canvas the editor has written: the mirror may be stale (#5775). */
describe('an unanswered canvas read with a Yjs document', () => {
  it.each(['getCurrentCanvasState', 'getCurrentDeckState', 'getCanvasSnapshotState'] as const)(
    '%s throws CanvasLiveStateUnavailableError instead of reading the mirror',
    async (reader) => {
      hocuspocusAnswers(() => new Response('boom', { status: 502 }));
      database({ headline: 'Alt' }, 1);
      const service = await load();

      await expect(service[reader]('c1')).rejects.toBeInstanceOf(
        service.CanvasLiveStateUnavailableError
      );
      expect(query.mock.calls.map(([sql]) => sql as string)).not.toContainEqual(
        expect.stringContaining('initial_state')
      );
    }
  );

  it('a network failure counts the same as an error status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      })
    );
    database({ headline: 'Alt' }, 1);
    const service = await load();

    await expect(service.getCurrentCanvasState('c1')).rejects.toBeInstanceOf(
      service.CanvasLiveStateUnavailableError
    );
  });
});

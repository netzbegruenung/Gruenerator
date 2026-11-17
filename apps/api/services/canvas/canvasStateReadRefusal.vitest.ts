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

beforeEach(() => query.mockReset());
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
    query.mockResolvedValue([{ initial_state: { headline: 'Alt' } }]);
    const { getCurrentCanvasState } = await load();

    await expect(getCurrentCanvasState('c1')).resolves.toEqual({
      state: { headline: 'Alt' },
      source: 'initial_state',
    });
  });

  it('a 500 still falls back to the mirror', async () => {
    hocuspocusAnswers(() => new Response('boom', { status: 500 }));
    query.mockResolvedValue([{ initial_state: { headline: 'Alt' } }]);
    const { getCurrentCanvasState } = await load();

    await expect(getCurrentCanvasState('c1')).resolves.toMatchObject({ source: 'initial_state' });
  });
});

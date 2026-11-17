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

const page = { id: 'p1', configId: 'freeform', state: { headline: 'x' } };

beforeEach(() => query.mockReset());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/**
 * Hocuspocus refuses a write into a canvas document newer than it knows. The Y.Doc is the
 * authority, so the service must surface an error and never patch the JSON mirror instead.
 */
describe('a refused canvas write', () => {
  it('flat patch: throws CanvasDocumentNewerError, writes no mirror, even without Yjs rows', async () => {
    hocuspocusAnswers(refusal);
    query.mockResolvedValue([]); // no yjs_document_updates rows: the Hocuspocus-down fallback would pass
    const { applyCanvasStatePatch, CanvasDocumentNewerError } = await load();

    await expect(
      applyCanvasStatePatch('c1', { headline: 'y' }, { seedState: { headline: 'y' } })
    ).rejects.toBeInstanceOf(CanvasDocumentNewerError);
    expect(query).not.toHaveBeenCalled();
  });

  it('deck changes: throws, writes no mirror', async () => {
    hocuspocusAnswers(refusal);
    query.mockResolvedValue([]);
    const { applyDeckChanges, CanvasDocumentNewerError } = await load();

    await expect(
      applyDeckChanges('c1', { seedPages: [page], replacePages: [page], newPages: [page] })
    ).rejects.toBeInstanceOf(CanvasDocumentNewerError);
    expect(query).not.toHaveBeenCalled();
  });

  it('seed: throws instead of the tolerant warning', async () => {
    hocuspocusAnswers(refusal);
    const { seedCanvasPages, CanvasDocumentNewerError } = await load();

    await expect(seedCanvasPages('c1', 'freeform', { headline: 'x' })).rejects.toBeInstanceOf(
      CanvasDocumentNewerError
    );
  });

  it('carries a sentence a user may read', async () => {
    hocuspocusAnswers(refusal);
    const { applyCanvasStatePatch } = await load();
    const { classifyUserFacingError } = await import('../../utils/errors/userFacing.js');

    const error = await applyCanvasStatePatch('c1', { a: 1 }, { seedState: {} }).catch(
      (e: unknown) => e
    );
    expect(classifyUserFacingError(error).message).toContain('neueres Format');
  });

  it('an unwritable value (400): throws CanvasStateUnwritableError, not "Collab-Dienst nicht erreichbar"', async () => {
    hocuspocusAnswers(
      () =>
        new Response(
          JSON.stringify({
            error: 'canvas state contains a value that cannot be stored',
            code: 'CANVAS_STATE_UNWRITABLE',
          }),
          { status: 400 }
        )
    );
    query.mockResolvedValue([{ '?column?': 1 }]); // Yjs rows exist: an ordinary failure would throw "nicht erreichbar"
    const { applyCanvasStatePatch, applyDeckChanges, CanvasStateUnwritableError } = await load();

    const flat = await applyCanvasStatePatch('c1', { a: 1 }, { seedState: {} }).catch(
      (e: unknown) => e
    );
    expect(flat).toBeInstanceOf(CanvasStateUnwritableError);
    expect((flat as Error).message).not.toContain('nicht erreichbar');
    await expect(
      applyDeckChanges('c1', { seedPages: [page], newPages: [page] })
    ).rejects.toBeInstanceOf(CanvasStateUnwritableError);
    expect(query).not.toHaveBeenCalled();
  });

  it('a plain 400 without the code is an ordinary failure', async () => {
    hocuspocusAnswers(() => new Response('bad request', { status: 400 }));
    query.mockResolvedValue([]);
    const { applyCanvasStatePatch } = await load();
    await expect(applyCanvasStatePatch('c1', { a: 1 }, { seedState: {} })).resolves.toBeUndefined();
  });

  it('a plain 426 without the code is an ordinary failure, not a refusal', async () => {
    hocuspocusAnswers(() => new Response('upgrade', { status: 426 }));
    query.mockResolvedValue([]);
    const { applyCanvasStatePatch, CanvasDocumentNewerError } = await load();

    // No Yjs rows: the existing Hocuspocus-down fallback applies, as for any other failure.
    await expect(applyCanvasStatePatch('c1', { a: 1 }, { seedState: {} })).resolves.toBeUndefined();
    expect(CanvasDocumentNewerError).toBeDefined();
    expect(query).toHaveBeenCalledTimes(2); // hasYjsRows, then the mirror update
  });

  it('an accepted write still updates the mirror', async () => {
    hocuspocusAnswers(() => new Response('{"ok":true}', { status: 200 }));
    query.mockResolvedValue([]);
    const { applyCanvasStatePatch } = await load();

    await applyCanvasStatePatch('c1', { a: 1 }, { seedState: {} });
    expect(query).toHaveBeenCalledTimes(1);
  });
});

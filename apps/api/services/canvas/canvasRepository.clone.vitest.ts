/**
 * A clone carries what the editor holds (the live state), not the `initial_state` mirror; the
 * mirror only stands in when no Yjs document exists. Access is checked before anything is read
 * from Hocuspocus.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { query, transaction, clientQuery, checkDocumentAccess } = vi.hoisted(() => {
  // Read once when `canvasStateService` loads.
  process.env.HOCUSPOCUS_INTERNAL_TOKEN = 'test';
  return {
    query: vi.fn(),
    transaction: vi.fn(),
    clientQuery: vi.fn(),
    checkDocumentAccess: vi.fn(),
  };
});

vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query, transaction }),
}));
vi.mock('../../routes/docs/documentAccess.js', () => ({
  checkDocumentAccess,
  autoGrantSharePermission: vi.fn(),
  canWriteDocument: vi.fn(),
}));

const { cloneCanvas } = await import('./canvasRepository.js');
const { CanvasDocumentNewerReadError } = await import('./canvasWriteErrors.js');
const { getCanvasSnapshotState } = await import('./canvasStateService.js');

const source = {
  id: 'c1',
  title: 'Busse statt Stau',
  created_by: 'owner-1',
  permissions: {},
  is_public: false,
  share_mode: 'private',
  template_type: 'freeform',
  base_template_id: null,
  page_count: 1,
  format: 'post-portrait',
};

const insertedInitialState = () => {
  const call = clientQuery.mock.calls.find(([sql]) => /INSERT INTO canvas_documents/.test(sql));
  return {
    pageCount: call![1][3] as number,
    state: JSON.parse(call![1][4] as string) as Record<string, unknown>,
  };
};

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  query.mockReset().mockResolvedValue([source]);
  clientQuery.mockReset().mockResolvedValue({ rows: [{ id: 'c2' }] });
  transaction
    .mockReset()
    .mockImplementation(async (fn: (c: unknown) => unknown) => fn({ query: clientQuery }));
  checkDocumentAccess.mockReset().mockResolvedValue({ hasAccess: true, accessMethod: 'owner' });
});

describe('cloneCanvas', () => {
  it('copies the live state the reader returns, with the clone metadata and its page count', async () => {
    const live = {
      state: { headline: 'Aus dem Editor', pages: [{ id: 'a' }, { id: 'b' }] },
      pageCount: 2,
    };
    const readLiveState = vi.fn().mockResolvedValue(live);

    const result = await cloneCanvas('c1', 'user-1', readLiveState);

    expect(readLiveState).toHaveBeenCalledWith('c1');
    const inserted = insertedInitialState();
    expect(inserted.state).toMatchObject({
      headline: 'Aus dem Editor',
      pages: [{ id: 'a' }, { id: 'b' }],
      metadata: { cloned_from_template_id: 'c1' },
    });
    expect(inserted.pageCount).toBe(2);
    expect(result).toMatchObject({
      kind: 'ok',
      newCanvasId: 'c2',
      accessMethod: 'owner',
      templateType: 'freeform',
      seededState: inserted.state,
    });
  });

  it('keeps the source page count when the reader has none (flat fallback state)', async () => {
    await cloneCanvas('c1', 'user-1', async () => ({
      state: { headline: 'Spiegel' },
      pageCount: null,
    }));
    expect(insertedInitialState()).toMatchObject({
      pageCount: 1,
      state: { headline: 'Spiegel' },
    });
  });

  it('lets a refusal of the reader through and creates nothing', async () => {
    const readLiveState = vi.fn().mockRejectedValue(new CanvasDocumentNewerReadError('c1'));

    await expect(cloneCanvas('c1', 'user-1', readLiveState)).rejects.toBeInstanceOf(
      CanvasDocumentNewerReadError
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['not found', [], 'not_found'],
    ['no access', [source], 'forbidden'],
  ])('reads no live state for a canvas that is %s', async (_n, rows, kind) => {
    query.mockResolvedValue(rows);
    checkDocumentAccess.mockResolvedValue({ hasAccess: false });
    const readLiveState = vi.fn();

    expect(await cloneCanvas('c1', 'user-1', readLiveState)).toEqual({ kind });
    expect(readLiveState).not.toHaveBeenCalled();
  });
});

/** The reader the route passes: `getCanvasSnapshotState`, over a faked Hocuspocus. */
describe('cloneCanvas with the real live-state reader', () => {
  const hocuspocus = (answer: () => Response) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer())
    );
  /** The source row for the clone query; `initial_state` only where the mirror is read. */
  const mirror = (initial: Record<string, unknown>) =>
    query.mockImplementation(async (sql: string) =>
      /SELECT initial_state/.test(sql) ? [{ initial_state: initial }] : [source]
    );

  it('yields the Yjs state, not the mirror, when they differ', async () => {
    mirror({ pages: [{ id: 'p1', configId: 'freeform', state: { additionalTexts: [] } }] });
    const livePage = {
      id: 'p1',
      configId: 'freeform',
      state: { additionalTexts: [{ text: 'Zehn' }] },
    };
    hocuspocus(
      () =>
        new Response(JSON.stringify({ hasYState: true, state: livePage.state, pages: [livePage] }))
    );

    await cloneCanvas('c1', 'user-1', getCanvasSnapshotState);

    expect(insertedInitialState().state.pages).toEqual([livePage]);
  });

  it('falls back to the mirror when no Yjs document exists', async () => {
    mirror({ headline: 'Nur Spiegel' });
    hocuspocus(() => new Response(JSON.stringify({ state: {}, hasYState: false, live: false })));

    await cloneCanvas('c1', 'user-1', getCanvasSnapshotState);

    expect(insertedInitialState().state).toMatchObject({ headline: 'Nur Spiegel' });
  });

  it('refuses a source newer than the server and creates nothing', async () => {
    mirror({ headline: 'Alt' });
    hocuspocus(
      () => new Response(JSON.stringify({ code: 'CANVAS_DOCUMENT_NEWER' }), { status: 426 })
    );

    await expect(cloneCanvas('c1', 'user-1', getCanvasSnapshotState)).rejects.toBeInstanceOf(
      CanvasDocumentNewerReadError
    );
    expect(transaction).not.toHaveBeenCalled();
  });
});

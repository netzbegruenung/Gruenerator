/**
 * The rule this file exists to defend: a document edit either lands where the
 * editor reads (Yjs) or it is reported as a failure. The old path wrote
 * `collaborative_documents.content` — a column the hydration chain never
 * consults — and returned success either way.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

const query = vi.fn();
const writeYjsInitState = vi.fn();
const loadDocument = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));
vi.mock('./seedYjsState.js', () => ({ writeYjsInitState }));
vi.mock('@gruenerator/hocuspocus', () => ({
  blockNoteXmlToHtml: (xml: string) => xml,
  PostgresPersistence: class {
    loadDocument = loadDocument;
  },
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
process.env.HOCUSPOCUS_INTERNAL_TOKEN = 'test-token';

const { getDocumentHtml, replaceDocumentHtml } = await import('./docContentService.js');

const ok = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as Response;
const fail = (status: number): Response =>
  ({ ok: false, status, text: async () => 'nope' }) as Response;

/** No snapshot and no update rows — a document that was never opened. */
const noYjsRows = (): void => {
  query.mockResolvedValue([]);
};
/** At least one row — the editor has state that would win on next open. */
const hasYjsRows = (): void => {
  query.mockResolvedValue([{ '?column?': 1 }]);
};

beforeEach(() => {
  vi.clearAllMocks();
  loadDocument.mockResolvedValue(null);
});

describe('replaceDocumentHtml', () => {
  it('writes through the live Yjs doc and leaves `content` alone', async () => {
    noYjsRows();
    fetchMock.mockResolvedValueOnce(ok({ ok: true, html: '<p>Neue Fassung</p>', blocks: 1 }));

    const result = await replaceDocumentHtml('doc-1', '<p>Neue Fassung</p>', { userId: 'u1' });

    expect(result).toEqual({ html: '<p>Neue Fassung</p>', live: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/internal/doc/doc-1/html');
    expect(init.method).toBe('POST');
    // Only the bookkeeping UPDATE — `content` is the store hook's to derive.
    const written = query.mock.calls.map(([sql]) => sql as string).join('\n');
    expect(written).toContain('last_edited_by');
    expect(written).not.toContain('SET content');
  });

  it('throws instead of writing when Hocuspocus is down and Yjs state exists', async () => {
    hasYjsRows();
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(replaceDocumentHtml('doc-2', '<p>x</p>', { userId: 'u1' })).rejects.toThrow(
      /Collab-Dienst nicht erreichbar/
    );
    expect(writeYjsInitState).not.toHaveBeenCalled();
  });

  it('falls back to init_data only for a document that was never opened', async () => {
    noYjsRows();
    fetchMock.mockResolvedValueOnce(fail(503));
    writeYjsInitState.mockResolvedValueOnce(true);

    const result = await replaceDocumentHtml('doc-3', '<p>Neu</p>', { userId: 'u1' });

    expect(result.live).toBe(false);
    expect(writeYjsInitState).toHaveBeenCalledWith('doc-3', '<p>Neu</p>');
    // Here `content` IS written: nothing else will derive it while the collab
    // service is unreachable, and there is no Yjs state to diverge from.
    expect(query.mock.calls.map(([sql]) => sql as string).join('\n')).toContain('SET content');
  });

  it('throws when the fallback seed parses to nothing', async () => {
    noYjsRows();
    fetchMock.mockResolvedValueOnce(fail(503));
    writeYjsInitState.mockResolvedValueOnce(false);

    await expect(replaceDocumentHtml('doc-4', 'kein block', { userId: 'u1' })).rejects.toThrow(
      /Yjs-Seed/
    );
  });

  it('refuses an empty new version outright', async () => {
    await expect(replaceDocumentHtml('doc-5', '   ', { userId: 'u1' })).rejects.toThrow(/Leerer/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getDocumentHtml', () => {
  it('returns the live document when one is open', async () => {
    fetchMock.mockResolvedValueOnce(ok({ html: '<p>Live</p>', hasYState: true, live: true }));
    await expect(getDocumentHtml('doc-1')).resolves.toEqual({
      html: '<p>Live</p>',
      source: 'yjs',
      live: true,
    });
  });

  it('decodes the persisted state in-process when the endpoint is unavailable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    // The stubbed blockNoteXmlToHtml is identity, so the fragment's XML string
    // reaching the caller proves the persistence tiers were consulted.
    const stored = new Y.Doc();
    stored.getXmlFragment('document-store').insert(0, [new Y.XmlElement('paragraph')]);
    loadDocument.mockResolvedValueOnce(Y.encodeStateAsUpdate(stored));

    const result = await getDocumentHtml('doc-9');
    expect(loadDocument).toHaveBeenCalledWith('doc-9');
    expect(result).toEqual({ html: '<paragraph></paragraph>', source: 'yjs', live: false });
  });

  it('reports an empty document as such rather than as content', async () => {
    fetchMock.mockResolvedValueOnce(ok({ html: '', hasYState: false, live: true }));
    await expect(getDocumentHtml('doc-8')).resolves.toEqual({
      html: '',
      source: 'none',
      live: true,
    });
  });
});

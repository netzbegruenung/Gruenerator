/**
 * „Neu indexieren": wer darf, welche Quelle hat noch ein Original, und dass
 * ein zweiter Klick nichts doppelt einreiht. Die Identität der Quelle (ID,
 * Tags, Notebook-Mitgliedschaft) bleibt — geprüft an `processUploadedDocument`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ReindexDeps } from './reindex.js';
import type { ReindexRow } from './reindexOrigin.js';
import type { NotebookAccess } from '../../../routes/notebook/notebookAccess.js';

const fetchOriginal = vi.fn();
vi.mock('./reindexOrigin.js', async () => {
  const actual = await vi.importActual<typeof import('./reindexOrigin.js')>('./reindexOrigin.js');
  return { ...actual, fetchOriginal: (...a: unknown[]) => fetchOriginal(...a) as unknown };
});

const extractDocumentFromFile = vi.fn();
vi.mock('./textExtraction.js', async () => {
  const actual = await vi.importActual<typeof import('./textExtraction.js')>('./textExtraction.js');
  return {
    ...actual,
    extractDocumentFromFile: (...a: unknown[]) => extractDocumentFromFile(...a) as unknown,
  };
});

const chunkAndEmbedText = vi.fn();
vi.mock('./chunkingPipeline.js', () => ({
  chunkAndEmbedText: (...a: unknown[]) => chunkAndEmbedText(...a) as unknown,
}));

vi.mock('../../../middleware/requireAiConsent.js', () => ({ hasAiConsent: async () => true }));
vi.mock('./documentIngestWorker.js', () => ({ kickIngestWorker: vi.fn() }));

const { reindexDocument, reindexNotebookSources, REINDEX_UNAVAILABLE_MESSAGE } =
  await import('./reindex.js');
const { reindexOrigin, isReindexable } = await import('./reindexOrigin.js');
const { processUploadedDocument } = await import('./fileProcessing.js');

const OWNER = 'owner-1';
const EDITOR = 'editor-2';

const row = (over: Partial<ReindexRow> = {}): ReindexRow => ({
  id: 'doc-1',
  user_id: OWNER,
  filename: 'antrag.pdf',
  status: 'completed',
  source_url: null,
  wolke_share_link_id: null,
  wolke_file_path: null,
  metadata: {},
  ...over,
});

const WOLKE = row({ wolke_share_link_id: 'share-1', wolke_file_path: '/public.php/webdav/a.pdf' });
const URL_SOURCE = row({
  id: 'doc-2',
  filename: 'crawled_1.txt',
  metadata: { originalUrl: 'https://gruene.de/a' },
});
const UPLOAD = row({ id: 'doc-3' });

const access = (a: Partial<NotebookAccess>): NotebookAccess => ({
  exists: true,
  isOwner: false,
  canRead: true,
  canEdit: false,
  ...a,
});

/** Eine Zeilentabelle, die das UPDATE mit seiner Statusbedingung nachspielt. */
function fakeDeps(rows: ReindexRow[], over: Partial<ReindexDeps> = {}) {
  const table = new Map(rows.map((r) => [r.id, { ...r }]));
  const updates: string[] = [];
  const deps: ReindexDeps = {
    db: {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        if (sql.includes('UPDATE documents')) {
          const r = table.get(params[0] as string);
          if (r && !['uploaded', 'processing'].includes(r.status ?? '')) {
            r.status = 'uploaded';
            r.metadata = { ...(r.metadata as object), reindex_origin: params[1] };
            updates.push(r.id);
          }
          return [];
        }
        const ids = Array.isArray(params[0]) ? (params[0] as string[]) : [params[0] as string];
        return ids.flatMap((id) => (table.has(id) ? [table.get(id)] : [])) as never[];
      }) as ReindexDeps['db']['query'],
    },
    access: vi.fn(async () => access({ canEdit: true })),
    isInNotebook: vi.fn(async () => true),
    collectionDocumentIds: vi.fn(async () => rows.map((r) => r.id)),
    hasAiConsent: vi.fn(async () => true),
    kick: vi.fn(),
    ...over,
  };
  return { deps, table, updates };
}

describe('reindexDocument — Zugriff', () => {
  it('verweigert Fremden ohne Notebook-Bezug', async () => {
    const { deps, updates } = fakeDeps([WOLKE]);
    expect(await reindexDocument('doc-1', EDITOR, {}, deps)).toEqual({ status: 'forbidden' });
    expect(updates).toEqual([]);
  });

  it('verweigert Leserechte ohne Schreibrecht', async () => {
    const { deps, updates } = fakeDeps([WOLKE], {
      access: vi.fn(async () => access({ canEdit: false })),
    });
    expect(await reindexDocument('doc-1', EDITOR, { notebookId: 'nb-1' }, deps)).toEqual({
      status: 'forbidden',
    });
    expect(updates).toEqual([]);
  });

  it('meldet ein unlesbares Notebook als nicht gefunden', async () => {
    const { deps } = fakeDeps([WOLKE], {
      access: vi.fn(async () => access({ canRead: false })),
    });
    expect(await reindexDocument('doc-1', EDITOR, { notebookId: 'nb-1' }, deps)).toEqual({
      status: 'not_found',
    });
  });

  it('verweigert eine Quelle, die nicht im genannten Notebook liegt', async () => {
    const { deps, updates } = fakeDeps([WOLKE], { isInNotebook: vi.fn(async () => false) });
    expect(await reindexDocument('doc-1', EDITOR, { notebookId: 'nb-1' }, deps)).toEqual({
      status: 'not_found',
    });
    expect(updates).toEqual([]);
  });

  it('lässt Schreibberechtigte eines enthaltenden Notebooks zu', async () => {
    const { deps, updates } = fakeDeps([WOLKE]);
    const result = await reindexDocument('doc-1', EDITOR, { notebookId: 'nb-1' }, deps);
    expect(result.status).toBe('queued');
    expect(updates).toEqual(['doc-1']);
  });

  it('fehlt die Einwilligung, wird nichts eingereiht', async () => {
    const { deps, updates } = fakeDeps([WOLKE], { hasAiConsent: vi.fn(async () => false) });
    expect(await reindexDocument('doc-1', OWNER, {}, deps)).toEqual({ status: 'consent_missing' });
    expect(updates).toEqual([]);
  });
});

describe('reindexDocument — welche Quelle ein Original hat', () => {
  it('reiht Wolke-Dateien und URLs ein', async () => {
    const { deps, table } = fakeDeps([WOLKE, URL_SOURCE]);
    expect((await reindexDocument('doc-1', OWNER, {}, deps)).status).toBe('queued');
    expect((await reindexDocument('doc-2', OWNER, {}, deps)).status).toBe('queued');
    expect(table.get('doc-1')?.metadata).toMatchObject({ reindex_origin: 'wolke' });
    expect(table.get('doc-2')?.metadata).toMatchObject({ reindex_origin: 'url' });
    expect(deps.kick).toHaveBeenCalledTimes(2);
  });

  it('sagt bei einem Upload ohne Original ehrlich nein und fasst ihn nicht an', async () => {
    const { deps, updates } = fakeDeps([UPLOAD]);
    expect(await reindexDocument('doc-3', OWNER, {}, deps)).toEqual({
      status: 'unavailable',
      message: REINDEX_UNAVAILABLE_MESSAGE,
    });
    expect(updates).toEqual([]);
    expect(deps.kick).not.toHaveBeenCalled();
  });

  it('nimmt Wolke-Dateien in Formaten, die der Upload-Pfad nicht liest, nicht an', () => {
    expect(reindexOrigin({ ...WOLKE, filename: 'tabelle.xlsx' })).toBeNull();
    expect(reindexOrigin(row({ metadata: { originalUrl: 'ftp://x' } }))).toBeNull();
    expect(reindexOrigin(row({ source_url: 'https://wp.example/beitrag' }))).toEqual({
      kind: 'url',
      url: 'https://wp.example/beitrag',
    });
  });

  it('isReindexable kommt ohne wolke_file_path aus', () => {
    expect(isReindexable({ ...WOLKE, wolke_file_path: undefined })).toBe(true);
    expect(isReindexable(UPLOAD)).toBe(false);
  });

  it('ein zweiter Klick reiht nicht doppelt ein', async () => {
    const { deps, updates } = fakeDeps([WOLKE]);
    await reindexDocument('doc-1', OWNER, {}, deps);
    const again = await reindexDocument('doc-1', OWNER, {}, deps);
    expect(again.status).toBe('queued');
    expect(updates).toEqual(['doc-1']);
  });
});

describe('reindexNotebookSources', () => {
  it('reiht nur erreichbare Quellen ein und zählt den Rest', async () => {
    const { deps, updates } = fakeDeps([WOLKE, URL_SOURCE, UPLOAD]);
    const result = await reindexNotebookSources('nb-1', EDITOR, deps);
    expect(result).toEqual({
      status: 'ok',
      queued: ['doc-1', 'doc-2'],
      unavailable: 1,
      consentMissing: 0,
    });
    expect(updates).toEqual(['doc-1', 'doc-2']);
  });

  it('verweigert ohne Schreibrecht', async () => {
    const { deps, updates } = fakeDeps([WOLKE], {
      access: vi.fn(async () => access({ canEdit: false })),
    });
    expect(await reindexNotebookSources('nb-1', EDITOR, deps)).toEqual({ status: 'forbidden' });
    expect(updates).toEqual([]);
  });

  it('ist beim Wiederholen idempotent', async () => {
    const { deps, updates } = fakeDeps([WOLKE, URL_SOURCE]);
    await reindexNotebookSources('nb-1', OWNER, deps);
    const again = await reindexNotebookSources('nb-1', OWNER, deps);
    expect(again).toMatchObject({ queued: ['doc-1', 'doc-2'] });
    expect(updates).toEqual(['doc-1', 'doc-2']);
  });

  it('überspringt Quellen, deren Eigentümer*in nicht eingewilligt hat', async () => {
    const other = row({ id: 'doc-4', user_id: 'other', source_url: 'https://gruene.at/x' });
    const { deps } = fakeDeps([WOLKE, other], {
      hasAiConsent: vi.fn(async (id: string) => id !== 'other'),
    });
    const result = await reindexNotebookSources('nb-1', OWNER, deps);
    expect(result).toMatchObject({ queued: ['doc-1'], consentMissing: 1 });
  });
});

describe('processUploadedDocument — neu indexieren', () => {
  const storeDocumentVectors = vi.fn();
  const deleteDocumentVectors = vi.fn();
  const updateDocumentMetadata = vi.fn();

  const wolkeDoc = {
    id: 'doc-1',
    title: 'Antrag',
    filename: 'antrag.pdf',
    source_type: 'wolke',
    wolke_share_link_id: 'share-1',
    wolke_file_path: '/public.php/webdav/a.pdf',
    source_url: null,
    metadata: { reindex_origin: 'wolke', tags: ['Haushalt'], content_preview: 'alt' },
  };

  beforeEach(() => {
    fetchOriginal.mockReset().mockResolvedValue({
      buffer: Buffer.from('%PDF'),
      mimetype: 'application/pdf',
      originalname: 'antrag.pdf',
      size: 4,
    });
    extractDocumentFromFile.mockReset().mockResolvedValue({
      text: '## Seite 1\n\nNeu',
      pageCount: 1,
      extractionMethod: 'mistral-ocr',
    });
    chunkAndEmbedText
      .mockReset()
      .mockResolvedValue({ chunks: [{ text: 'Neu' }], embeddings: [[0.1]] });
    storeDocumentVectors.mockReset().mockResolvedValue(undefined);
    deleteDocumentVectors.mockReset().mockResolvedValue(undefined);
    updateDocumentMetadata.mockReset().mockResolvedValue(undefined);
  });

  const run = () =>
    processUploadedDocument(
      { updateDocumentMetadata, getDocumentById: vi.fn(async () => wolkeDoc) } as never,
      { storeDocumentVectors, deleteDocumentVectors } as never,
      'doc-1',
      OWNER
    );

  it('holt das Original, ersetzt die Punkte und behält ID, Tags und Wolke-Herkunft', async () => {
    const result = await run();

    expect(fetchOriginal).toHaveBeenCalledWith(
      { kind: 'wolke', shareLinkId: 'share-1', filePath: '/public.php/webdav/a.pdf' },
      wolkeDoc,
      OWNER
    );
    expect(extractDocumentFromFile.mock.calls[0]?.[1]).toEqual({ pageMarkers: true });
    expect(result.id).toBe('doc-1');
    expect(deleteDocumentVectors).toHaveBeenCalledWith('doc-1', OWNER);
    expect(storeDocumentVectors.mock.calls[0]?.[1]).toBe('doc-1');
    expect(storeDocumentVectors.mock.calls[0]?.[4]).toMatchObject({
      wolkeShareLinkId: 'share-1',
      wolkeFilePath: '/public.php/webdav/a.pdf',
    });
    const final = updateDocumentMetadata.mock.calls.at(-1)?.[2] as Record<string, unknown>;
    expect(final).toMatchObject({
      status: 'completed',
      pageCount: 1,
      additionalMetadata: expect.objectContaining({ tags: ['Haushalt'], reindex_origin: null }),
    });
    expect(final).not.toHaveProperty('title');
  });

  it('nimmt Datum und Gremium aus den Metadaten in die neue Nutzlast mit', async () => {
    const withMeta = {
      ...wolkeDoc,
      metadata: {
        ...wolkeDoc.metadata,
        published_at: '2025-01-08',
        doc_meta: { gremium: 'Landesvorstand' },
      },
    };
    await processUploadedDocument(
      { updateDocumentMetadata, getDocumentById: vi.fn(async () => withMeta) } as never,
      { storeDocumentVectors, deleteDocumentVectors } as never,
      'doc-1',
      OWNER
    );
    expect(storeDocumentVectors.mock.calls[0]?.[4]).toMatchObject({
      additionalPayload: { published_at: '2025-01-08', gremium: 'Landesvorstand' },
    });
  });

  it('kommt ohne Datum und Gremium aus, und eine URL-Quelle behält source_url', async () => {
    const urlDoc = {
      ...wolkeDoc,
      filename: 'crawled_1.txt',
      source_type: 'url',
      wolke_share_link_id: null,
      wolke_file_path: null,
      metadata: { reindex_origin: 'url', originalUrl: 'https://gruene.de/a' },
    };
    await processUploadedDocument(
      { updateDocumentMetadata, getDocumentById: vi.fn(async () => urlDoc) } as never,
      { storeDocumentVectors, deleteDocumentVectors } as never,
      'doc-1',
      OWNER
    );
    expect(storeDocumentVectors.mock.calls[0]?.[4]).toMatchObject({
      additionalPayload: { source_url: 'https://gruene.de/a' },
    });
    const payload = (storeDocumentVectors.mock.calls[0]?.[4] as { additionalPayload: object })
      .additionalPayload;
    expect(payload).not.toHaveProperty('published_at');
    expect(payload).not.toHaveProperty('gremium');
  });

  it('scheitert das Holen, bleiben die alten Punkte und die Quelle durchsuchbar', async () => {
    fetchOriginal.mockRejectedValue(new Error('Die Wolke-Freigabe ist nicht mehr verfügbar.'));

    await expect(run()).rejects.toThrow(/Wolke-Freigabe/);

    expect(deleteDocumentVectors).not.toHaveBeenCalled();
    expect(updateDocumentMetadata).toHaveBeenLastCalledWith(
      'doc-1',
      OWNER,
      expect.objectContaining({
        status: 'completed',
        additionalMetadata: expect.objectContaining({
          reindex_origin: null,
          processing_error: expect.stringContaining('Neu indexieren fehlgeschlagen'),
        }),
      })
    );
  });

  it('ohne reindex_origin und ohne Datei bleibt es beim alten Fehler', async () => {
    await expect(
      processUploadedDocument(
        {
          updateDocumentMetadata,
          getDocumentById: vi.fn(async () => ({ ...wolkeDoc, metadata: {} })),
        } as never,
        { storeDocumentVectors, deleteDocumentVectors } as never,
        'doc-1',
        OWNER
      )
    ).rejects.toThrow('Uploaded file not found on disk');
    expect(fetchOriginal).not.toHaveBeenCalled();
    expect(updateDocumentMetadata).toHaveBeenLastCalledWith(
      'doc-1',
      OWNER,
      expect.objectContaining({ status: 'failed' })
    );
  });
});

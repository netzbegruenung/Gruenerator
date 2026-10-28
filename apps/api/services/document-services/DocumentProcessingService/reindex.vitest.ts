/**
 * „Neu indexieren": wer darf, welche Quelle hat noch ein Original, und dass
 * ein zweiter Klick nichts doppelt einreiht. Die Identität der Quelle (ID,
 * Tags, Notebook-Mitgliedschaft) bleibt — geprüft an `processUploadedDocument`.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

const { reindexDocument, REINDEX_UNAVAILABLE_MESSAGE } = await import('./reindex.js');
const { reindexOrigin, isReindexable } = await import('./reindexOrigin.js');
const { processUploadedDocument } = await import('./fileProcessing.js');
const { INGEST_RETRY_DELAYS_MS } = await import('./ingestRetry.js');

const OWNER = 'owner-1';
const EDITOR = 'editor-2';

const row = (over: Partial<ReindexRow> = {}): ReindexRow => ({
  id: 'doc-1',
  user_id: OWNER,
  filename: 'antrag.pdf',
  status: 'completed',
  wolke_share_link_id: null,
  wolke_file_path: null,
  vector_count: 12,
  ...over,
});

const WOLKE = row({ wolke_share_link_id: 'share-1', wolke_file_path: '/public.php/webdav/a.pdf' });
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
  it('reiht Wolke-Dateien ein und merkt sich Herkunft, Vorzustand und Einreihzeit', async () => {
    const { deps, updates } = fakeDeps([WOLKE]);
    expect((await reindexDocument('doc-1', OWNER, {}, deps)).status).toBe('queued');
    expect(updates).toEqual(['doc-1']);
    const sql = (deps.db.query as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0] as string)
      .find((q) => q.includes('UPDATE documents'));
    expect(sql).toContain("'reindex_prev_searchable'");
    expect(sql).toContain("'queued_at', NOW()");
    expect(deps.kick).toHaveBeenCalledTimes(1);
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

  it('nimmt nur Wolke-Dateien in lesbaren Formaten — keine URL-, keine WordPress-Quelle', () => {
    expect(reindexOrigin({ ...WOLKE, filename: 'tabelle.xlsx' })).toBeNull();
    // Eine URL- oder WordPress-Quelle hat keine Wolke-Felder — sie ist nicht dabei.
    expect(reindexOrigin(row({ id: 'wp', filename: 'beitrag.md' }))).toBeNull();
  });

  it('isReindexable kommt ohne wolke_file_path aus', () => {
    const { wolke_file_path: _pfad, ...ohnePfad } = WOLKE;
    expect(isReindexable(ohnePfad)).toBe(true);
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
    metadata: {
      reindex_origin: 'wolke',
      reindex_prev_searchable: true,
      tags: ['Haushalt'],
      content_preview: 'alt',
    },
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
      additionalMetadata: expect.objectContaining({
        reindex_origin: undefined,
        queued_at: undefined,
      }),
    });
    expect(final).not.toHaveProperty('title');
    // Kein Schnappschuss der alten Metadaten: Tags, die während des Laufs
    // jemand änderte, überschreibt der Lauf nicht (die DB führt zusammen).
    expect(final.additionalMetadata).not.toHaveProperty('tags');
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

  it('kommt ohne Datum und Gremium aus', async () => {
    await run();
    const payload = (storeDocumentVectors.mock.calls[0]?.[4] as { additionalPayload: object })
      .additionalPayload;
    expect(payload).toEqual({});
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
          reindex_origin: undefined,
          processing_error: expect.stringContaining('Neu indexieren fehlgeschlagen'),
        }),
      })
    );
  });

  it('setzt reindex_prev_searchable auf false, BEVOR die alten Punkte gelöscht werden', async () => {
    // Stürzt der Lauf nach dem Löschen ab und gibt der Worker später auf,
    // darf er nicht „alte Fassung bleibt durchsuchbar" melden — es gibt keine.
    storeDocumentVectors.mockRejectedValue(new Error('qdrant weg'));

    await expect(run()).rejects.toThrow('qdrant weg');

    const markerCall = updateDocumentMetadata.mock.calls.findIndex(
      (c) =>
        (c[2] as { additionalMetadata?: Record<string, unknown> }).additionalMetadata
          ?.reindex_prev_searchable === false
    );
    expect(markerCall).toBeGreaterThanOrEqual(0);
    expect(updateDocumentMetadata.mock.invocationCallOrder[markerCall]).toBeLessThan(
      deleteDocumentVectors.mock.invocationCallOrder[0]!
    );
    // Nach dem Löschen gescheitert: failed, nicht completed.
    expect(updateDocumentMetadata).toHaveBeenLastCalledWith(
      'doc-1',
      OWNER,
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('lässt die alten Punkte stehen, wenn die Markierung nicht geschrieben werden kann', async () => {
    updateDocumentMetadata.mockImplementation(
      async (_id, _u, u: { additionalMetadata?: object }) => {
        if (u.additionalMetadata && 'reindex_prev_searchable' in u.additionalMetadata) {
          throw new Error('db weg');
        }
      }
    );

    await expect(run()).rejects.toThrow('db weg');
    expect(deleteDocumentVectors).not.toHaveBeenCalled();
  });

  it('war die Quelle schon vorher nicht durchsuchbar, bleibt sie failed — mit Grund', async () => {
    fetchOriginal.mockRejectedValue(new Error('Die Wolke-Freigabe ist nicht mehr verfügbar.'));
    const broken = {
      ...wolkeDoc,
      metadata: { ...wolkeDoc.metadata, reindex_prev_searchable: false },
    };

    await expect(
      processUploadedDocument(
        { updateDocumentMetadata, getDocumentById: vi.fn(async () => broken) } as never,
        { storeDocumentVectors, deleteDocumentVectors } as never,
        'doc-1',
        OWNER
      )
    ).rejects.toThrow(/Wolke-Freigabe/);

    expect(updateDocumentMetadata).toHaveBeenLastCalledWith(
      'doc-1',
      OWNER,
      expect.objectContaining({
        status: 'failed',
        additionalMetadata: expect.objectContaining({
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

describe('gescheiterter Upload — das Original bleibt, „Neu indexieren" geht', () => {
  let dir: string;
  let filePath: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reindex-upload-'));
    filePath = path.join(dir, 'antrag.pdf');
    fs.writeFileSync(filePath, '%PDF');
    extractDocumentFromFile.mockReset().mockRejectedValue(new Error('OCR 503'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const failedUpload = () =>
    row({ id: 'doc-5', status: 'failed', vector_count: 0, metadata: { filePath } });

  it('behält die Datei, wenn die Verarbeitung scheitert', async () => {
    const updateDocumentMetadata = vi.fn(async () => undefined);
    await expect(
      processUploadedDocument(
        {
          updateDocumentMetadata,
          getDocumentById: vi.fn(async () => ({
            id: 'doc-5',
            title: 'Antrag',
            filename: 'antrag.pdf',
            metadata: { filePath, mimetype: 'application/pdf', reindex_origin: 'upload' },
          })),
        } as never,
        { storeDocumentVectors: vi.fn(), deleteDocumentVectors: vi.fn() } as never,
        'doc-5',
        OWNER
      )
    ).rejects.toThrow('OCR 503');

    expect(fs.existsSync(filePath)).toBe(true);
    expect(updateDocumentMetadata).toHaveBeenLastCalledWith(
      'doc-5',
      OWNER,
      expect.objectContaining({
        status: 'failed',
        // Die Markierungen eines Neu-Indexierens gehen auch beim Upload weg.
        additionalMetadata: expect.objectContaining({
          processing_error: 'OCR 503',
          reindex_origin: undefined,
          queued_at: undefined,
        }),
      })
    );
  });

  it('gilt als neu indexierbar, solange die Datei da ist', () => {
    expect(reindexOrigin(failedUpload())).toEqual({ kind: 'upload' });
    expect(isReindexable(failedUpload())).toBe(true);
    // Die Notebook-Liste liest metadata als JSON-Text.
    expect(isReindexable({ ...failedUpload(), metadata: JSON.stringify({ filePath }) })).toBe(true);
    fs.rmSync(filePath);
    expect(reindexOrigin(failedUpload())).toBeNull();
  });

  it('prüft bei einer fertigen Quelle das Dateisystem gar nicht erst', () => {
    // Die Datei liegt noch — trotzdem nein: fertig heißt, sie ist gelöscht,
    // und die Notebook-Liste soll pro fertiger Zeile keinen fs-Aufruf zahlen.
    expect(isReindexable({ ...failedUpload(), status: 'completed' })).toBe(false);
  });

  it('reiht ihn wieder ein', async () => {
    const { deps, updates } = fakeDeps([failedUpload()]);
    expect(await reindexDocument('doc-5', OWNER, {}, deps)).toEqual({
      status: 'queued',
      message: 'Wird neu indexiert.',
    });
    expect(updates).toEqual(['doc-5']);
    expect(deps.kick).toHaveBeenCalledTimes(1);
  });
});

describe('vorübergehender Fehler — der Worker versucht es von selbst wieder', () => {
  let dir: string;
  let filePath: string;
  const updateDocumentMetadata = vi.fn(async () => undefined);
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-retry-'));
    filePath = path.join(dir, 'antrag.pdf');
    fs.writeFileSync(filePath, '%PDF');
    updateDocumentMetadata.mockClear();
    extractDocumentFromFile
      .mockReset()
      .mockRejectedValue(Object.assign(new Error('Service unavailable'), { statusCode: 503 }));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const runWith = (ingestRetries: number) =>
    processUploadedDocument(
      {
        updateDocumentMetadata,
        getDocumentById: vi.fn(async () => ({
          id: 'doc-6',
          title: 'Antrag',
          filename: 'antrag.pdf',
          metadata: { filePath, mimetype: 'application/pdf', ingest_retries: ingestRetries },
        })),
      } as never,
      { storeDocumentVectors: vi.fn(), deleteDocumentVectors: vi.fn() } as never,
      'doc-6',
      OWNER,
      { ingestRetries }
    );

  it('reiht das Dokument mit Wartezeit wieder ein, statt es aufzugeben', async () => {
    const before = Date.now();
    await expect(runWith(1)).rejects.toThrow('Service unavailable');

    const last = updateDocumentMetadata.mock.calls.at(-1) as unknown as [
      string,
      string,
      { status: string; processingAttempts: number; additionalMetadata: Record<string, unknown> },
    ];
    expect(last[2].status).toBe('uploaded');
    // Die Wiederholung ist gewollt — sie zählt nicht gegen den Absturzschutz.
    expect(last[2].processingAttempts).toBe(0);
    expect(last[2].additionalMetadata.ingest_retries).toBe(2);
    const retryAt = Date.parse(last[2].additionalMetadata.retry_after as string);
    expect(retryAt).toBeGreaterThanOrEqual(before + INGEST_RETRY_DELAYS_MS[1]!);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('gibt auf, wenn keine Wiederholung mehr zusteht — und räumt die Zähler ab', async () => {
    await expect(runWith(INGEST_RETRY_DELAYS_MS.length)).rejects.toThrow('Service unavailable');
    expect(updateDocumentMetadata).toHaveBeenLastCalledWith(
      'doc-6',
      OWNER,
      expect.objectContaining({
        status: 'failed',
        additionalMetadata: expect.objectContaining({
          retry_after: undefined,
          ingest_retries: undefined,
        }),
      })
    );
  });
});

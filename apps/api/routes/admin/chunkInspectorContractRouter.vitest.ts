/**
 * Drei Dinge, die leise falsch werden könnten: das Admin-Gatter fällt weg (dann
 * liest jede angemeldete Person fremde Dokumente), die Sammlung wird über die
 * unvollständige Zweitkopie SYSTEM_COLLECTION_MAP aufgelöst (dann landet ein
 * Landesverbands-Dokument in 'documents' und die Liste ist leer), und die Suche
 * gibt eine sammlungsweite Trefferliste als dokumentbezogen aus.
 *
 * Bauform nach routes/agents/agentVisibilityContractRouter.vitest.ts:9-43.
 */
import { inspectDocumentResponseSchema } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireInstanceAdmin = vi.fn();
const inspectDocumentChunks = vi.fn();
const getSearchContext = vi.fn();
const drizzleSelect = vi.fn();
const getNotebookCollection = vi.fn();
const isDocumentInCollection = vi.fn();

vi.mock('../../utils/adminAuthz.js', () => ({ requireInstanceAdmin }));

vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: class {
    getNotebookCollection = getNotebookCollection;
    isDocumentInCollection = isDocumentInCollection;
  },
}));

vi.mock('../../services/document-services/DocumentSearchService/index.js', () => ({
  DocumentSearchService: class {
    inspectDocumentChunks = inspectDocumentChunks;
  },
}));

vi.mock('../../services/notebook/index.js', () => ({
  notebookQAService: { getSearchContext },
}));

vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: drizzleSelect }) }) }),
  }),
}));

const req = { user: { id: 'admin-1', email: 'admin@example.org' } } as never;

async function loadRouter() {
  const mod = await import('./chunkInspectorContractRouter.js');
  return mod.chunkInspectorContractRouter;
}

function chunk(index: number, over: Record<string, unknown> = {}) {
  return {
    index,
    page: null,
    text: `Chunk ${index}`,
    charCount: 7,
    tokenCount: 7,
    qualityScore: null,
    hasTable: false,
    embeddingPresent: true,
    sparsePresent: true,
    ...over,
  };
}

beforeEach(() => {
  requireInstanceAdmin.mockReset().mockResolvedValue(true);
  drizzleSelect.mockReset().mockResolvedValue([]);
  getSearchContext.mockReset().mockResolvedValue({ sortedResults: [] });
  getNotebookCollection.mockReset().mockResolvedValue({
    id: 'nb-1',
    user_id: 'owner-9',
    name: 'Wahlkampf 2026',
  });
  isDocumentInCollection.mockReset().mockResolvedValue(true);
  inspectDocumentChunks.mockReset().mockResolvedValue({
    success: true,
    chunks: [chunk(0), chunk(1)],
    chunkCount: 2,
    nextOffset: null,
    payload: {
      title: 'Grundsatzprogramm',
      filename: 'grundsatz.pdf',
      sourceUrl: 'https://gruene.de/grundsatz.pdf',
      sourceType: 'program',
      extractionMethod: 'docling',
      createdAt: '2026-08-01T10:00:00.000Z',
      maxPage: 12,
    },
    error: null,
  });
});

describe('chunkInspectorContract.inspectDocument', () => {
  it('weist ohne Instanz-Admin mit 403 ab', async () => {
    requireInstanceAdmin.mockResolvedValue(false);
    const router = await loadRouter();
    const res = await router.inspectDocument({
      req,
      params: { documentId: 'doc-1' },
      query: { collection: 'grundsatz-system', offset: 0, limit: 50 },
    } as never);

    expect(res.status).toBe(403);
    expect(inspectDocumentChunks).not.toHaveBeenCalled();
  });

  it('löst die Systemsammlung über getSystemCollectionConfig auf', async () => {
    const router = await loadRouter();
    const res = await router.inspectDocument({
      req,
      params: { documentId: 'doc-1' },
      query: { collection: 'grundsatz-system', offset: 0, limit: 50 },
    } as never);

    expect(res.status).toBe(200);
    expect(inspectDocumentChunks).toHaveBeenCalledWith('doc-1', 'grundsatz_documents', {
      offset: 0,
      limit: 50,
    });
    // Vertragskonform, nicht nur zufällig passend zum Test-Cast.
    const body = inspectDocumentResponseSchema.parse(res.body);
    expect(body.header.qdrantCollection).toBe('grundsatz_documents');
    expect(body.header.isSystemCollection).toBe(true);
  });

  it('nennt die Herkunft aus documents.metadata, wenn eine Postgres-Zeile existiert', async () => {
    const updatedAt = new Date('2026-08-15T09:30:00.000Z');
    drizzleSelect.mockResolvedValue([
      {
        title: 'Grundsatzprogramm (Postgres)',
        filename: 'grundsatz-v2.pdf',
        source_url: 'https://gruene.de/grundsatz-v2.pdf',
        source_type: 'program',
        page_count: 42,
        updated_at: updatedAt,
        metadata: { extractionMethod: 'mistral-ocr' },
      },
    ]);
    const router = await loadRouter();
    const res = await router.inspectDocument({
      req,
      // Kein Systemsammlungs-Schlüssel: der Router überspringt die
      // Postgres-Abfrage sonst ganz (rows = [] bei bekannter Systemsammlung).
      params: { documentId: 'doc-1' },
      query: { collection: 'nb-1', offset: 0, limit: 50 },
    } as never);

    const body = inspectDocumentResponseSchema.parse(res.body);
    expect(body.header.extractionMethod).toBe('mistral-ocr');
    expect(body.header.extractionMethodOrigin).toBe('postgres_metadata');
    expect(body.header.title).toBe('Grundsatzprogramm (Postgres)');
    expect(body.header.filename).toBe('grundsatz-v2.pdf');
    expect(body.header.sourceUrl).toBe('https://gruene.de/grundsatz-v2.pdf');
    expect(body.header.sourceType).toBe('program');
    expect(body.header.pageCount).toBe(42);
    expect(body.header.indexedAt).toBe(updatedAt.toISOString());
  });

  it('nennt die Herkunft des Extraktionsverfahrens', async () => {
    const router = await loadRouter();
    const res = await router.inspectDocument({
      req,
      params: { documentId: 'doc-1' },
      query: { collection: 'grundsatz-system', offset: 0, limit: 50 },
    } as never);

    const body = res.body as {
      header: { extractionMethod: string; extractionMethodOrigin: string };
    };
    expect(body.header.extractionMethod).toBe('docling');
    expect(body.header.extractionMethodOrigin).toBe('qdrant_payload');
  });

  it('gibt den Titel-Präfix zurück, der vor dem Einbetten gesetzt wurde', async () => {
    const router = await loadRouter();
    const res = await router.inspectDocument({
      req,
      params: { documentId: 'doc-1' },
      query: { collection: 'grundsatz-system', offset: 0, limit: 50 },
    } as never);

    const body = res.body as { header: { embeddingTitlePrefix: string | null } };
    expect(body.header.embeddingTitlePrefix).toBe('Grundsatzprogramm');
  });

  it('antwortet 404, wenn keine Punkte da sind', async () => {
    inspectDocumentChunks.mockResolvedValue({
      success: false,
      chunks: [],
      chunkCount: 0,
      nextOffset: null,
      payload: null,
      error: 'No chunks found',
    });
    const router = await loadRouter();
    const res = await router.inspectDocument({
      req,
      params: { documentId: 'doc-1' },
      query: { collection: 'grundsatz-system', offset: 0, limit: 50 },
    } as never);

    expect(res.status).toBe(404);
  });

  it('reicht nextOffset durch', async () => {
    inspectDocumentChunks.mockResolvedValue({
      success: true,
      chunks: [chunk(0)],
      chunkCount: 3,
      nextOffset: 1,
      payload: null,
      error: null,
    });
    const router = await loadRouter();
    const res = await router.inspectDocument({
      req,
      params: { documentId: 'doc-1' },
      query: { collection: 'grundsatz-system', offset: 0, limit: 1 },
    } as never);

    expect((res.body as { nextOffset: number | null }).nextOffset).toBe(1);
  });
});

describe('chunkInspectorContract.inspectSearch (Systemsammlung)', () => {
  it('meldet scoped: false und markiert nur die Treffer dieses Dokuments', async () => {
    getSearchContext.mockResolvedValue({
      sortedResults: [
        { document_id: 'doc-1', chunk_index: 3, similarity: 0.81 },
        { document_id: 'doc-2', chunk_index: 0, similarity: 0.77 },
        { document_id: 'doc-1', chunk_index: 9, similarity: 0.64 },
      ],
    });
    const router = await loadRouter();
    const res = await router.inspectSearch({
      req,
      params: { documentId: 'doc-1' },
      query: { collection: 'grundsatz-system', query: 'Klimageld' },
    } as never);

    expect(res.status).toBe(200);
    const body = res.body as {
      hits: { index: number; similarity: number }[];
      totalResults: number;
      scoped: boolean;
    };
    expect(body.scoped).toBe(false);
    expect(body.totalResults).toBe(3);
    expect(body.hits).toEqual([
      { index: 3, similarity: 0.81 },
      { index: 9, similarity: 0.64 },
    ]);
  });

  it('weist ohne Instanz-Admin mit 403 ab', async () => {
    requireInstanceAdmin.mockResolvedValue(false);
    const router = await loadRouter();
    const res = await router.inspectSearch({
      req,
      params: { documentId: 'doc-1' },
      query: { collection: 'grundsatz-system', query: 'Klimageld' },
    } as never);

    expect(res.status).toBe(403);
    expect(getSearchContext).not.toHaveBeenCalled();
  });
});

describe('chunkInspectorContract.inspectSearch (Nutzer-Notebook)', () => {
  it('schränkt über getDocumentIdsFn auf dieses Dokument ein und meldet scoped: true', async () => {
    getSearchContext.mockResolvedValue({
      sortedResults: [{ document_id: 'doc-1', chunk_index: 2, similarity: 0.9 }],
    });
    const router = await loadRouter();
    const res = await router.inspectSearch({
      req,
      params: { documentId: 'doc-1' },
      query: { collection: 'nb-1', query: 'Hitzeschutz' },
    } as never);

    expect(res.status).toBe(200);
    const body = res.body as { scoped: boolean; hits: { index: number }[] };
    expect(body.scoped).toBe(true);
    expect(body.hits).toEqual([{ index: 2, similarity: 0.9 }]);

    const params = getSearchContext.mock.calls[0][0];
    await expect(params.getDocumentIdsFn('nb-1')).resolves.toEqual(['doc-1']);
  });

  it('fährt mit der Kennung der Eigentümerin — checkNotebookAccess kennt keinen Admin', async () => {
    const router = await loadRouter();
    await router.inspectSearch({
      req,
      params: { documentId: 'doc-1' },
      query: { collection: 'nb-1', query: 'Hitzeschutz' },
    } as never);

    const params = getSearchContext.mock.calls[0][0];
    expect(params.userId).toBe('owner-9');
    await expect(params.getCollectionFn('nb-1')).resolves.toMatchObject({ user_id: 'owner-9' });
  });

  it('antwortet 404, wenn es das Notebook nicht gibt', async () => {
    getNotebookCollection.mockResolvedValue(null);
    const router = await loadRouter();
    const res = await router.inspectSearch({
      req,
      params: { documentId: 'doc-1' },
      query: { collection: 'nb-weg', query: 'Hitzeschutz' },
    } as never);

    expect(res.status).toBe(404);
    expect(getSearchContext).not.toHaveBeenCalled();
  });

  it('antwortet 404, wenn das Dokument nicht in dieser Sammlung liegt', async () => {
    isDocumentInCollection.mockResolvedValue(false);
    const router = await loadRouter();
    const res = await router.inspectSearch({
      req,
      params: { documentId: 'doc-fremd' },
      query: { collection: 'nb-1', query: 'Hitzeschutz' },
    } as never);

    expect(res.status).toBe(404);
    expect(getSearchContext).not.toHaveBeenCalled();
    expect(isDocumentInCollection).toHaveBeenCalledWith('nb-1', 'doc-fremd');
  });
});

/**
 * Drei Dinge, die leise falsch werden könnten: das Admin-Gatter fällt weg (dann
 * liest jede angemeldete Person fremde Dokumente), die Sammlung wird über die
 * unvollständige Zweitkopie SYSTEM_COLLECTION_MAP aufgelöst (dann landet ein
 * Landesverbands-Dokument in 'documents' und die Liste ist leer), und die Suche
 * gibt eine sammlungsweite Trefferliste als dokumentbezogen aus.
 *
 * Bauform nach routes/agents/agentVisibilityContractRouter.vitest.ts:9-43.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireInstanceAdmin = vi.fn();
const inspectDocumentChunks = vi.fn();
const getSearchContext = vi.fn();
const drizzleSelect = vi.fn();

vi.mock('../../utils/adminAuthz.js', () => ({ requireInstanceAdmin }));

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
    const body = res.body as { header: { qdrantCollection: string; isSystemCollection: boolean } };
    expect(body.header.qdrantCollection).toBe('grundsatz_documents');
    expect(body.header.isSystemCollection).toBe(true);
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

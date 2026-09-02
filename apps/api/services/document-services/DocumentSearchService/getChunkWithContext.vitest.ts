/**
 * #3138: der Abruf fragte `user_<id>_documents` — eine Collection, die
 * COLLECTION_SCHEMAS (qdrantCollectionsSchema.ts:193) nicht kennt und in die
 * kein Schreiber je etwas gelegt hat (vectorOperations.ts:80 upsertet nach
 * 'documents'). Der Nutzer-Zweig konnte deshalb prinzipiell nur 404 liefern.
 *
 * Die erste Zusicherung IST der Fehler: der Collection-Name des Scroll-Aufrufs.
 * Attrappe in der Bauform von inspectDocumentChunks.vitest.ts:35-46.
 */
import { describe, expect, it, vi } from 'vitest';

import { getChunkWithContext } from './documentRetrieval.js';

import type { QdrantOperations } from '../../../database/services/QdrantOperations.js';

const CENTER = { id: 'p-4', payload: { chunk_text: 'Der zitierte Satz.', chunk_index: 4 } };
const NEIGHBOURS = [
  { id: 'p-3', payload: { chunk_text: 'Davor.', chunk_index: 3 } },
  CENTER,
  { id: 'p-5', payload: { chunk_text: 'Danach.', chunk_index: 5 } },
];

function makeOps(scrollResult: unknown[] = [CENTER]) {
  const scrollDocuments = vi.fn().mockResolvedValue(scrollResult);
  const chunkContext = vi.fn().mockResolvedValue({ center: CENTER, context: NEIGHBOURS });
  const ops = { scrollDocuments, getChunkWithContext: chunkContext } as unknown as QdrantOperations;
  return { ops, scrollDocuments, chunkContext };
}

describe('getChunkWithContext — Collection', () => {
  it('scrollt exakt die Collection `documents`', async () => {
    const { ops, scrollDocuments } = makeOps();

    await getChunkWithContext(ops, 'user-1', 'doc-1', 4);

    expect(scrollDocuments.mock.calls[0][0]).toBe('documents');
  });

  it('fragt den Nachbar-Abruf in derselben Collection', async () => {
    const { ops, chunkContext } = makeOps();

    await getChunkWithContext(ops, 'user-1', 'doc-1', 4);

    expect(chunkContext.mock.calls[0][0]).toBe('documents');
  });
});

describe('getChunkWithContext — Filter', () => {
  it('führt alle drei Klauseln: user_id, document_id, chunk_index', async () => {
    const { ops, scrollDocuments } = makeOps();

    await getChunkWithContext(ops, 'user-1', 'doc-1', 4);

    expect(scrollDocuments.mock.calls[0][1]).toEqual({
      must: [
        { key: 'user_id', match: { value: 'user-1' } },
        { key: 'document_id', match: { value: 'doc-1' } },
        { key: 'chunk_index', match: { value: 4 } },
      ],
    });
  });

  it('sucht chunk_index 0, wenn 0 verlangt ist', async () => {
    const { ops, scrollDocuments } = makeOps();

    await getChunkWithContext(ops, 'user-1', 'doc-1', 0);

    expect(scrollDocuments.mock.calls[0][1].must).toContainEqual({
      key: 'chunk_index',
      match: { value: 0 },
    });
  });
});

describe('getChunkWithContext — Antwortform (F0)', () => {
  it('liefert centerChunk und contextChunks mit gesetztem isCenter', async () => {
    const { ops } = makeOps();

    const result = await getChunkWithContext(ops, 'user-1', 'doc-1', 4);

    expect(result.success).toBe(true);
    expect(result.centerChunk).toEqual({ text: 'Der zitierte Satz.', chunkIndex: 4 });
    expect(result.contextChunks).toEqual([
      { text: 'Davor.', chunkIndex: 3, isCenter: false },
      { text: 'Der zitierte Satz.', chunkIndex: 4, isCenter: true },
      { text: 'Danach.', chunkIndex: 5, isCenter: false },
    ]);
  });

  it('gibt bei leerer Scroll-Antwort `Chunk not found` zurück — die Form, die die Route in einen 404 übersetzt (qdrantController.ts:394-399)', async () => {
    const { ops, chunkContext } = makeOps([]);

    const result = await getChunkWithContext(ops, 'user-1', 'doc-1', 4);

    expect(result).toEqual({ success: false, error: 'Chunk not found' });
    expect(chunkContext).not.toHaveBeenCalled();
  });

  it('gibt `Failed to retrieve context` zurück, wenn der Nachbar-Abruf keinen Mittelpunkt liefert', async () => {
    const { ops, chunkContext } = makeOps();
    chunkContext.mockResolvedValueOnce({ center: null, context: [] });

    const result = await getChunkWithContext(ops, 'user-1', 'doc-1', 4);

    expect(result).toEqual({ success: false, error: 'Failed to retrieve context' });
  });

  it('reicht das window durch (Vorgabe 2)', async () => {
    const { ops, chunkContext } = makeOps();

    await getChunkWithContext(ops, 'user-1', 'doc-1', 4);
    expect(chunkContext.mock.calls[0][2]).toEqual({ window: 2 });

    await getChunkWithContext(ops, 'user-1', 'doc-1', 4, { window: 5 });
    expect(chunkContext.mock.calls[1][2]).toEqual({ window: 5 });
  });
});

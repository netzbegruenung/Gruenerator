/**
 * Der Punkt, an dem die Auskunft still falsch würde: `scrollDocuments` castet
 * `p.vector` blind auf `number[]` (batchOperations.ts:217), bei benannten
 * Vektoren liefert Qdrant aber `{ '': [...], bm25: {...} }`. Wer den deklarierten
 * Typ glaubt, meldet für jeden BM25-Punkt „kein Sparse-Vektor".
 */
import { describe, expect, it, vi } from 'vitest';

import { inspectDocumentChunks } from './documentRetrieval.js';

import type { QdrantOperations } from '../../../database/services/QdrantOperations.js';

function point(index: number, extra: Record<string, unknown> = {}, vector: unknown = [0.1, 0.2]) {
  return {
    id: 1000 + index,
    payload: {
      document_id: 'doc-1',
      chunk_index: index,
      chunk_text: `Chunk ${index}`,
      token_count: 7,
      title: 'Wahlprogramm',
      filename: 'programm.pdf',
      created_at: '2026-08-01T10:00:00.000Z',
      ...extra,
    },
    vector,
  };
}

function opsReturning(points: unknown[]): QdrantOperations {
  return { scrollDocuments: vi.fn().mockResolvedValue(points) } as unknown as QdrantOperations;
}

describe('inspectDocumentChunks — Vektor-Auskunft', () => {
  it('erkennt den benannten Sparse-Vektor im Objekt', async () => {
    const ops = opsReturning([
      point(0, {}, { '': [0.1, 0.2], bm25: { indices: [1], values: [2] } }),
    ]);
    const result = await inspectDocumentChunks(ops, 'doc-1', 'documents', { offset: 0, limit: 50 });

    expect(result.chunks[0].embeddingPresent).toBe(true);
    expect(result.chunks[0].sparsePresent).toBe(true);
  });

  it('meldet für ein blosses Vektor-Array keinen Sparse-Vektor', async () => {
    const ops = opsReturning([point(0, {}, [0.1, 0.2])]);
    const result = await inspectDocumentChunks(ops, 'doc-1', 'documents', { offset: 0, limit: 50 });

    expect(result.chunks[0].embeddingPresent).toBe(true);
    expect(result.chunks[0].sparsePresent).toBe(false);
  });

  it('meldet ohne Vektor (null oder fehlend) weder embedding noch sparse', async () => {
    const withNullVector = point(0, {}, null);
    const withoutVectorField = { id: 2000, payload: { ...withNullVector.payload, chunk_index: 1 } };
    const ops = opsReturning([withNullVector, withoutVectorField]);
    const result = await inspectDocumentChunks(ops, 'doc-1', 'documents', { offset: 0, limit: 50 });

    expect(result.chunks[0].embeddingPresent).toBe(false);
    expect(result.chunks[0].sparsePresent).toBe(false);
    expect(result.chunks[1].embeddingPresent).toBe(false);
    expect(result.chunks[1].sparsePresent).toBe(false);
  });
});

describe('inspectDocumentChunks — Felder', () => {
  it('lässt qualityScore und page null, wenn die Nutzlast sie nicht trägt', async () => {
    const ops = opsReturning([point(0)]);
    const result = await inspectDocumentChunks(ops, 'doc-1', 'documents', { offset: 0, limit: 50 });

    expect(result.chunks[0].qualityScore).toBeNull();
    expect(result.chunks[0].page).toBeNull();
    expect(result.chunks[0].charCount).toBe('Chunk 0'.length);
  });

  it('liest quality_score, page_number und extraction_method, wenn sie da sind', async () => {
    const ops = opsReturning([
      point(0, { quality_score: 0.31, page_number: 4, extraction_method: 'docling' }),
    ]);
    const result = await inspectDocumentChunks(ops, 'doc-1', 'programme', { offset: 0, limit: 50 });

    expect(result.chunks[0].qualityScore).toBe(0.31);
    expect(result.chunks[0].page).toBe(4);
    expect(result.payload?.extractionMethod).toBe('docling');
    expect(result.payload?.maxPage).toBe(4);
  });

  it('erkennt eine Tabelle an zwei Zeilen mit je zwei Pipes', async () => {
    const ops = opsReturning([
      point(0, { chunk_text: '| A | B |\n| 1 | 2 |' }),
      point(1, { chunk_text: 'Ein Satz | mit einem Strich' }),
    ]);
    const result = await inspectDocumentChunks(ops, 'doc-1', 'documents', { offset: 0, limit: 50 });

    expect(result.chunks[0].hasTable).toBe(true);
    expect(result.chunks[1].hasTable).toBe(false);
  });
});

describe('inspectDocumentChunks — Seitenwechsel', () => {
  it('schneidet die Seite und meldet den nächsten Versatz', async () => {
    const ops = opsReturning([point(2), point(0), point(1)]);
    const result = await inspectDocumentChunks(ops, 'doc-1', 'documents', { offset: 0, limit: 2 });

    expect(result.chunks.map((c) => c.index)).toEqual([0, 1]);
    expect(result.chunkCount).toBe(3);
    expect(result.nextOffset).toBe(2);
  });

  it('meldet auf der letzten Seite nextOffset null', async () => {
    const ops = opsReturning([point(0), point(1), point(2)]);
    const result = await inspectDocumentChunks(ops, 'doc-1', 'documents', { offset: 2, limit: 2 });

    expect(result.chunks.map((c) => c.index)).toEqual([2]);
    expect(result.nextOffset).toBeNull();
  });

  it('meldet ohne Punkte einen Fehlschlag statt einer leeren Erfolgsantwort', async () => {
    const ops = opsReturning([]);
    const result = await inspectDocumentChunks(ops, 'doc-1', 'documents', { offset: 0, limit: 50 });

    expect(result.success).toBe(false);
    expect(result.error).toBe('No chunks found');
  });
});

describe('inspectDocumentChunks — Qdrant-Scroll über mehrere Seiten', () => {
  it('blättert über den Punkt-ID-Cursor weiter und zählt den inklusiven Wiederholer nur einmal', async () => {
    // Volle Seite: 256 Punkte, chunk_index 0..255. `scrollDocuments` gibt bei
    // Qdrant den Cursor-Punkt als erstes Element der Folgeseite noch einmal
    // zurück — hier nachgebildet, indem dieselbe id in der zweiten Seite
    // wiederkehrt.
    const pageOne = Array.from({ length: 256 }, (_, i) => point(i));
    const cursorId = pageOne[pageOne.length - 1]!.id;
    const pageTwo = [point(255), point(256), point(257)];

    const scrollDocuments = vi.fn().mockResolvedValueOnce(pageOne).mockResolvedValueOnce(pageTwo);
    const ops = { scrollDocuments } as unknown as QdrantOperations;

    const result = await inspectDocumentChunks(ops, 'doc-1', 'documents', {
      offset: 0,
      limit: 300,
    });

    expect(scrollDocuments).toHaveBeenCalledTimes(2);
    // Zweiter Aufruf blättert mit der letzten id der ersten Seite als Versatz.
    expect(scrollDocuments.mock.calls[1]?.[2]).toMatchObject({ offset: cursorId });

    // 256 aus Seite eins + 3 aus Seite zwei − 1 doppelter Cursor-Punkt = 258.
    expect(result.chunkCount).toBe(258);
    expect(result.chunks.filter((c) => c.index === 255)).toHaveLength(1);
    expect(result.chunks.map((c) => c.index)).toEqual(Array.from({ length: 258 }, (_, i) => i));
  });
});

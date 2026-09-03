/**
 * Die Identitätsklausel des Chunk-Abrufs: gescrapte Systemsammlungen
 * (kommunalwiki_documents, grundsatz_documents, …) tragen KEIN document_id in
 * der Nutzlast — ihre Identität ist source_url, und genau diese URL mintet
 * SearchResultProcessor.ts:39 (`r.document_id || sourceUrl`) als documentId
 * der Zitationen. Eine URL-förmige ID muss deshalb über source_url gefiltert
 * werden; alles andere bleibt beim indizierten document_id.
 */
import { describe, expect, it, vi } from 'vitest';

import { getDocumentChunks } from './documentRetrieval.js';

import type { QdrantFilter } from './types.js';
import type { QdrantOperations } from '../../../database/services/QdrantOperations.js';

function opsCapturing() {
  const captured: { collection?: string; filter?: QdrantFilter } = {};
  const ops = {
    scrollDocuments: vi.fn(async (collection: string, filter: QdrantFilter) => {
      captured.collection = collection;
      captured.filter = filter;
      return [{ id: 1, payload: { chunk_index: 0, chunk_text: 'Text', token_count: 3 } }];
    }),
  } as unknown as QdrantOperations;
  return { ops, captured };
}

describe('getDocumentChunks — Identitätsklausel', () => {
  it('filtert URL-förmige IDs in Systemsammlungen über source_url', async () => {
    const { ops, captured } = opsCapturing();
    const url = 'https://kommunalwiki.boell.de/index.php/Zusammenarbeit_im_Team';
    const result = await getDocumentChunks(ops, 'user-1', url, {
      qdrantCollection: 'kommunalwiki_documents',
    });

    expect(result.success).toBe(true);
    expect(captured.filter).toEqual({ must: [{ key: 'source_url', match: { value: url } }] });
  });

  it('filtert nicht-URL-IDs in Systemsammlungen weiter über document_id', async () => {
    const { ops, captured } = opsCapturing();
    await getDocumentChunks(ops, 'user-1', 'doc-1', { qdrantCollection: 'grundsatz_documents' });

    expect(captured.filter).toEqual({ must: [{ key: 'document_id', match: { value: 'doc-1' } }] });
  });

  it('bindet Nutzerdokumente unverändert an user_id + document_id', async () => {
    const { ops, captured } = opsCapturing();
    await getDocumentChunks(ops, 'user-1', 'doc-1');

    expect(captured.collection).toBe('documents');
    expect(captured.filter).toEqual({
      must: [
        { key: 'user_id', match: { value: 'user-1' } },
        { key: 'document_id', match: { value: 'doc-1' } },
      ],
    });
  });
});

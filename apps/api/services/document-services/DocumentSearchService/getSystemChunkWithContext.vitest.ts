/**
 * #3232: Zitationen aus gescrapten Systemsammlungen (kommunalwiki_documents,
 * grundsatz_documents, …) tragen die Quell-URL als documentId — die Punkte
 * dort haben KEIN document_id in der Nutzlast, ihre Identität ist die
 * indizierte source_url. Die Vorgängerin filterte document_id und fiel auf
 * title zurück; eine URL-förmige ID fand nie etwas. Dasselbe galt für die
 * Collection-Erkennung (detectSystemCollection), die deshalb auf 'user'
 * zurückfiel und die Route in einen 404 lief.
 *
 * Attrappe in der Bauform von getChunkWithContext.vitest.ts:23-28.
 */
import { describe, expect, it, vi } from 'vitest';

import { detectSystemCollection, getSystemChunkWithContext } from './documentRetrieval.js';

import type { QdrantOperations } from '../../../database/services/QdrantOperations.js';

const URL_ID = 'https://kommunalwiki.boell.de/index.php/Radverkehr';
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

describe('getSystemChunkWithContext — Identitätsfilter', () => {
  it('filtert URL-förmige IDs über source_url, nicht document_id', async () => {
    const { ops, scrollDocuments } = makeOps();

    await getSystemChunkWithContext(ops, 'kommunalwiki_documents', URL_ID, 4);

    expect(scrollDocuments.mock.calls[0][1]).toEqual({
      must: [
        { key: 'source_url', match: { value: URL_ID } },
        { key: 'chunk_index', match: { value: 4 } },
      ],
    });
  });

  it('filtert gewöhnliche IDs weiterhin über document_id', async () => {
    const { ops, scrollDocuments } = makeOps();

    await getSystemChunkWithContext(ops, 'grundsatz_documents', '20200125_Grundsatzprogramm', 4);

    expect(scrollDocuments.mock.calls[0][1].must).toContainEqual({
      key: 'document_id',
      match: { value: '20200125_Grundsatzprogramm' },
    });
  });

  it('fällt bei leerem Erst-Treffer auf den title-Filter zurück', async () => {
    const { ops, scrollDocuments } = makeOps();
    scrollDocuments.mockResolvedValueOnce([]);

    await getSystemChunkWithContext(ops, 'grundsatz_documents', 'Gruenes-Grundsatzprogramm', 4);

    expect(scrollDocuments.mock.calls[1][1]).toEqual({
      must: [
        { key: 'title', match: { value: 'Gruenes-Grundsatzprogramm' } },
        { key: 'chunk_index', match: { value: 4 } },
      ],
    });
  });

  it('scrollt die übergebene Collection und fragt dort auch die Nachbarn', async () => {
    const { ops, scrollDocuments, chunkContext } = makeOps();

    await getSystemChunkWithContext(ops, 'kommunalwiki_documents', URL_ID, 4);

    expect(scrollDocuments.mock.calls[0][0]).toBe('kommunalwiki_documents');
    expect(chunkContext.mock.calls[0][0]).toBe('kommunalwiki_documents');
  });
});

describe('getSystemChunkWithContext — Antwortform', () => {
  it('liefert centerChunk und contextChunks mit gesetztem isCenter', async () => {
    const { ops } = makeOps();

    const result = await getSystemChunkWithContext(ops, 'kommunalwiki_documents', URL_ID, 4);

    expect(result.success).toBe(true);
    expect(result.centerChunk).toEqual({ text: 'Der zitierte Satz.', chunkIndex: 4 });
    expect(result.contextChunks).toEqual([
      { text: 'Davor.', chunkIndex: 3, isCenter: false },
      { text: 'Der zitierte Satz.', chunkIndex: 4, isCenter: true },
      { text: 'Danach.', chunkIndex: 5, isCenter: false },
    ]);
  });

  it('meldet `Chunk not found in collection`, wenn beide Filter leer bleiben — die Form, die die Route in einen 404 übersetzt', async () => {
    const { ops, chunkContext } = makeOps([]);

    const result = await getSystemChunkWithContext(ops, 'kommunalwiki_documents', URL_ID, 4);

    expect(result).toEqual({ success: false, error: 'Chunk not found in collection' });
    expect(chunkContext).not.toHaveBeenCalled();
  });

  it('reicht das window durch (Vorgabe 2)', async () => {
    const { ops, chunkContext } = makeOps();

    await getSystemChunkWithContext(ops, 'kommunalwiki_documents', URL_ID, 4);
    expect(chunkContext.mock.calls[0][2]).toEqual({ window: 2 });

    await getSystemChunkWithContext(ops, 'kommunalwiki_documents', URL_ID, 4, { window: 5 });
    expect(chunkContext.mock.calls[1][2]).toEqual({ window: 5 });
  });
});

const COLLECTIONS = [
  { type: 'grundsatz-system', collection: 'grundsatz_documents' },
  { type: 'kommunalwiki-system', collection: 'kommunalwiki_documents' },
];

describe('detectSystemCollection — Identitätsklausel', () => {
  it('sucht URL-förmige IDs über source_url (oder title)', async () => {
    const { ops, scrollDocuments } = makeOps([]);

    await detectSystemCollection(ops, COLLECTIONS, URL_ID);

    expect(scrollDocuments.mock.calls[0][1]).toEqual({
      should: [
        { key: 'source_url', match: { value: URL_ID } },
        { key: 'title', match: { value: URL_ID } },
      ],
    });
  });

  it('sucht gewöhnliche IDs weiterhin über document_id oder title', async () => {
    const { ops, scrollDocuments } = makeOps([]);

    await detectSystemCollection(ops, COLLECTIONS, 'Gruenes-Grundsatzprogramm');

    expect(scrollDocuments.mock.calls[0][1]).toEqual({
      should: [
        { key: 'document_id', match: { value: 'Gruenes-Grundsatzprogramm' } },
        { key: 'title', match: { value: 'Gruenes-Grundsatzprogramm' } },
      ],
    });
  });

  it('liefert den Typ der ersten Collection mit Treffer', async () => {
    const { ops, scrollDocuments } = makeOps();
    scrollDocuments.mockResolvedValueOnce([]);

    const result = await detectSystemCollection(ops, COLLECTIONS, URL_ID);

    expect(result).toBe('kommunalwiki-system');
    expect(scrollDocuments.mock.calls[1][0]).toBe('kommunalwiki_documents');
  });

  it("liefert 'user', wenn keine Collection trifft — auch wenn einzelne Scrolls werfen", async () => {
    const { ops, scrollDocuments } = makeOps([]);
    scrollDocuments.mockRejectedValueOnce(new Error('collection missing'));

    const result = await detectSystemCollection(ops, COLLECTIONS, URL_ID);

    expect(result).toBe('user');
  });
});

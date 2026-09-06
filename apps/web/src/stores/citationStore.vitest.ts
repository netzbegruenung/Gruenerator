/**
 * Der Pfad des chunk-context-Abrufs.
 *
 * #3232: Zitationen aus gescrapten Systemsammlungen (KommunalWiki, gruene.de,
 * …) tragen die Quell-URL als document_id. Unkodiert zerfällt die URL im Pfad
 * in eigene Segmente und die Express-Route `/:documentId/chunk-context`
 * matcht nie — 404 vor jedem Handler.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();

vi.mock('../components/utils/apiClient', () => ({ default: { get } }));

const { default: useCitationStore } = await import('./citationStore');

beforeEach(() => {
  get.mockReset().mockResolvedValue({ data: { success: true, data: {} } });
});

describe('fetchChunkContext — Pfadbau', () => {
  it('kodiert URL-förmige document_ids, damit die Route matcht', async () => {
    const documentId = 'https://kommunalwiki.boell.de/index.php/Radverkehr';

    await useCitationStore
      .getState()
      .fetchChunkContext(documentId, 4, { document_id: documentId, collection_id: 'kommunalwiki' });

    expect(get.mock.calls[0][0]).toBe(
      `/documents/qdrant/${encodeURIComponent(documentId)}/chunk-context`
    );
  });

  it('lässt gewöhnliche IDs unverändert und reicht collection als Query mit', async () => {
    await useCitationStore
      .getState()
      .fetchChunkContext('doc-1', 4, { document_id: 'doc-1', collection_id: 'grundsatz' });

    expect(get.mock.calls[0][0]).toBe('/documents/qdrant/doc-1/chunk-context');
    expect(get.mock.calls[0][1]).toEqual({
      params: { chunkIndex: 4, window: 2, collection: 'grundsatz' },
    });
  });
});

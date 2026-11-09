/**
 * Was jede Tür außer der Suche für eine Remote-Sammlung tut: Facetten und
 * Nachbar-Chunks gehen an die Quelle, Werkzeuge ohne Gegenstück sagen „nicht
 * verfügbar" — keine Tür fragt unser Qdrant nach einer Sammlung, die es dort
 * nicht gibt.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const qdrant = vi.hoisted(() => ({
  init: vi.fn(async () => undefined),
  getFieldValueCounts: vi.fn(),
  getDateRange: vi.fn(),
}));
vi.mock('../../database/services/QdrantService/index.js', () => ({
  getQdrantInstance: () => qdrant,
}));

const source = vi.hoisted(() => ({
  id: 'bundestag-wrapped' as const,
  label: 'Bundestag-Quelle',
  search: vi.fn(),
  facetCounts: vi.fn(),
  chunks: vi.fn(),
}));
vi.mock('./remoteSources/registry.js', () => ({ getRemoteSource: () => source }));

const { facetDateRange, facetValueCounts } = await import('./collectionFacets.js');
const { resolveSystemCollection } = await import('./systemNotebookSources.js');
const { getRemoteChunkWithContext } =
  await import('../document-services/DocumentSearchService/documentRetrieval.js');
const { getSystemCollectionConfig } = await import('../../config/systemCollectionsConfig.js');
const { REMOTE_TEST_ID, registerRemoteTestCollection } =
  await import('./__fixtures__/remoteSystemCollection.js');
const { RemoteSourceUnavailableError } = await import('./remoteSources/errors.js');

let unregister: () => void;
beforeAll(() => {
  unregister = registerRemoteTestCollection();
});
afterAll(() => unregister());

beforeEach(() => {
  vi.clearAllMocks();
});

const config = () => getSystemCollectionConfig(REMOTE_TEST_ID)!;

describe('facets of a remote collection', () => {
  it('come from the source, never from Qdrant', async () => {
    source.facetCounts.mockResolvedValue([{ value: 'GRÜNE', count: 12 }]);

    expect(await facetValueCounts(config(), 'party')).toEqual([{ value: 'GRÜNE', count: 12 }]);
    expect(source.facetCounts).toHaveBeenCalledWith('party', { match: {} }, 50);
    expect(qdrant.getFieldValueCounts).not.toHaveBeenCalled();
  });

  it('throw on an outage, so getFilters does not cache the gap', async () => {
    source.facetCounts.mockRejectedValue(
      new RemoteSourceUnavailableError('bundestag-wrapped', 'Bundestag-Quelle', 'HTTP 503')
    );
    await expect(facetValueCounts(config(), 'party')).rejects.toThrow('nicht erreichbar');
  });

  it('have no date bounds yet, without asking Qdrant', async () => {
    expect(await facetDateRange(config(), 'published_at')).toEqual({ min: null, max: null });
    expect(qdrant.getDateRange).not.toHaveBeenCalled();
  });
});

describe('notebook_quellen on a remote collection', () => {
  it('says it is not available instead of listing nothing', () => {
    const resolved = resolveSystemCollection('remote-test', ['remote-test']);
    expect(resolved).toEqual({ error: expect.stringContaining('nicht verfügbar') });
  });
});

describe('passage view (chunk context) on a remote collection', () => {
  it('asks the source for the window around the cited chunk', async () => {
    source.chunks.mockResolvedValue([
      { id: 'c1', payload: { chunk_index: 1, chunk_text: 'davor' } },
      { id: 'c2', payload: { chunk_index: 2, chunk_text: 'Zitat' } },
      { id: 'c3', payload: { chunk_index: 3, chunk_text: 'danach' } },
    ]);

    const result = await getRemoteChunkWithContext(source, 'rede:6123-14', 2, { window: 1 });

    expect(source.chunks).toHaveBeenCalledWith('rede:6123-14', [1, 2, 3]);
    expect(result).toMatchObject({
      success: true,
      centerChunk: { text: 'Zitat', chunkIndex: 2 },
      contextChunks: [
        { chunkIndex: 1, isCenter: false },
        { chunkIndex: 2, isCenter: true },
        { chunkIndex: 3, isCenter: false },
      ],
    });
  });

  it('passes the outage message through', async () => {
    source.chunks.mockRejectedValue(
      new RemoteSourceUnavailableError('bundestag-wrapped', 'Bundestag-Quelle', 'timeout')
    );
    expect(await getRemoteChunkWithContext(source, 'rede:6123-14', 0)).toEqual({
      success: false,
      error: 'Bundestag-Quelle gerade nicht erreichbar',
    });
  });
});

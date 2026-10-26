/**
 * Die Stats-Route bedient nur noch ausgelieferte Mobile-Binaries. Begriffe, Themen
 * und Personen müssen dort dieselben sein wie in der Web-Übersicht — also aus
 * `getNotebookOverview` kommen, nicht aus einer eigenen Stichprobe (#3726).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getNotebookOverview = vi.fn();
vi.mock('./notebookOverviewService.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./notebookOverviewService.js')>()),
  getNotebookOverview,
}));
const redisSet = vi.fn(async () => 'OK');
vi.mock('../../utils/redis/client.js', () => ({
  default: { get: vi.fn(async () => null), set: redisSet },
}));
const count = vi.fn(async () => ({ count: 3 }));
const qdrantClient = {
  count,
  scroll: vi.fn(async () => ({ points: [], next_page_offset: null })),
};
/** Schreib-Client: darf für die Statistik nie gefragt werden. */
const writeOnlyClient = {
  count: vi.fn(async () => ({ count: 999 })),
  scroll: vi.fn(async () => ({ points: [], next_page_offset: null })),
};
const contentAvailable = vi.fn(() => true);
const readClient = vi.fn((_collection: string) => qdrantClient);
vi.mock('../../database/services/QdrantService/index.js', () => ({
  getQdrantInstance: () => ({
    init: vi.fn(async () => undefined),
    isContentAvailable: contentAvailable,
    readClient,
    writeClient: () => writeOnlyClient,
    getFieldValueCounts: vi.fn(async () => []),
  }),
}));

const { getNotebookStats } = await import('./notebookStatsService.js');

describe('getNotebookStats', () => {
  beforeEach(() => {
    redisSet.mockClear();
    readClient.mockClear();
    contentAvailable.mockReturnValue(true);
  });

  it('takes terms, topics and persons from the exact overview', async () => {
    getNotebookOverview.mockResolvedValueOnce({
      totals: { documents: 3 },
      topics: [
        { topic: 'klima', count: 2, share: 2 / 3, trend: null, baselineShare: null },
        { topic: 'soziales', count: 1, share: 1 / 3, trend: null, baselineShare: null },
      ],
      persons: [{ person: 'Ada Muster', count: 2, recentCount: 1 }],
      terms: {
        documents: 3,
        words: [{ word: 'Windkraft', count: 3 }],
        rising: [],
        signature: null,
      },
    });

    const stats = await getNotebookStats(['bayern-system']);

    expect(getNotebookOverview).toHaveBeenCalledWith('bayern-system');
    expect(stats.topWords).toEqual([{ word: 'Windkraft', count: 3 }]);
    expect(stats.topicDistribution).toEqual([
      { topic: 'klima', count: 2 },
      { topic: 'soziales', count: 1 },
    ]);
    expect(stats.topicSampleSize).toBe(3);
    expect(stats.topPersons).toEqual([{ person: 'Ada Muster', count: 2 }]);
  });

  it('counts the same documents as the overview, without Instagram posts', async () => {
    getNotebookOverview.mockResolvedValueOnce(null);
    await getNotebookStats(['berlin-system']);
    expect(count).toHaveBeenCalledWith(
      'landesverbaende_documents',
      expect.objectContaining({
        filter: expect.objectContaining({
          must_not: [{ key: 'content_type', match: { value: 'instagram' } }],
        }),
      })
    );
  });

  it('reads the content collection through readClient, never the write client', async () => {
    getNotebookOverview.mockResolvedValueOnce(null);
    const stats = await getNotebookStats(['berlin-system']);

    expect(readClient).toHaveBeenCalledWith('landesverbaende_documents');
    expect(writeOnlyClient.count).not.toHaveBeenCalled();
    expect(stats.totalDocuments).toBe(3);
  });

  it('does not cache empty stats while the content store is unavailable', async () => {
    contentAvailable.mockReturnValue(false);
    const stats = await getNotebookStats(['berlin-system']);

    expect(stats.totalDocuments).toBe(0);
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('caches stats the store answered', async () => {
    getNotebookOverview.mockResolvedValueOnce(null);
    await getNotebookStats(['berlin-system']);
    expect(redisSet).toHaveBeenCalledTimes(1);
  });
});

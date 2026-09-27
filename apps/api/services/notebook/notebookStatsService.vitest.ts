/**
 * Die Stats-Route bedient nur noch ausgelieferte Mobile-Binaries. Begriffe, Themen
 * und Personen müssen dort dieselben sein wie in der Web-Übersicht — also aus
 * `getNotebookOverview` kommen, nicht aus einer eigenen Stichprobe (#3726).
 */
import { describe, expect, it, vi } from 'vitest';

const getNotebookOverview = vi.fn();
vi.mock('./notebookOverviewService.js', () => ({ getNotebookOverview }));
vi.mock('../../utils/redis/client.js', () => ({
  default: { get: vi.fn(async () => null), set: vi.fn(async () => 'OK') },
}));
vi.mock('../../database/services/QdrantService/index.js', () => ({
  getQdrantInstance: () => ({
    init: vi.fn(async () => undefined),
    client: {
      count: vi.fn(async () => ({ count: 3 })),
      scroll: vi.fn(async () => ({ points: [], next_page_offset: null })),
    },
    getFieldValueCounts: vi.fn(async () => []),
  }),
}));

const { getNotebookStats } = await import('./notebookStatsService.js');

describe('getNotebookStats', () => {
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
});

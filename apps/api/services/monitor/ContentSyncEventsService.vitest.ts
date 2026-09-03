/**
 * The what-happened feed reads the LV corpus through two filtered scrolls
 * instead of paging all ~9 000 chunk_index=0 points (#3199). The filter shape
 * is what keeps that cheap, and nothing else pins it: this suite asserts the
 * two filters and that the indexed_at fallback (an article without
 * published_at) still lands on the feed.
 *
 * Run: `npx vitest run services/monitor/ContentSyncEventsService.vitest.ts`
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../utils/redis/jsonCache.js', () => ({
  getCachedJson: vi.fn(async () => null),
  setCachedJson: vi.fn(async () => undefined),
  deleteCachedKey: vi.fn(async () => undefined),
}));

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: vi.fn() }),
}));

vi.mock('./SummaryGraph.js', () => ({ generateDayDigest: vi.fn() }));

const scroll = vi.fn();
vi.mock('../../database/services/QdrantService/index.js', () => ({
  getQdrantInstance: () => ({ init: vi.fn(async () => undefined), client: { scroll } }),
}));

const { getWhatHappened } = await import('./ContentSyncEventsService.js');

function point(payload: Record<string, unknown>) {
  return { id: payload.source_url, payload };
}

describe('loadRecentLvArticles', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T12:00:00Z'));
    scroll.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs one published_at range scroll and one indexed_at fallback scroll', async () => {
    scroll
      .mockResolvedValueOnce({
        points: [
          point({ chunk_index: 0, source_url: 'https://lv/a', published_at: '2026-09-01' }),
          // Belt and braces: a point the filter should not have returned is still dropped.
          point({ chunk_index: 0, source_url: 'https://lv/old', published_at: '2026-07-01' }),
        ],
        next_page_offset: null,
      })
      .mockResolvedValueOnce({
        points: [
          point({
            chunk_index: 0,
            source_url: 'https://lv/b',
            indexed_at: '2026-08-20T10:00:00.000Z',
          }),
        ],
        next_page_offset: null,
      });

    const result = await getWhatHappened({ days: 30 });

    // 30-day window ending 2026-09-03 starts on 2026-08-05.
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll.mock.calls[0][1]).toMatchObject({
      filter: {
        must: [
          { key: 'chunk_index', match: { value: 0 } },
          { key: 'published_at', range: { gte: '2026-08-05' } },
        ],
      },
    });
    expect(scroll.mock.calls[1][1]).toMatchObject({
      filter: {
        must: [
          { key: 'chunk_index', match: { value: 0 } },
          { is_empty: { key: 'published_at' } },
          { key: 'indexed_at', range: { gte: '2026-08-05' } },
        ],
      },
    });

    const urls = result.days.flatMap((d) => d.articles.map((a) => a.sourceUrl));
    expect(urls).toEqual(['https://lv/a', 'https://lv/b']);
    expect(result.days.map((d) => d.date)).toEqual(['2026-09-01', '2026-08-20']);
  });
});

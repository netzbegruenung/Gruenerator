/**
 * Übersicht: the aggregation over head chunks is pure — these tests pin the
 * figures the page shows (month buckets, trends, persons, formats) without Qdrant.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../database/services/QdrantService/index.js', () => ({ getQdrantInstance: vi.fn() }));
vi.mock('../../utils/redis/jsonCache.js', () => ({
  getCachedJson: vi.fn(),
  setCachedJson: vi.fn(),
}));
vi.mock('./notebookKeywordSnapshotService.js', () => ({ getLatestKeywordSnapshot: vi.fn() }));

const { aggregateOverview, toHeadDoc, trendOf } = await import('./notebookOverviewService.js');

const NOW = new Date('2026-09-27T12:00:00Z');

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

let nextId = 0;
function doc(payload: Record<string, unknown>) {
  return toHeadDoc(++nextId, payload);
}

describe('aggregateOverview', () => {
  it('buckets 24 calendar months by the month written in the payload', () => {
    const result = aggregateOverview(
      [
        // 00:30 local time on 1 Sept is 31 Aug in UTC — must stay in September.
        doc({ published_at: '2026-09-01T00:30:00+02:00', primary_topic: 'klima' }),
        doc({ published_at: '2026-09-10', primary_topic: 'klima' }),
        doc({ published_at: '2026-09-11', primary_topic: 'bildung' }),
        doc({ published_at: '2024-10-05', primary_topic: 'klima' }),
        doc({ published_at: '2020-01-01', primary_topic: 'klima' }),
      ],
      NOW,
      null
    );

    expect(result.monthly).toHaveLength(24);
    expect(result.monthly[0]).toEqual({ month: '2024-10', count: 1, topTopic: 'klima' });
    expect(result.monthly.at(-1)).toEqual({ month: '2026-09', count: 3, topTopic: 'klima' });
    expect(result.totals.firstPublished).toBe('2020-01-01');
  });

  it('counts undated and future-dated documents as undated, never in time figures', () => {
    const result = aggregateOverview(
      [
        doc({ published_at: daysAgo(3) }),
        doc({}),
        doc({ published_at: 'kein Datum' }),
        doc({ published_at: '2031-01-01' }),
      ],
      NOW,
      null
    );

    expect(result.totals).toMatchObject({ documents: 4, undated: 3, last30Days: 1 });
    expect(result.recentIds).toHaveLength(1);
  });

  it('splits the last 30 days from the 30 before them', () => {
    const result = aggregateOverview(
      [
        doc({ published_at: daysAgo(1) }),
        doc({ published_at: daysAgo(29) }),
        doc({ published_at: daysAgo(31) }),
        doc({ published_at: daysAgo(90) }),
      ],
      NOW,
      null
    );

    expect(result.totals).toMatchObject({ last30Days: 2, previous30Days: 1 });
  });

  it('keeps only full names and counts each person once per document', () => {
    const result = aggregateOverview(
      [
        doc({ published_at: daysAgo(5), persons: ['Werner Graf', 'Werner Graf', 'Link'] }),
        doc({ published_at: daysAgo(200), persons: ['Werner Graf', 'Schwarz-Rot', 'Merz'] }),
      ],
      NOW,
      null
    );

    expect(result.persons).toEqual([{ person: 'Werner Graf', count: 2, recentCount: 1 }]);
  });

  it('labels formats from content_type_label and falls back to primary_category', () => {
    const result = aggregateOverview(
      [
        doc({ content_type: 'presse', content_type_label: 'Pressemitteilung' }),
        doc({ content_type: 'presse', content_type_label: 'Pressemitteilung' }),
        doc({ primary_category: 'Fachtexte' }),
        doc({ content_type: 'artikel' }),
      ],
      NOW,
      null
    );

    expect(result.contentTypes).toEqual([
      { value: 'presse', label: 'Pressemitteilung', count: 2 },
      { value: 'Fachtexte', label: 'Fachtexte', count: 1 },
      { value: 'artikel', label: 'Artikel', count: 1 },
    ]);
  });

  it('drops unknown topics and reports shares over classified documents only', () => {
    const result = aggregateOverview(
      [
        doc({ primary_topic: 'klima' }),
        doc({ primary_topic: 'klima' }),
        doc({ primary_topic: 'bildung' }),
        doc({ primary_topic: 'astrologie' }),
        doc({}),
      ],
      NOW,
      new Map([['klima', 0.25]])
    );

    expect(result.topics.map((t) => [t.topic, t.count, t.share, t.baselineShare])).toEqual([
      ['klima', 2, 2 / 3, 0.25],
      ['bildung', 1, 1 / 3, 0],
    ]);
  });

  it('marks a topic rising when its recent share clearly exceeds the prior year', () => {
    const recent = Array.from({ length: 20 }, (_, i) =>
      doc({ published_at: daysAgo(10 + i), primary_topic: i < 10 ? 'mobilitaet' : 'klima' })
    );
    const prior = Array.from({ length: 40 }, (_, i) =>
      doc({ published_at: daysAgo(120 + i), primary_topic: i < 4 ? 'mobilitaet' : 'klima' })
    );

    const result = aggregateOverview([...recent, ...prior], NOW, null);
    const trend = Object.fromEntries(result.topics.map((t) => [t.topic, t.trend]));

    expect(trend).toEqual({ mobilitaet: 'up', klima: 'down' });
  });
});

describe('trendOf', () => {
  it('refuses to call a trend on thin windows', () => {
    expect(trendOf(10, 14, 5, 100)).toBeNull();
    expect(trendOf(10, 20, 5, 29)).toBeNull();
  });

  it('calls small moves flat', () => {
    expect(trendOf(11, 100, 10, 100)).toBe('flat');
  });
});

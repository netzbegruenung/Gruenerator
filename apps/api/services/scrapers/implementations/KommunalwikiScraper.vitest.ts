/**
 * Der Crawl läuft über `list=allpages` — also über die Seiten, die es NOCH
 * gibt. Eine Seite, die im Wiki gelöscht wurde, wird deshalb nie wieder
 * besucht, und `deleteArticle` feuert nur, wenn eine lebende Seite neu
 * verarbeitet wird. Ohne einen Abgleich am Ende bleiben ihre Punkte für immer
 * in Qdrant stehen: am 16.09.2026 waren das 131 gelöschte Spam-Seiten mit
 * 2.137 Chunks, 23,9 % der Sammlung (#3198).
 *
 * Die Fälle hier nageln beide Schutzgatter fest. Sie sind nicht dasselbe:
 * das Aufzählungs-Gatter fängt den lauten Ausfall (kein/leeres `allpages`),
 * die Mengenschwelle den leisen — eine Antwort, die erfolgreich aussieht und
 * trotzdem nur einen Teil der Seiten nennt. Ohne die Schwelle würde genau so
 * eine Antwort die Sammlung ausräumen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FakePoint {
  id: number;
  payload: { pageid: number; published_at: string };
}

const scroll = vi.fn();
const del = vi.fn();
const upsert = vi.fn();

let points: FakePoint[] = [];

vi.mock('../../../database/services/QdrantService.js', () => ({
  getQdrantInstance: () => ({
    init: () => Promise.resolve(),
    client: {
      scroll: (...args: unknown[]) => scroll(...args),
      delete: (...args: unknown[]) => del(...args),
      upsert: (...args: unknown[]) => upsert(...args),
    },
  }),
}));

vi.mock('../../ChunkQualityService/index.js', () => ({
  chunkQualityService: { calculateQualityScore: () => 1 },
}));

vi.mock('../../document-services/index.js', () => ({
  smartChunkDocument: (text: string) => Promise.resolve([{ text }]),
  buildEmbeddingTexts: (texts: string[]) => texts,
}));

vi.mock('../../mistral/index.js', () => ({
  mistralEmbeddingService: {
    init: () => Promise.resolve(),
    generateBatchEmbeddings: (texts: string[]) => Promise.resolve(texts.map(() => [0.1, 0.2])),
  },
}));

vi.mock('../syncEventRecorder.js', () => ({
  recordSyncEvent: () => undefined,
  toExcerpt: (t: string) => t.slice(0, 10),
}));

const { KommunalwikiScraper } = await import('./KommunalwikiScraper.js');

/** Live im Wiki: 1 und 2. 999 ist dort gelöscht, steht aber noch in Qdrant. */
const LIVE = [
  { title: 'Radverkehr', pageid: 1 },
  { title: 'Haushalt', pageid: 2 },
];

function collectionWith(pageids: number[]): FakePoint[] {
  return pageids.map((pageid, i) => ({
    id: i + 1,
    // In der Zukunft, damit jede lebende Seite als `already_exists`
    // übersprungen wird — der Test misst das Aufräumen, nicht das Speichern.
    payload: { pageid, published_at: '2030-01-01T00:00:00Z' },
  }));
}

/** MediaWiki: erst die Titelliste, danach je Batch der Seiteninhalt. */
function mockWiki(allpages: Array<{ title: string; pageid: number }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const body = url.includes('list=allpages')
        ? { query: { allpages: allpages } }
        : {
            query: {
              pages: Object.fromEntries(
                allpages.map((a) => [
                  String(a.pageid),
                  {
                    pageid: a.pageid,
                    title: a.title,
                    categories: [],
                    revisions: [
                      { slots: { main: { '*': 'Inhalt' } }, timestamp: '2020-01-01T00:00:00Z' },
                    ],
                  },
                ])
              ),
            },
          };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    })
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  scroll.mockReset();
  del.mockReset();
  upsert.mockReset();

  scroll.mockImplementation((_collection: string, opts: Record<string, unknown>) => {
    const filter = opts.filter as { must?: Array<{ match?: { value?: number } }> } | undefined;
    if (filter?.must?.[0]?.match?.value !== undefined) {
      const pageid = filter.must[0].match!.value;
      return Promise.resolve({ points: points.filter((p) => p.payload.pageid === pageid) });
    }
    return Promise.resolve({ points, next_page_offset: null });
  });
});

/** Alle Punkt-IDs, die über alle delete-Aufrufe hinweg entfernt wurden. */
function deletedIds(): number[] {
  return del.mock.calls.flatMap((c) => ((c[1] as { points?: number[] })?.points ?? []) as number[]);
}

async function crawl(pruneMaxShare?: number) {
  const scraper = new KommunalwikiScraper();
  await scraper.init();
  return scraper.fullCrawl(pruneMaxShare === undefined ? {} : { pruneMaxShare });
}

describe('fullCrawl prunes articles deleted upstream', () => {
  it('deletes exactly the points whose pageid the wiki no longer lists', async () => {
    points = collectionWith([1, 1, 2, 999, 999, 999]);
    mockWiki(LIVE);

    const result = await crawl(0.9);

    // Die drei Punkte von 999 — und nur die.
    expect(deletedIds().sort((a, b) => a - b)).toEqual([4, 5, 6]);
    expect(result.pruned).toBe(3);
    expect(result.pruneSkippedReason).toBeNull();
  });

  it('deletes nothing when every stored pageid is still live', async () => {
    points = collectionWith([1, 2]);
    mockWiki(LIVE);

    const result = await crawl(0.9);

    expect(del).not.toHaveBeenCalled();
    expect(result.pruned).toBe(0);
  });

  it('refuses to prune when the share exceeds the threshold', async () => {
    // 3 von 6 Punkten wären fällig (50 %) — weit über der Vorgabe.
    points = collectionWith([1, 1, 2, 999, 999, 999]);
    mockWiki(LIVE);

    const result = await crawl(0.1);

    expect(del).not.toHaveBeenCalled();
    expect(result.pruned).toBe(0);
    expect(result.pruneSkippedReason).toMatch(/threshold/i);
  });

  it('refuses to prune when the wiki lists no pages at all', async () => {
    // Eine leere, aber erfolgreiche Antwort darf die Sammlung nicht ausräumen.
    points = collectionWith([1, 2, 999]);
    mockWiki([]);

    const result = await crawl(0.9);

    expect(del).not.toHaveBeenCalled();
    expect(result.pruned).toBe(0);
    expect(result.pruneSkippedReason).toMatch(/no pages/i);
  });

  it('does not prune when the page enumeration fails', async () => {
    points = collectionWith([1, 2, 999]);
    // 404 statt Netzwerkfehler: `fetchWithRetry` wiederholt 4xx nicht, der
    // Fall bricht sofort ab statt in die Backoff-Schleife zu laufen.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('nope', { status: 404 })))
    );

    await expect(crawl(0.9)).rejects.toThrow();
    expect(del).not.toHaveBeenCalled();
  });
});

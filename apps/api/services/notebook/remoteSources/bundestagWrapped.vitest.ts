/**
 * Der Adapter ist die einzige Stelle, die die Feldnamen von Bundestag Wrapped
 * kennt. Getestet wird beides: dass unsere Feldsprache sauber hin- und
 * zurückübersetzt wird, und dass jeder Ausfall als „nicht erreichbar" ankommt —
 * nie als leere Trefferliste.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  BUNDESTAG_NOTEBOOK_API_URL: 'https://bw.test' as string | undefined,
  BUNDESTAG_NOTEBOOK_API_KEY: 'secret' as string | undefined,
  LOG_LEVEL: 'warn',
}));
vi.mock('../../../config/env.js', () => ({ env }));
vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { bundestagWrappedSource, resetBundestagWrappedBreakerForTests } =
  await import('./bundestagWrapped.js');
const { RemoteSourceUnavailableError } = await import('./errors.js');

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const status = (code: number) => ({ ok: false, status: code, json: async () => ({}) });

const SPEECH = {
  id: 'p-1',
  source: 'speeches',
  doc_id: '6123-14',
  chunk_index: 1,
  title: 'Rede von Katharina Dröge (GRÜNE)',
  url: 'https://dserver.bundestag.de/btp/21/21105.pdf',
  date: '2026-11-06',
  wahlperiode: 21,
  dokumentnummer: '21/105',
  speaker: 'Katharina Dröge',
  party: ['GRÜNE'],
  drucksachetyp: null,
  urheber: [],
  section_type: 'rede',
  text: 'x'.repeat(3000),
};

const bodyOf = (call = 0) => JSON.parse(fetchMock.mock.calls[call]![1].body as string);

beforeEach(() => {
  fetchMock.mockReset();
  resetBundestagWrappedBreakerForTests();
  env.BUNDESTAG_NOTEBOOK_API_URL = 'https://bw.test';
  env.BUNDESTAG_NOTEBOOK_API_KEY = 'secret';
});

const search = (match: Record<string, string[]> = {}, published_at?: object) =>
  bundestagWrappedSource.search({
    vector: [0.1, 0.2],
    query: 'Wärmepumpe',
    filters: { match, ...(published_at && { published_at }) },
    limit: 30,
    threshold: 0.35,
  });

describe('bundestagWrappedSource.search', () => {
  it('translates our filter vocabulary into the wire request', async () => {
    fetchMock.mockResolvedValue(ok({ results: [] }));

    await search(
      { content_type: ['rede'], party: ['GRÜNE'], wahlperiode: ['21'], section_type: ['rede'] },
      { gte: '2026-01-01T00:00:00Z', lte: '2026-06-30' }
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://bw.test/api/v1/search');
    expect(init.headers.authorization).toBe('Bearer secret');
    expect(bodyOf()).toEqual({
      vector: [0.1, 0.2],
      query: 'Wärmepumpe',
      limit: 30,
      scoreThreshold: 0.35,
      sources: ['speeches'],
      filters: {
        party: ['GRÜNE'],
        wahlperiode: [21],
        section_type: ['rede'],
        from: '2026-01-01',
        to: '2026-06-30',
      },
    });
  });

  it('maps a hit into our payload, with the speech as its own document', async () => {
    fetchMock.mockResolvedValue(ok({ results: [{ ...SPEECH, score: 0.81, excerpt: 'Fenster' }] }));

    const [hit] = await search();

    expect(hit).toEqual({
      id: 'p-1',
      score: 0.81,
      payload: expect.objectContaining({
        document_id: 'rede:6123-14',
        content_type: 'rede',
        source_url: 'https://dserver.bundestag.de/btp/21/21105.pdf#rede-6123-14',
        published_at: '2026-11-06',
        wahlperiode: '21',
        party: ['GRÜNE'],
        section_type: 'rede',
        chunk_index: 1,
        // The best window, not the opening of a 4000-character chunk.
        chunk_text: 'Fenster',
      }),
    });
  });

  it('falls back to the full chunk text without an excerpt', async () => {
    fetchMock.mockResolvedValue(ok({ results: [{ ...SPEECH, score: 0.5, excerpt: null }] }));
    const [hit] = await search();
    expect(hit!.payload.chunk_text).toBe(SPEECH.text);
  });

  it('asks nothing when the filters exclude each other', async () => {
    expect(await search({ content_type: [] })).toEqual([]);
    expect(await search({ content_type: ['pressemitteilung'] })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a filter field it cannot express', async () => {
    await expect(search({ themes: ['klima'] })).rejects.toThrow(/themes/);
  });
});

describe('outages arrive as unavailable, never as an empty list', () => {
  it('without configuration', async () => {
    env.BUNDESTAG_NOTEBOOK_API_KEY = undefined;
    await expect(search()).rejects.toBeInstanceOf(RemoteSourceUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('on a network error and on 5xx, and opens the breaker after two', async () => {
    fetchMock.mockRejectedValueOnce(new Error('fetch failed')).mockResolvedValueOnce(status(503));

    await expect(search()).rejects.toThrow('Bundestag-Quelle gerade nicht erreichbar');
    await expect(search()).rejects.toBeInstanceOf(RemoteSourceUnavailableError);
    // Breaker open: no third request.
    await expect(search()).rejects.toBeInstanceOf(RemoteSourceUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('on a response that breaks the contract', async () => {
    fetchMock.mockResolvedValue(ok({ results: [{ id: 'p-1', score: 'high' }] }));
    await expect(search()).rejects.toBeInstanceOf(RemoteSourceUnavailableError);
  });

  it('a rejected request (401) does not count towards the breaker', async () => {
    fetchMock.mockResolvedValue(status(401));
    for (let i = 0; i < 3; i++) {
      await expect(search()).rejects.toBeInstanceOf(RemoteSourceUnavailableError);
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('bundestagWrappedSource.facetCounts', () => {
  it('facets content_type as the wire field `source` and maps values back', async () => {
    fetchMock.mockResolvedValue(
      ok({
        values: [
          { value: 'speeches', count: 120 },
          { value: 'documents', count: 40 },
        ],
      })
    );

    const values = await bundestagWrappedSource.facetCounts('content_type', { match: {} }, 50);

    expect(bodyOf()).toEqual({ field: 'source', limit: 50, filters: {} });
    expect(values).toEqual([
      { value: 'rede', count: 120 },
      { value: 'drucksache', count: 40 },
    ]);
  });

  it('stringifies numeric facet values', async () => {
    fetchMock.mockResolvedValue(ok({ values: [{ value: 21, count: 160 }] }));
    expect(await bundestagWrappedSource.facetCounts('wahlperiode', { match: {} }, 50)).toEqual([
      { value: '21', count: 160 },
    ]);
  });
});

describe('bundestagWrappedSource.chunks', () => {
  it('decodes our document id and returns chunks in order', async () => {
    fetchMock.mockResolvedValue(
      ok({
        chunks: [
          { ...SPEECH, id: 'p-2', chunk_index: 2, text: 'zwei' },
          { ...SPEECH, id: 'p-1', chunk_index: 1, text: 'eins' },
        ],
      })
    );

    const chunks = await bundestagWrappedSource.chunks('rede:6123-14', [1, 2]);

    expect(bodyOf()).toEqual({ source: 'speeches', doc_id: '6123-14', chunk_indexes: [1, 2] });
    expect(chunks.map((c) => c.payload.chunk_text)).toEqual(['eins', 'zwei']);
  });

  it('asks nothing for an id that is not ours', async () => {
    expect(await bundestagWrappedSource.chunks('https://example.org/x', [0])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

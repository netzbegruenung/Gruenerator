import { beforeEach, describe, expect, it, vi } from 'vitest';

const searchWithQuality = vi.fn();

vi.mock('../../database/services/QdrantService/index.js', () => ({
  getQdrantInstance: () => ({
    ensureConnected: () => Promise.resolve(),
    operations: { searchWithQuality },
  }),
}));
vi.mock('../mistral/index.js', () => ({
  mistralEmbeddingService: {
    init: () => Promise.resolve(),
    generateQueryEmbedding: () => Promise.resolve([0.1, 0.2]),
  },
}));
vi.mock('../contentExamplesService.js', () => ({ contentExamplesService: {} }));
vi.mock('../document-services/index.js', () => ({
  DocumentSearchService: class {},
}));

const { searchExamples } = await import('./exampleSearchService.js');

describe("searchExamples — kind 'wahlpruefstein'", () => {
  beforeEach(() => searchWithQuality.mockReset());

  it('formt einen Treffer zu Verband (Wahl) plus Frage und Antwort', async () => {
    searchWithQuality.mockResolvedValue([
      {
        id: 'p1',
        score: 0.82,
        payload: {
          verband: 'Deutscher Mieterbund (DMB)',
          wahl: 'btw25',
          frage: 'Wird sich Ihre Partei für eine Verlängerung der Mietpreisbremse einsetzen?',
          position: 'Ja',
          antwort: 'Wir werden die Mietpreisbremse verlängern und verschärfen.',
        },
      },
    ]);

    const result = await searchExamples({ query: 'Mietpreisbremse', kinds: ['wahlpruefstein'] });

    expect(result.byKind.wahlpruefstein).toEqual([
      {
        kind: 'wahlpruefstein',
        id: 'p1',
        title: 'Deutscher Mieterbund (DMB) (Bundestagswahl 2025)',
        body: 'Frage: Wird sich Ihre Partei für eine Verlängerung der Mietpreisbremse einsetzen?\n\nAntwort: Ja. Wir werden die Mietpreisbremse verlängern und verschärfen.',
        wahl: 'btw25',
        relevance: 0.82,
      },
    ]);
  });

  it('grenzt nur mit gesetzter Ebene auf `ebene` ein', async () => {
    searchWithQuality.mockResolvedValue([]);

    await searchExamples({ query: 'GAP', kinds: ['wahlpruefstein'], ebene: 'europa' });
    await searchExamples({ query: 'GAP', kinds: ['wahlpruefstein'] });

    expect(searchWithQuality.mock.calls[0]?.[2]).toEqual({
      must: [{ key: 'ebene', match: { value: 'europa' } }],
    });
    expect(searchWithQuality.mock.calls[1]?.[2]).toEqual({});
  });
});

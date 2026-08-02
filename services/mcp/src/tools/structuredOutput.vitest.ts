/**
 * The declared outputSchema and what the handlers actually return must agree —
 * once a tool declares an outputSchema, the SDK validates every SUCCESSFUL
 * return against it and turns a mismatch into `-32602 Output validation error`.
 * A missed branch here is a working tool that starts failing in production, so
 * each branch of each tool gets parsed with the very schema the SDK will use.
 */
import { buildSourceRef, canonicalizeSourceUrl } from '@gruenerator/query/refs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const hybridSearchCollection = vi.fn();
const getFieldValueCounts = vi.fn();
const qdrantSearch = vi.fn();

vi.mock('../qdrant/client.ts', () => ({
  hybridSearchCollection: (...a: unknown[]) => hybridSearchCollection(...a),
  searchCollection: vi.fn(),
  textSearchCollection: vi.fn(),
  getFieldValueCounts: (...a: unknown[]) => getFieldValueCounts(...a),
  getQdrantClient: async () => ({ search: (...a: unknown[]) => qdrantSearch(...a) }),
}));

vi.mock('../embeddings.ts', () => ({
  generateEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
}));

const { searchTool } = await import('./search.ts');
const { examplesSearchTool } = await import('./examples-search.ts');
const { filtersTool } = await import('./filters.ts');

/** Exactly what the SDK does before it lets a result out (validateToolOutput →
 *  normalizeObjectSchema + safeParse). */
function expectValid(shape: z.ZodRawShape, result: unknown) {
  const parsed = z.object(shape).safeParse(result);
  if (!parsed.success) {
    throw new Error(
      `structuredContent verletzt das outputSchema: ${JSON.stringify(parsed.error.issues)}`
    );
  }
}

function hit(title: string, score: number, url: string | null) {
  return { score, title, url, text: `Auszug zu ${title}.`, searchMethod: 'hybrid', payload: {} };
}

beforeEach(() => {
  hybridSearchCollection.mockReset();
  getFieldValueCounts.mockReset();
  qdrantSearch.mockReset();
});

describe('gruenerator_search', () => {
  it('erfüllt das Schema bei Treffern in einer Sammlung', async () => {
    hybridSearchCollection.mockResolvedValue({
      results: [hit('Dossier', 0.9, 'https://kommunalwiki.boell.de/index.php/Dossier')],
      metadata: { searchType: 'hybrid' },
    });
    const result = await searchTool.handler({
      query: 'Verkehr',
      country: 'DE',
      collection: 'kommunalwiki',
      useCache: false,
    });
    expectValid(searchTool.outputSchema, result);
  });

  it('erfüllt das Schema ohne Treffer', async () => {
    hybridSearchCollection.mockResolvedValue({ results: [], metadata: { searchType: 'hybrid' } });
    const result = await searchTool.handler({
      query: 'Verkehr',
      country: 'DE',
      collection: 'kommunalwiki',
      useCache: false,
    });
    expect((result as { resultsCount: number }).resultsCount).toBe(0);
    expectValid(searchTool.outputSchema, result);
  });

  it('erfüllt das Schema bei der Suche über alle Sammlungen', async () => {
    hybridSearchCollection.mockResolvedValue({
      results: [hit('Programm', 0.8, 'https://gruene.de/programm')],
      metadata: { searchType: 'hybrid' },
    });
    const result = await searchTool.handler({ query: 'Verkehr', country: 'DE', useCache: false });
    expect((result as { collectionsSearched: string }).collectionsSearched).toBeTruthy();
    expectValid(searchTool.outputSchema, result);
  });

  it('gibt jedem Treffer ein ref und hält es über Aufrufe stabil', async () => {
    const url = 'https://kommunalwiki.boell.de/index.php/Dossier';
    hybridSearchCollection.mockResolvedValue({
      results: [hit('Dossier', 0.9, url)],
      metadata: { searchType: 'hybrid' },
    });
    const first = (await searchTool.handler({
      query: 'Verkehr',
      country: 'DE',
      collection: 'kommunalwiki',
      useCache: false,
    })) as { results: Array<{ ref?: string; rank: number }> };

    // Andere Anfrage, anderer Rang, dieselbe Quelle.
    hybridSearchCollection.mockResolvedValue({
      results: [
        hit('Anderes', 0.95, 'https://kommunalwiki.boell.de/index.php/Anderes'),
        hit('Dossier', 0.7, url),
      ],
      metadata: { searchType: 'hybrid' },
    });
    const second = (await searchTool.handler({
      query: 'Radverkehr',
      country: 'DE',
      collection: 'kommunalwiki',
      useCache: false,
    })) as { results: Array<{ ref?: string; rank: number }> };

    // Dieselbe Quelle, anderer Rang, gleiches ref — genau der Fall, in dem eine
    // Zitierung über rank auf die falsche Quelle zeigen würde.
    const before = first.results[0];
    const after = second.results[1];
    expect(before?.ref).toBeTruthy();
    expect(after?.ref).toBe(before?.ref);
    expect(before?.rank).toBe(1);
    expect(after?.rank).toBe(2);
  });

  it('lässt ref weg, wenn ein Treffer nichts trägt, woran er zu erkennen wäre', async () => {
    hybridSearchCollection.mockResolvedValue({
      results: [hit('Ohne Quelle', 0.9, null)],
      metadata: { searchType: 'hybrid' },
    });
    const result = (await searchTool.handler({
      query: 'Verkehr',
      country: 'DE',
      collection: 'kommunalwiki',
      useCache: false,
    })) as { results: Array<{ ref?: string }> };
    expect(result.results[0]).not.toHaveProperty('ref');
    expectValid(searchTool.outputSchema, result);
  });
});

describe('gruenerator_examples_search', () => {
  it('erfüllt das Schema bei Treffern', async () => {
    qdrantSearch.mockResolvedValue([
      {
        id: 42,
        score: 0.8,
        payload: { content: 'Ein Post', platform: 'instagram', url: 'https://example.org/p/1' },
      },
    ]);
    const result = await examplesSearchTool.handler({ query: 'Klima' });
    expectValid(examplesSearchTool.outputSchema, result);
    expect((result as { examples: Array<{ ref: string | null }> }).examples[0]?.ref).toBeTruthy();
  });

  it('erfüllt das Schema ohne Treffer', async () => {
    qdrantSearch.mockResolvedValue([]);
    const result = await examplesSearchTool.handler({ query: 'Klima' });
    expectValid(examplesSearchTool.outputSchema, result);
  });
});

describe('gruenerator_get_filters', () => {
  it('erfüllt das Schema, wenn eine Sammlung keine Filter hat', async () => {
    const result = await filtersTool.handler({ collection: 'deutschland' });
    expectValid(filtersTool.outputSchema, result);
  });
});

describe('buildSourceRef', () => {
  it('ist gegen die Varianten derselben Adresse unempfindlich', () => {
    const base = buildSourceRef({ url: 'https://gruene.de/programm' });
    expect(buildSourceRef({ url: 'https://GRUENE.de/programm/' })).toBe(base);
    expect(buildSourceRef({ url: 'https://gruene.de/programm#kapitel-3' })).toBe(base);
    expect(buildSourceRef({ url: '  https://gruene.de/programm  ' })).toBe(base);
  });

  it('trennt, was getrennt gehört', () => {
    expect(buildSourceRef({ url: 'https://gruene.de/a' })).not.toBe(
      buildSourceRef({ url: 'https://gruene.de/b' })
    );
    // Query-String gehört zur Identität — Wiki-Seiten unterscheiden sich nur darin.
    expect(buildSourceRef({ url: 'https://wiki.de/index.php?title=A' })).not.toBe(
      buildSourceRef({ url: 'https://wiki.de/index.php?title=B' })
    );
  });

  it('weicht auf documentId und Point-ID aus, aber erfindet nichts', () => {
    expect(buildSourceRef({ url: null, documentId: 'lv_abc' })).toBeTruthy();
    expect(buildSourceRef({ url: null, pointId: 7 })).toBeTruthy();
    expect(buildSourceRef({})).toBeNull();
    expect(buildSourceRef({ url: '   ' })).toBeNull();
  });

  it('reicht Unparsbares unverändert durch, statt es zu verwerfen', () => {
    expect(canonicalizeSourceUrl('nicht mal eine url')).toBe('nicht mal eine url');
    expect(buildSourceRef({ url: 'nicht mal eine url' })).toBe(
      buildSourceRef({ url: ' nicht mal eine url ' })
    );
  });
});

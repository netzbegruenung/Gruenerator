/**
 * Search Documents Tool Tests
 *
 * Verifies:
 * 1. Zod schema validation for the search_documents tool
 * 2. 5-level collection priority chain (mirrors searchNode's chain in the DeepAgent context)
 * 3. LLM `collections` parameter override behavior
 * 4. Document-scoped search via getQdrantDocumentService
 * 5. Integrated reranking with Mistral + MMR diversity
 * 6. Edge cases: no results, service failures, URL deduplication
 *
 * 7. Real LLM integration: Mistral rerank response parsing (skipped without API key)
 *
 * Run with: pnpm --filter @gruenerator/api test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock external dependencies BEFORE any imports that use them ──────────

vi.mock('../../../../routes/chat/agents/directSearch.js', () => ({
  executeDirectSearch: vi.fn(),
}));

const mockDocumentSearch = vi.fn();
vi.mock('../../../../services/document-services/DocumentSearchService/index.js', () => ({
  getQdrantDocumentService: vi.fn(() => ({
    search: mockDocumentSearch,
  })),
}));

vi.mock('../../../../services/search/DiversityReranker.js', () => ({
  applyMMR: vi.fn((results: any[]) => results),
}));

vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../nodes/searchNode.js', () => ({
  getDefaultCollectionsForLocale: vi.fn((locale: string | undefined) => {
    if (locale === 'de-AT') return ['oesterreich', 'gruene-at'];
    return ['deutschland', 'bundestagsfraktion', 'gruene-de', 'kommunalwiki'];
  }),
  getSupplementaryCollectionsForLocale: vi.fn((locale: string | undefined) => {
    if (locale === 'de-AT') return ['gruene-at'];
    return ['bundestagsfraktion', 'gruene-de', 'kommunalwiki'];
  }),
}));

// ─── Import modules under test (after mocks) ─────────────────────────────

import { createSearchDocumentsTool } from './searchDocuments.js';
import { executeDirectSearch } from '../../../../routes/chat/agents/directSearch.js';
import { getQdrantDocumentService } from '../../../../services/document-services/DocumentSearchService/index.js';
import { applyMMR } from '../../../../services/search/DiversityReranker.js';
import {
  getDefaultCollectionsForLocale,
  getSupplementaryCollectionsForLocale,
} from '../nodes/searchNode.js';

import type { ToolDependencies } from './registry.js';

// ─── Test helpers ─────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<ToolDependencies> = {}): ToolDependencies {
  return {
    agentConfig: { id: 'test', systemRole: 'test', name: 'Test' } as any,
    aiWorkerPool: {
      processRequest: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          scores: [
            { index: 0, score: 5 },
            { index: 1, score: 4 },
            { index: 2, score: 3 },
            { index: 3, score: 2 },
          ],
        }),
      }),
    },
    enabledTools: {},
    ...overrides,
  };
}

function makeDirectSearchResult(
  collection: string,
  results: Array<{ source: string; excerpt: string; url?: string; relevance?: string }>
) {
  return { collection, results };
}

function getSearchedCollections(): string[] {
  return [
    ...new Set(vi.mocked(executeDirectSearch).mock.calls.map((call: any[]) => call[0].collection)),
  ];
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('search_documents tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: executeDirectSearch returns 2 results per collection
    vi.mocked(executeDirectSearch).mockImplementation(
      async ({ collection }: { collection: string }) =>
        makeDirectSearchResult(collection, [
          {
            source: 'Grüne Klimapolitik',
            excerpt: 'Die Grünen setzen auf Klimaneutralität bis 2035.',
            url: `https://example.com/${collection}/1`,
            relevance: 'Sehr hoch',
          },
          {
            source: 'Energiewende',
            excerpt: 'Der Ausbau erneuerbarer Energien ist zentral.',
            url: `https://example.com/${collection}/2`,
            relevance: 'Hoch',
          },
        ])
    );
  });

  // ========================================================================
  // 1. Schema validation
  // ========================================================================

  describe('schema', () => {
    const tool = createSearchDocumentsTool(makeDeps());

    it('has name "search_documents"', () => {
      expect(tool.name).toBe('search_documents');
    });

    it('accepts query as required string', () => {
      const parsed = tool.schema.safeParse({ query: 'Klimapolitik' });
      expect(parsed.success).toBe(true);
    });

    it('rejects missing query', () => {
      const parsed = tool.schema.safeParse({});
      expect(parsed.success).toBe(false);
    });

    it('accepts collections as optional string array', () => {
      const parsed = tool.schema.safeParse({
        query: 'test',
        collections: ['deutschland', 'bundestagsfraktion'],
      });
      expect(parsed.success).toBe(true);
    });

    it('accepts document_ids as optional string array', () => {
      const parsed = tool.schema.safeParse({
        query: 'test',
        document_ids: ['doc-123', 'doc-456'],
      });
      expect(parsed.success).toBe(true);
    });

    it('accepts topK as optional number', () => {
      const parsed = tool.schema.safeParse({ query: 'test', topK: 5 });
      expect(parsed.success).toBe(true);
    });

    it('accepts all parameters together', () => {
      const parsed = tool.schema.safeParse({
        query: 'Energiewende',
        collections: ['deutschland'],
        document_ids: ['doc-1'],
        topK: 3,
      });
      expect(parsed.success).toBe(true);
    });
  });

  // ========================================================================
  // 2. Collection priority chain
  // ========================================================================

  describe('collection priority chain', () => {
    it('priority 5 (lowest): locale fallback when no deps set', async () => {
      const tool = createSearchDocumentsTool(makeDeps());
      await tool.invoke({ query: 'Klimapolitik' });

      const collections = getSearchedCollections();
      expect(collections).toEqual(
        expect.arrayContaining(['deutschland', 'bundestagsfraktion', 'gruene-de', 'kommunalwiki'])
      );
      expect(collections).toHaveLength(4);
      expect(getDefaultCollectionsForLocale).toHaveBeenCalled();
    });

    it('priority 4: defaultNotebookCollectionIds overrides locale', async () => {
      const tool = createSearchDocumentsTool(
        makeDeps({ defaultNotebookCollectionIds: ['hamburg'] })
      );
      await tool.invoke({ query: 'Klimapolitik' });

      const collections = getSearchedCollections();
      expect(collections).toEqual(['hamburg']);
      expect(getDefaultCollectionsForLocale).not.toHaveBeenCalled();
    });

    it('priority 3: agent defaultCollection overrides defaultNotebookCollectionIds', async () => {
      const tool = createSearchDocumentsTool(
        makeDeps({
          agentConfig: {
            id: 'test',
            systemRole: 'test',
            name: 'Test',
            toolRestrictions: { defaultCollection: 'oesterreich' },
          } as any,
          defaultNotebookCollectionIds: ['hamburg'],
        })
      );
      await tool.invoke({ query: 'Klimapolitik' });

      const collections = getSearchedCollections();
      expect(collections).toContain('oesterreich');
      expect(collections).not.toContain('hamburg');
      // defaultCollection adds supplementary collections
      expect(collections).toEqual(
        expect.arrayContaining(['oesterreich', 'bundestagsfraktion', 'gruene-de', 'kommunalwiki'])
      );
    });

    it('priority 3: agent defaultCollection uses Austrian supplements for de-AT locale', async () => {
      const tool = createSearchDocumentsTool(
        makeDeps({
          userLocale: 'de-AT',
          agentConfig: {
            id: 'test',
            systemRole: 'test',
            name: 'Test',
            toolRestrictions: { defaultCollection: 'oesterreich' },
          } as any,
        })
      );
      await tool.invoke({ query: 'Klimapolitik' });

      const collections = getSearchedCollections();
      expect(collections).toEqual(expect.arrayContaining(['oesterreich', 'gruene-at']));
      expect(collections).not.toContain('bundestagsfraktion');
      expect(collections).not.toContain('gruene-de');
      expect(collections).not.toContain('kommunalwiki');
      expect(getSupplementaryCollectionsForLocale).toHaveBeenCalledWith('de-AT');
    });

    it('priority 2: agent allowedCollections overrides defaultNotebookCollectionIds', async () => {
      const tool = createSearchDocumentsTool(
        makeDeps({
          agentConfig: {
            id: 'test',
            systemRole: 'test',
            name: 'Test',
            toolRestrictions: { allowedCollections: ['bayern', 'thueringen'] },
          } as any,
          defaultNotebookCollectionIds: ['hamburg'],
        })
      );
      await tool.invoke({ query: 'Klimapolitik' });

      const collections = getSearchedCollections();
      expect(collections).toEqual(expect.arrayContaining(['bayern', 'thueringen']));
      expect(collections).not.toContain('hamburg');
    });

    it('LLM collections param overrides all deps-level defaults', async () => {
      const tool = createSearchDocumentsTool(
        makeDeps({
          agentConfig: {
            id: 'test',
            systemRole: 'test',
            name: 'Test',
            toolRestrictions: { allowedCollections: ['bayern'] },
          } as any,
          defaultNotebookCollectionIds: ['hamburg'],
        })
      );
      await tool.invoke({ query: 'Klimapolitik', collections: ['kommunalwiki'] });

      const collections = getSearchedCollections();
      expect(collections).toEqual(['kommunalwiki']);
    });

    it('locale de-AT produces Austrian collections', async () => {
      const tool = createSearchDocumentsTool(makeDeps({ userLocale: 'de-AT' }));
      await tool.invoke({ query: 'Klimapolitik' });

      expect(getDefaultCollectionsForLocale).toHaveBeenCalledWith('de-AT');
      const collections = getSearchedCollections();
      expect(collections).toEqual(expect.arrayContaining(['oesterreich', 'gruene-at']));
      expect(collections).toHaveLength(2);
    });

    it('multiple default notebook collections searched in parallel', async () => {
      const tool = createSearchDocumentsTool(
        makeDeps({ defaultNotebookCollectionIds: ['hamburg', 'bayern'] })
      );
      await tool.invoke({ query: 'Klimapolitik' });

      const collections = getSearchedCollections();
      expect(collections).toEqual(expect.arrayContaining(['hamburg', 'bayern']));
      expect(collections).toHaveLength(2);
      // Each collection searched once
      expect(executeDirectSearch).toHaveBeenCalledTimes(2);
    });
  });

  // ========================================================================
  // 3. Document-scoped search
  // ========================================================================

  describe('document-scoped search', () => {
    it('uses getQdrantDocumentService when document_ids provided', async () => {
      mockDocumentSearch.mockResolvedValue({
        results: [
          {
            document_id: 'doc-1',
            title: 'Test Document',
            chunk_text: 'Document content here.',
            source_url: 'https://docs.example.com/1',
            score: 0.85,
          },
        ],
      });

      const tool = createSearchDocumentsTool(
        makeDeps({
          agentConfig: { id: 'test', systemRole: 'test', name: 'Test', userId: 'user-1' } as any,
        })
      );
      await tool.invoke({ query: 'test query', document_ids: ['doc-1'] });

      expect(getQdrantDocumentService).toHaveBeenCalled();
      expect(mockDocumentSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'test query',
          filters: { documentIds: ['doc-1'] },
        })
      );
      // Should NOT call executeDirectSearch
      expect(executeDirectSearch).not.toHaveBeenCalled();
    });

    it('bypasses collection priority chain entirely', async () => {
      mockDocumentSearch.mockResolvedValue({ results: [] });

      const tool = createSearchDocumentsTool(
        makeDeps({
          defaultNotebookCollectionIds: ['hamburg'],
          agentConfig: {
            id: 'test',
            systemRole: 'test',
            name: 'Test',
            toolRestrictions: { allowedCollections: ['bayern'] },
          } as any,
        })
      );
      await tool.invoke({ query: 'test', document_ids: ['doc-1'] });

      expect(executeDirectSearch).not.toHaveBeenCalled();
      expect(getDefaultCollectionsForLocale).not.toHaveBeenCalled();
    });

    it('returns error message on service failure (not throw)', async () => {
      mockDocumentSearch.mockRejectedValue(new Error('Qdrant unavailable'));

      const tool = createSearchDocumentsTool(makeDeps());
      const result = await tool.invoke({ query: 'test', document_ids: ['doc-1'] });

      expect(result).toBe('Fehler bei der Dokumentensuche. Bitte versuche es erneut.');
    });
  });

  // ========================================================================
  // 4. Reranking integration
  // ========================================================================

  describe('reranking integration', () => {
    it('results with ≤3 items skip reranking (returned as-is)', async () => {
      // Return only 2 results (below the ≤3 threshold)
      vi.mocked(executeDirectSearch).mockImplementation(
        async ({ collection }: { collection: string }) =>
          makeDirectSearchResult(collection, [
            {
              source: 'Single Result',
              excerpt: 'Only result.',
              url: `https://example.com/${collection}/1`,
              relevance: 'Hoch',
            },
          ])
      );

      const deps = makeDeps();
      const tool = createSearchDocumentsTool(deps);
      await tool.invoke({ query: 'test', collections: ['deutschland'] });

      // aiWorkerPool.processRequest should NOT be called (rerank skipped)
      expect(deps.aiWorkerPool.processRequest).not.toHaveBeenCalled();
      expect(applyMMR).not.toHaveBeenCalled();
    });

    it('rerank failure degrades gracefully (returns original order)', async () => {
      // Return 5 results to trigger reranking
      vi.mocked(executeDirectSearch).mockImplementation(
        async ({ collection }: { collection: string }) =>
          makeDirectSearchResult(collection, [
            {
              source: 'R1',
              excerpt: 'A',
              url: `https://example.com/${collection}/1`,
              relevance: 'Sehr hoch',
            },
            {
              source: 'R2',
              excerpt: 'B',
              url: `https://example.com/${collection}/2`,
              relevance: 'Hoch',
            },
            {
              source: 'R3',
              excerpt: 'C',
              url: `https://example.com/${collection}/3`,
              relevance: 'Hoch',
            },
          ])
      );

      const deps = makeDeps({
        aiWorkerPool: {
          processRequest: vi.fn().mockRejectedValue(new Error('Mistral timeout')),
        },
      });
      const tool = createSearchDocumentsTool(deps);
      const result = await tool.invoke({
        query: 'test',
        collections: ['deutschland', 'bundestagsfraktion'],
      });

      // Should still return results despite rerank failure
      expect(result).toContain('Dokumente gefunden');
    });

    it('MMR diversity applied when >3 results after filtering', async () => {
      // Return enough results to trigger reranking AND MMR
      vi.mocked(executeDirectSearch).mockImplementation(
        async ({ collection }: { collection: string }) =>
          makeDirectSearchResult(collection, [
            {
              source: 'R1',
              excerpt: 'A',
              url: `https://example.com/${collection}/1`,
              relevance: 'Sehr hoch',
            },
            {
              source: 'R2',
              excerpt: 'B',
              url: `https://example.com/${collection}/2`,
              relevance: 'Hoch',
            },
            {
              source: 'R3',
              excerpt: 'C',
              url: `https://example.com/${collection}/3`,
              relevance: 'Hoch',
            },
          ])
      );

      const tool = createSearchDocumentsTool(makeDeps());
      await tool.invoke({ query: 'test', collections: ['deutschland', 'bundestagsfraktion'] });

      // applyMMR should be called (>3 results after rerank + filter)
      expect(applyMMR).toHaveBeenCalledWith(expect.any(Array), 0.7, 2);
    });
  });

  // ========================================================================
  // 5. Edge cases
  // ========================================================================

  describe('edge cases', () => {
    it('no results returns German "not found" message', async () => {
      vi.mocked(executeDirectSearch).mockImplementation(
        async ({ collection }: { collection: string }) => makeDirectSearchResult(collection, [])
      );

      const deps = makeDeps();
      // Ensure rerank returns empty too
      deps.aiWorkerPool.processRequest = vi.fn();
      const tool = createSearchDocumentsTool(deps);
      const result = await tool.invoke({
        query: 'nonexistent topic',
        collections: ['deutschland'],
      });

      expect(result).toBe('Keine relevanten Dokumente gefunden.');
    });

    it('service failure returns empty results gracefully', async () => {
      vi.mocked(executeDirectSearch).mockRejectedValue(new Error('Connection refused'));

      const deps = makeDeps();
      deps.aiWorkerPool.processRequest = vi.fn();
      const tool = createSearchDocumentsTool(deps);
      const result = await tool.invoke({ query: 'test', collections: ['deutschland'] });

      // All collections failed → no results → "not found" message
      expect(result).toBe('Keine relevanten Dokumente gefunden.');
    });

    it('URL deduplication across collections', async () => {
      // Both collections return the same URL
      vi.mocked(executeDirectSearch).mockImplementation(
        async ({ collection }: { collection: string }) =>
          makeDirectSearchResult(collection, [
            {
              source: 'Shared Article',
              excerpt: 'Shared content across collections.',
              url: 'https://example.com/shared',
              relevance: 'Sehr hoch',
            },
          ])
      );

      const deps = makeDeps();
      // Skip reranking by ensuring ≤3 unique results
      deps.aiWorkerPool.processRequest = vi.fn();
      const tool = createSearchDocumentsTool(deps);
      const result = await tool.invoke({
        query: 'test',
        collections: ['deutschland', 'bundestagsfraktion'],
      });

      // Should only contain the URL once (deduplicated)
      const urlMatches = result.match(/https:\/\/example\.com\/shared/g) || [];
      expect(urlMatches.length).toBe(1);
    });

    it('topK parameter propagates to executeDirectSearch limit', async () => {
      const tool = createSearchDocumentsTool(makeDeps());
      await tool.invoke({ query: 'test', topK: 7, collections: ['deutschland'] });

      expect(executeDirectSearch).toHaveBeenCalledWith(expect.objectContaining({ limit: 7 }));
    });

    it('defaults topK to 3 when omitted', async () => {
      const tool = createSearchDocumentsTool(makeDeps());
      await tool.invoke({ query: 'test', collections: ['deutschland'] });

      expect(executeDirectSearch).toHaveBeenCalledWith(expect.objectContaining({ limit: 3 }));
    });

    it('deduplicates identical collections in input', async () => {
      const tool = createSearchDocumentsTool(makeDeps());
      await tool.invoke({
        query: 'test',
        collections: ['deutschland', 'deutschland', 'deutschland'],
      });

      // Should only search once despite 3 identical entries
      expect(executeDirectSearch).toHaveBeenCalledTimes(1);
    });

    it('formats output with numbered citations and URLs', async () => {
      vi.mocked(executeDirectSearch).mockImplementation(
        async ({ collection }: { collection: string }) =>
          makeDirectSearchResult(collection, [
            {
              source: 'Klimapolitik',
              excerpt: 'Die Grünen setzen auf Klimaneutralität.',
              url: 'https://gruene.de/klima',
              relevance: 'Sehr hoch',
            },
          ])
      );

      const deps = makeDeps();
      deps.aiWorkerPool.processRequest = vi.fn();
      const tool = createSearchDocumentsTool(deps);
      const result = await tool.invoke({ query: 'test', collections: ['deutschland'] });

      expect(result).toContain('[1]');
      expect(result).toContain('https://gruene.de/klima');
      expect(result).toContain('Dokumente gefunden');
    });
  });
});

// ==========================================================================
// Real LLM integration test — calls Mistral API directly
// Skipped when MISTRAL_API_KEY is not set (CI-safe)
// ==========================================================================

const MISTRAL_KEY = process.env.MISTRAL_API_KEY;

describe.skipIf(!MISTRAL_KEY)('search_documents – real LLM rerank integration', () => {
  const RERANK_PROMPT = `Du bewertest die Relevanz von Suchergebnissen für eine Benutzeranfrage.

Für jedes Ergebnis vergib einen Relevanz-Score von 1-5:
5 = Direkt relevant, beantwortet die Frage
4 = Sehr relevant, enthält wichtige Informationen
3 = Teilweise relevant, enthält Hintergrundinformationen
2 = Wenig relevant, nur am Rande verwandt
1 = Nicht relevant

Antworte NUR mit JSON:
{ "scores": [{"index": 0, "score": 5}, {"index": 1, "score": 3}, ...] }`;

  const testPassages = [
    {
      index: 0,
      title: 'Klimaneutralität 2035',
      content: 'Die Grünen fordern Klimaneutralität bis 2035 mit konkretem Stufenplan.',
    },
    {
      index: 1,
      title: 'Parteifinanzen 2024',
      content: 'Bericht über die Einnahmen und Ausgaben der Partei im Geschäftsjahr 2024.',
    },
    {
      index: 2,
      title: 'Erneuerbare Energien Ausbau',
      content: 'Windkraft und Solarenergie sollen massiv ausgebaut werden.',
    },
    {
      index: 3,
      title: 'Vereinssatzung §12',
      content: 'Regelungen zur Mitgliederversammlung und Abstimmungsverfahren.',
    },
  ];

  const passageList = testPassages.map((p) => `[${p.index}] ${p.title}\n${p.content}`).join('\n\n');

  async function callMistralRerank(query: string): Promise<any> {
    const { Mistral } = await import('@mistralai/mistralai');
    const client = new Mistral({ apiKey: MISTRAL_KEY! });

    const response = await client.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: RERANK_PROMPT },
        { role: 'user', content: `Suchanfrage: "${query}"\n\nErgebnisse:\n${passageList}` },
      ],
      maxTokens: 200,
      temperature: 0.0,
      responseFormat: { type: 'json_object' },
    });

    const raw = (response.choices?.[0]?.message?.content || '{}') as string;
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    return JSON.parse(cleaned);
  }

  it('Mistral returns valid rerank JSON with scores array', async () => {
    const parsed = await callMistralRerank('Klimapolitik der Grünen');

    expect(parsed).toHaveProperty('scores');
    expect(Array.isArray(parsed.scores)).toBe(true);
    expect(parsed.scores.length).toBe(testPassages.length);

    for (const entry of parsed.scores) {
      expect(entry).toHaveProperty('index');
      expect(entry).toHaveProperty('score');
      expect(typeof entry.index).toBe('number');
      expect(typeof entry.score).toBe('number');
      expect(entry.score).toBeGreaterThanOrEqual(1);
      expect(entry.score).toBeLessThanOrEqual(5);
    }
  }, 15_000);

  it('Mistral ranks climate results higher than unrelated ones for a climate query', async () => {
    const parsed = await callMistralRerank('Was ist die Klimapolitik der Grünen?');

    const scoreMap = new Map<number, number>();
    for (const entry of parsed.scores) {
      scoreMap.set(entry.index, entry.score);
    }

    // "Klimaneutralität 2035" (index 0) and "Erneuerbare Energien" (index 2)
    // should score higher than "Parteifinanzen" (index 1) and "Vereinssatzung" (index 3)
    const climateScore = Math.max(scoreMap.get(0) ?? 0, scoreMap.get(2) ?? 0);
    const unrelatedScore = Math.min(scoreMap.get(1) ?? 5, scoreMap.get(3) ?? 5);

    expect(climateScore).toBeGreaterThan(unrelatedScore);
  }, 15_000);
});

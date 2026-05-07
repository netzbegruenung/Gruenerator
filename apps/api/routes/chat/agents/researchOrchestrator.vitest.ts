import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Module mocks (hoisted before imports) ────────────────────

const mockGenerateObject = vi.fn();
const mockGenerateText = vi.fn();

vi.mock('ai', () => ({
  generateObject: mockGenerateObject,
  generateText: mockGenerateText,
}));

const mockGetIntermediateModel = vi.fn(() => ({ id: 'mock-model' }));

vi.mock('./providers.js', () => ({
  getIntermediateModel: mockGetIntermediateModel,
}));

const mockExecuteDirectSearch = vi.fn();
const mockExecuteDirectWebSearch = vi.fn();

vi.mock('./directSearchExecutors.js', () => ({
  executeDirectSearch: mockExecuteDirectSearch,
  executeDirectWebSearch: mockExecuteDirectWebSearch,
}));

vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// CitationGrounder/MMR/expandQuery: pass-through stubs so synthesis runs unchanged.
vi.mock('../../../services/search/CitationGrounder.js', () => ({
  validateCitations: () => ({ ungroundedCitations: [], confidence: 1, totalCitations: 0 }),
  stripUngroundedCitations: (text: string) => text,
}));

vi.mock('../../../services/search/DiversityReranker.js', () => ({
  applyMMR: (sources: unknown[]) => sources,
}));

vi.mock('../../../services/search/QueryExpansionService.js', () => ({
  expandQuery: vi.fn(async () => ({ alternatives: [] })),
}));

// ─── Import after mocks ──────────────────────────────────────

const { executeResearch, localeToSearchScope, DeepPlanSchema } =
  await import('./researchOrchestrator.js');

// ─── Helpers ─────────────────────────────────────────────────

function makeWebResult(query: string, count = 2) {
  return {
    query,
    searchType: 'general' as const,
    resultsCount: count,
    results: Array.from({ length: count }, (_, i) => ({
      rank: i + 1,
      title: `Web result ${i + 1} for ${query}`,
      url: `https://example.com/${query.replace(/\s+/g, '-')}-${i}`,
      snippet: `Snippet for "${query}" #${i}`,
      domain: 'example.com',
      publishedDate: null,
    })),
  };
}

function makeDocResult(query: string, count = 2) {
  return {
    collection: 'mock',
    query,
    resultsCount: count,
    results: Array.from({ length: count }, (_, i) => ({
      source: `Doc ${i + 1} for ${query}`,
      url: `https://gruene.de/doc-${i}`,
      excerpt: `Excerpt about "${query}" #${i}`,
      relevance: 'Hoch',
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetIntermediateModel.mockReturnValue({ id: 'mock-model' });
  mockExecuteDirectWebSearch.mockImplementation(async ({ query }: { query: string }) =>
    makeWebResult(query)
  );
  mockExecuteDirectSearch.mockImplementation(async ({ query }: { query: string }) =>
    makeDocResult(query)
  );
  mockGenerateText.mockResolvedValue({ text: 'Mocked synthesis answer [1] [2].' });
});

// ─── Tests ───────────────────────────────────────────────────

describe('localeToSearchScope', () => {
  it('maps de → deutschland / de-DE', () => {
    expect(localeToSearchScope('de')).toEqual({
      qdrantCollection: 'deutschland',
      webLanguage: 'de-DE',
    });
  });

  it('maps at → oesterreich / de-AT', () => {
    expect(localeToSearchScope('at')).toEqual({
      qdrantCollection: 'oesterreich',
      webLanguage: 'de-AT',
    });
  });

  it('maps eu → deutschland / de-DE (default fallback)', () => {
    expect(localeToSearchScope('eu')).toEqual({
      qdrantCollection: 'deutschland',
      webLanguage: 'de-DE',
    });
  });
});

describe('DeepPlanSchema', () => {
  it('accepts a valid plan with 3 sub-questions', () => {
    const plan = {
      subQuestions: [
        { id: 'q1', question: 'Werdegang?', sources: ['qdrant'] },
        { id: 'q2', question: 'Aktuelles?', sources: ['web'] },
        { id: 'q3', question: 'Positionen?', sources: ['qdrant', 'web'] },
      ],
      locale: 'de',
      reportShape: 'biographical',
    };
    expect(() => DeepPlanSchema.parse(plan)).not.toThrow();
  });

  it('rejects fewer than 2 sub-questions', () => {
    const plan = {
      subQuestions: [{ id: 'q1', question: 'only one', sources: ['web'] }],
      locale: 'de',
      reportShape: 'general',
    };
    expect(() => DeepPlanSchema.parse(plan)).toThrow();
  });

  it('rejects empty sources array', () => {
    const plan = {
      subQuestions: [
        { id: 'q1', question: 'a', sources: [] },
        { id: 'q2', question: 'b', sources: ['web'] },
      ],
      locale: 'de',
      reportShape: 'general',
    };
    expect(() => DeepPlanSchema.parse(plan)).toThrow();
  });

  it('rejects unknown locale', () => {
    const plan = {
      subQuestions: [
        { id: 'q1', question: 'a', sources: ['web'] },
        { id: 'q2', question: 'b', sources: ['web'] },
      ],
      locale: 'fr',
      reportShape: 'general',
    };
    expect(() => DeepPlanSchema.parse(plan)).toThrow();
  });
});

describe('executeResearch — opt-out via useLLMSynthesis: false', () => {
  it('does NOT invoke the deep planner when useLLMSynthesis is false', async () => {
    await executeResearch({
      question: 'wer ist friedrich merz',
      complexity: 'complex',
      useLLMSynthesis: false,
    });
    // Template synthesis path; no generateObject planner call.
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it('invokes the deep planner regardless of complexity (short biographical query)', async () => {
    // Regression: "wer ist X" is < 30 chars → classifier marks 'simple', but
    // it's exactly the case where deep mode helps. Explicit @recherche should
    // always run deep mode.
    mockGenerateObject.mockImplementation(async ({ schema }: { schema: unknown }) => {
      if (schema === DeepPlanSchema) {
        return {
          object: {
            subQuestions: [
              { id: 'q1', question: 'Werdegang', sources: ['web'] },
              { id: 'q2', question: 'Karriere', sources: ['qdrant'] },
            ],
            locale: 'de',
            reportShape: 'biographical',
          },
        };
      }
      return { object: { score: 5, weakAspects: [] } };
    });

    await executeResearch({
      question: 'wer ist friedrich merz',
      complexity: 'simple',
    });
    expect(mockGenerateObject).toHaveBeenCalled();
  });
});

describe('executeResearch — deep path (complex)', () => {
  function mockPlanner(plan: unknown) {
    mockGenerateObject.mockImplementation(async ({ schema }: { schema: { _def?: unknown } }) => {
      // First call is the planner (DeepPlanSchema), second is the coverage assessor.
      // Differentiate by which schema was passed.
      if (schema === DeepPlanSchema) {
        return { object: plan };
      }
      // Coverage assessor: return high score so no refinement round.
      return { object: { score: 5, weakAspects: [] } };
    });
  }

  it('invokes the deep planner and routes locale=at to oesterreich + de-AT', async () => {
    mockPlanner({
      subQuestions: [
        { id: 'q1', question: 'Wer ist Werner Kogler', sources: ['web'] },
        { id: 'q2', question: 'Klimapolitik Österreich Grüne', sources: ['qdrant'] },
      ],
      locale: 'at',
      reportShape: 'biographical',
    });

    await executeResearch({
      question: 'wer ist werner kogler',
      complexity: 'complex',
    });

    expect(mockGenerateObject).toHaveBeenCalled();
    expect(mockExecuteDirectWebSearch).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'de-AT' })
    );
    expect(mockExecuteDirectSearch).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'oesterreich' })
    );
  });

  it('routes locale=de to deutschland + de-DE', async () => {
    mockPlanner({
      subQuestions: [
        { id: 'q1', question: 'Werdegang Friedrich Merz', sources: ['web'] },
        { id: 'q2', question: 'CDU Position Klimapolitik', sources: ['qdrant'] },
      ],
      locale: 'de',
      reportShape: 'biographical',
    });

    await executeResearch({
      question: 'wer ist friedrich merz',
      complexity: 'complex',
    });

    expect(mockExecuteDirectWebSearch).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'de-DE' })
    );
    expect(mockExecuteDirectSearch).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'deutschland' })
    );
  });

  it('fans out one mini-search per sub-question/source combination', async () => {
    mockPlanner({
      subQuestions: [
        { id: 'q1', question: 'a', sources: ['web'] },
        { id: 'q2', question: 'b', sources: ['qdrant'] },
        { id: 'q3', question: 'c', sources: ['web', 'qdrant'] },
      ],
      locale: 'de',
      reportShape: 'general',
    });

    await executeResearch({
      question: 'eine komplexe frage',
      complexity: 'complex',
    });

    // q1+q3 = 2 web calls; q2+q3 = 2 qdrant calls
    expect(mockExecuteDirectWebSearch).toHaveBeenCalledTimes(2);
    expect(mockExecuteDirectSearch).toHaveBeenCalledTimes(2);
  });

  it('triggers refinement round when coverage score < 4 with weak aspects', async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          subQuestions: [
            { id: 'q1', question: 'a', sources: ['web'] },
            { id: 'q2', question: 'b', sources: ['web'] },
          ],
          locale: 'de',
          reportShape: 'general',
        },
      })
      .mockResolvedValueOnce({
        object: { score: 2, weakAspects: ['aspect-x', 'aspect-y'] },
      });

    await executeResearch({
      question: 'tiefere frage',
      complexity: 'complex',
    });

    // Round 1: 2 web searches (one per sub-question).
    // Round 2: weak aspects spawn additional searches.
    expect(mockExecuteDirectWebSearch.mock.calls.length).toBeGreaterThan(2);
  });

  it('skips refinement round when coverage score >= 4', async () => {
    mockGenerateObject
      .mockResolvedValueOnce({
        object: {
          subQuestions: [
            { id: 'q1', question: 'a', sources: ['web'] },
            { id: 'q2', question: 'b', sources: ['web'] },
          ],
          locale: 'de',
          reportShape: 'general',
        },
      })
      .mockResolvedValueOnce({
        object: { score: 5, weakAspects: [] },
      });

    await executeResearch({
      question: 'gut abgedeckte frage',
      complexity: 'complex',
    });

    // Only round 1 — exactly 2 web calls (one per sub-question).
    expect(mockExecuteDirectWebSearch).toHaveBeenCalledTimes(2);
    expect(mockExecuteDirectSearch).toHaveBeenCalledTimes(0);
  });

  it('falls back to single-shot path when planner fails', async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error('planner exploded'));

    const result = await executeResearch({
      question: 'wer ist friedrich merz',
      complexity: 'complex',
    });

    // Result still returned (single-shot path produced it).
    expect(result.answer).toBeTruthy();
    // generateObject was attempted once (failed), then no further deep-mode calls.
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it('userLocale=de-AT promotes default locale before planner override', async () => {
    mockPlanner({
      subQuestions: [
        { id: 'q1', question: 'a', sources: ['web'] },
        { id: 'q2', question: 'b', sources: ['web'] },
      ],
      locale: 'at',
      reportShape: 'general',
    });

    await executeResearch({
      question: 'eine frage',
      complexity: 'complex',
      userLocale: 'de-AT',
    });

    // Verify the planner was given 'at' as the default locale via the prompt.
    const plannerCall = mockGenerateObject.mock.calls[0]?.[0] as {
      prompt: string;
    };
    expect(plannerCall.prompt).toContain('Default-Land: at');
  });
});

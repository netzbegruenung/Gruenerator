import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Module mocks (hoisted before imports) ────────────────────

const mockGenerateObject = vi.fn();
const mockGenerateText = vi.fn();

vi.mock('ai', () => ({
  generateObject: mockGenerateObject,
  generateText: mockGenerateText,
}));

const mockGetIntermediateModel = vi.fn(() => ({ id: 'mock-model' }));

vi.mock('../../../routes/chat/agents/providers.js', () => ({
  getIntermediateModel: mockGetIntermediateModel,
}));

const mockExecuteDirectSearch = vi.fn();
const mockExecuteDirectWebSearch = vi.fn();

vi.mock('../../../routes/chat/agents/directSearchExecutors.js', () => ({
  executeDirectSearch: mockExecuteDirectSearch,
  executeDirectWebSearch: mockExecuteDirectWebSearch,
}));

// The reader subagent. Mocked at the module boundary rather than below it: the
// point of the stage is that the raw page never crosses this line, so the test
// asserts on what is HANDED OVER and what comes BACK, not on fetching.
const mockCrawlAndDistill = vi.fn();

vi.mock('../../search/CrawlingService.js', () => ({
  crawlAndDistill: mockCrawlAndDistill,
}));

const mockValidateUrlForFetch = vi.fn();

vi.mock('../../../utils/validation/urlSecurity.js', () => ({
  validateUrlForFetch: mockValidateUrlForFetch,
}));

vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockValidateCitations = vi.fn(() => ({
  ungroundedCitations: [] as number[],
  confidence: 1,
  totalCitations: 0,
}));

vi.mock('../../search/CitationGrounder.js', () => ({
  validateCitations: (...args: unknown[]) =>
    (mockValidateCitations as unknown as (...a: unknown[]) => unknown)(...args),
  stripUngroundedCitations: (text: string) => text,
}));

const mmrInput: unknown[][] = [];
vi.mock('../../search/DiversityReranker.js', () => ({
  applyMMR: (sources: unknown[]) => {
    mmrInput.push(sources);
    return sources;
  },
}));

// ─── Import after mocks ──────────────────────────────────────

const {
  executeResearch,
  localeToSearchScope,
  DeepPlanSchema,
  researchConfidence,
  dedupeResearchSources,
  remapCitationMarkers,
} = await import('./researchOrchestrator.js');

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
      url: `https://gruene.de/doc-${query.replace(/\s+/g, '-')}-${i}`,
      excerpt: `Excerpt about "${query}" #${i}`,
      relevance: 'Hoch',
    })),
  };
}

/**
 * Prose with no shingle overlap between indices — enough for the deduplicator to
 * treat two read pages as two documents.
 */
function distinctProse(index: number): string {
  const vocab = [
    'alpha bravo charlie delta echo foxtrot',
    'zulu yankee xray whiskey victor uniform',
    'kilo lima mike november oscar papa',
    'quebec romeo sierra tango umbrella violet',
    'aachen bremen chemnitz dessau erfurt flensburg',
    'gera halle ilmenau jena kassel luebeck',
  ];
  return (vocab[index % vocab.length] ?? 'sonstige woerter hier').repeat(3);
}

const PLAN_TWO_WEB = {
  subQuestions: [
    { id: 'q1', question: 'a', sources: ['web'] },
    { id: 'q2', question: 'b', sources: ['web'] },
  ],
  locale: 'de',
  reportShape: 'general',
};

/** Planner answers with `plan`; every coverage assessment answers `coverage`. */
function mockPlannerAndCoverage(
  plan: unknown,
  coverage = { score: 5, weakAspects: [] as string[] }
) {
  mockGenerateObject.mockImplementation(async ({ schema }: { schema: unknown }) => {
    if (schema === DeepPlanSchema) return { object: plan };
    return { object: coverage };
  });
}

/** The synthesis prompt the model was actually handed. */
function synthesisPrompt(): string {
  const call = mockGenerateText.mock.calls.at(-1)?.[0] as
    { messages?: Array<{ content?: string }> } | undefined;
  return call?.messages?.[0]?.content ?? '';
}

beforeEach(() => {
  vi.clearAllMocks();
  mmrInput.length = 0;
  mockGetIntermediateModel.mockReturnValue({ id: 'mock-model' });
  mockExecuteDirectWebSearch.mockImplementation(async ({ query }: { query: string }) =>
    makeWebResult(query)
  );
  mockExecuteDirectSearch.mockImplementation(async ({ query }: { query: string }) =>
    makeDocResult(query)
  );
  mockGenerateText.mockResolvedValue({ text: 'Mocked synthesis answer [1] [2].' });
  mockValidateUrlForFetch.mockImplementation(async (url: string) => ({ isValid: true, url }));
  // Default reader: every page reads successfully, digest names its source.
  // The filler words differ per URL on purpose — the deduplicator folds sources
  // whose text overlaps, so digests that were near-identical would collapse
  // every read source into one and mask what the other tests are checking.
  mockCrawlAndDistill.mockImplementation(async (seeds: Array<{ url: string; title: string }>) =>
    seeds.map((s, i) => ({
      ...s,
      content: `GELESENER VOLLTEXT von ${s.url} ${distinctProse(i)}`,
      crawled: true,
    }))
  );
  mockValidateCitations.mockReturnValue({
    ungroundedCitations: [],
    confidence: 1,
    totalCitations: 0,
  });
});

// ─── Tests ───────────────────────────────────────────────────

describe('localeToSearchScope', () => {
  it('maps de → deutschland / de-DE / gruene.de', () => {
    expect(localeToSearchScope('de')).toEqual({
      qdrantCollection: 'deutschland',
      webLanguage: 'de-DE',
      docDomain: 'gruene.de',
    });
  });

  it('maps at → oesterreich / de-AT / gruene.at', () => {
    expect(localeToSearchScope('at')).toEqual({
      qdrantCollection: 'oesterreich',
      webLanguage: 'de-AT',
      docDomain: 'gruene.at',
    });
  });

  it('maps eu → deutschland / de-DE / gruene.de (default fallback)', () => {
    expect(localeToSearchScope('eu')).toEqual({
      qdrantCollection: 'deutschland',
      webLanguage: 'de-DE',
      docDomain: 'gruene.de',
    });
  });
});

describe('DeepPlanSchema', () => {
  it('accepts a valid plan with 3 sub-questions', () => {
    expect(() =>
      DeepPlanSchema.parse({
        subQuestions: [
          { id: 'q1', question: 'Werdegang?', sources: ['qdrant'] },
          { id: 'q2', question: 'Aktuelles?', sources: ['web'] },
          { id: 'q3', question: 'Positionen?', sources: ['qdrant', 'web'] },
        ],
        locale: 'de',
        reportShape: 'biographical',
      })
    ).not.toThrow();
  });

  it('rejects fewer than 2 sub-questions', () => {
    expect(() =>
      DeepPlanSchema.parse({
        subQuestions: [{ id: 'q1', question: 'only one', sources: ['web'] }],
        locale: 'de',
        reportShape: 'general',
      })
    ).toThrow();
  });

  /**
   * The ceiling moved 6 → 10. It used to be justified by request budget, but a
   * sub-search is one `gruendlich` call — the same engine depth and the same
   * single paid call as an ordinary web search. Wall-clock is bounded by the
   * round/search budget instead, where it can actually count.
   */
  it('accepts a broad plan of 8 sub-questions', () => {
    expect(() =>
      DeepPlanSchema.parse({
        subQuestions: Array.from({ length: 8 }, (_, i) => ({
          id: `q${i}`,
          question: `Aspekt ${i} von X`,
          sources: ['web'],
        })),
        locale: 'de',
        reportShape: 'general',
      })
    ).not.toThrow();
  });

  it('rejects empty sources array', () => {
    expect(() =>
      DeepPlanSchema.parse({
        subQuestions: [
          { id: 'q1', question: 'a', sources: [] },
          { id: 'q2', question: 'b', sources: ['web'] },
        ],
        locale: 'de',
        reportShape: 'general',
      })
    ).toThrow();
  });

  it('rejects unknown locale', () => {
    expect(() =>
      DeepPlanSchema.parse({
        subQuestions: [
          { id: 'q1', question: 'a', sources: ['web'] },
          { id: 'q2', question: 'b', sources: ['web'] },
        ],
        locale: 'fr',
        reportShape: 'general',
      })
    ).toThrow();
  });
});

describe('executeResearch — empty question refusal', () => {
  it('returns a graceful refusal when called with an empty question', async () => {
    const result = await executeResearch({ question: '' });
    expect(result.citations).toHaveLength(0);
    expect(result.searchSteps).toHaveLength(0);
    expect(result.confidence).toBe('low');
    expect(result.answer).toContain('konkrete Recherche-Frage');
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it('returns the same refusal for a whitespace-only question', async () => {
    const result = await executeResearch({ question: '   \n\t  ' });
    expect(result.answer).toContain('konkrete Recherche-Frage');
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });
});

/**
 * The stage this module never had. Everything downstream — coverage, synthesis,
 * citations — used to be written from a few hundred characters of search-result
 * teaser, on the one path whose entire purpose is depth.
 */
describe('executeResearch — the read stage', () => {
  it('reads the top sources and writes the report from the page, not the teaser', async () => {
    mockPlannerAndCoverage(PLAN_TWO_WEB);

    await executeResearch({ question: 'eine frage' });

    expect(mockCrawlAndDistill).toHaveBeenCalled();
    const [seeds, query, options] = mockCrawlAndDistill.mock.calls[0] as [
      Array<{ url: string }>,
      string,
      { mode: string; targetChars: number },
    ];
    expect(seeds.length).toBeGreaterThan(0);
    expect(query).toBe('eine frage');
    // Nobody named these pages — they are hits standing in for an answer, so
    // the digest must be selected against the question.
    expect(options.mode).toBe('query-focused');

    const prompt = synthesisPrompt();
    expect(prompt).toContain('GELESENER VOLLTEXT');
    expect(prompt).toContain('vollständig gelesen');
  });

  it('validates every URL before fetching it', async () => {
    // Search hits are third-party text chosen by a third party, and this is a
    // server-side fetch — the same reason `scrape_url` validates.
    mockPlannerAndCoverage(PLAN_TWO_WEB);
    mockValidateUrlForFetch.mockResolvedValue({ isValid: false, error: 'blocked host' });

    const result = await executeResearch({ question: 'eine frage' });

    expect(mockCrawlAndDistill).not.toHaveBeenCalled();
    expect(result.answer).toBeTruthy();
  });

  it('keeps the snippets when reading fails, and does not throw', async () => {
    mockPlannerAndCoverage(PLAN_TWO_WEB);
    mockCrawlAndDistill.mockRejectedValue(new Error('crawler exploded'));

    const result = await executeResearch({ question: 'eine frage' });

    expect(result.citations.length).toBeGreaterThan(0);
    expect(synthesisPrompt()).toContain('Snippet for');
    expect(synthesisPrompt()).not.toContain('GELESENER VOLLTEXT');
  });

  it('does not re-read a source a previous round already read', async () => {
    // A refinement round re-ranks the whole pool. Without the `read` guard the
    // same top pages would be re-fetched every round and the budget would never
    // reach the new material the round was spent on.
    mockPlannerAndCoverage(PLAN_TWO_WEB, { score: 2, weakAspects: ['luecke'] });

    await executeResearch({ question: 'eine frage' });

    expect(mockCrawlAndDistill.mock.calls.length).toBeGreaterThan(1);
    const firstSeeds = (mockCrawlAndDistill.mock.calls[0] as [Array<{ url: string }>])[0];
    const secondSeeds = (mockCrawlAndDistill.mock.calls[1] as [Array<{ url: string }>])[0];
    const firstUrls = new Set(firstSeeds.map((s) => s.url));
    for (const seed of secondSeeds) {
      expect(firstUrls.has(seed.url)).toBe(false);
    }
  });
});

describe('executeResearch — planning', () => {
  it('fans out one mini-search per sub-question/source combination', async () => {
    mockPlannerAndCoverage({
      subQuestions: [
        { id: 'q1', question: 'a', sources: ['web'] },
        { id: 'q2', question: 'b', sources: ['qdrant'] },
        { id: 'q3', question: 'c', sources: ['web', 'qdrant'] },
      ],
      locale: 'de',
      reportShape: 'general',
    });

    await executeResearch({ question: 'eine komplexe frage' });

    expect(mockExecuteDirectWebSearch).toHaveBeenCalledTimes(2);
    expect(mockExecuteDirectSearch).toHaveBeenCalledTimes(2);
  });

  /**
   * The heuristic planner that used to catch this case decided worse than the
   * trivial fallback: a handful of German regexes routinely sent a biographical
   * question to the party-document collection alone.
   */
  it('still researches the question when the planner fails', async () => {
    mockGenerateObject.mockImplementation(async ({ schema }: { schema: unknown }) => {
      if (schema === DeepPlanSchema) throw new Error('planner exploded');
      return { object: { score: 5, weakAspects: [] } };
    });

    const result = await executeResearch({ question: 'wer ist friedrich merz' });

    expect(mockExecuteDirectWebSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'wer ist friedrich merz' })
    );
    expect(mockExecuteDirectSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'wer ist friedrich merz' })
    );
    expect(result.citations.length).toBeGreaterThan(0);
  });

  it('routes locale=at to the Austrian collection and de-AT', async () => {
    mockPlannerAndCoverage({
      subQuestions: [
        { id: 'q1', question: 'Wer ist Werner Kogler', sources: ['web'] },
        { id: 'q2', question: 'Klimapolitik Österreich Grüne', sources: ['qdrant'] },
      ],
      locale: 'at',
      reportShape: 'biographical',
    });

    await executeResearch({ question: 'wer ist werner kogler' });

    expect(mockExecuteDirectWebSearch).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'de-AT' })
    );
    expect(mockExecuteDirectSearch).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'oesterreich' })
    );
  });

  it('passes the user locale to the planner as the default country', async () => {
    mockPlannerAndCoverage(PLAN_TWO_WEB);

    await executeResearch({ question: 'eine frage', userLocale: 'de-AT' });

    const plannerCall = mockGenerateObject.mock.calls[0]?.[0] as { prompt: string };
    expect(plannerCall.prompt).toContain('Default-Land: at');
  });
});

/**
 * Caps that read as cost controls but bound nothing. Measured, a Linkup search
 * costs the same whether it returns 4 hits or 10 — `maxResults` is not a pricing
 * dimension, depth × outputType is. These numbers only ever capped material.
 */
describe('executeResearch — the lifted caps', () => {
  it('buys the adjacent-keyword fan-out that the tier includes for free', async () => {
    mockPlannerAndCoverage(PLAN_TWO_WEB);

    await executeResearch({ question: 'eine frage' });

    for (const call of mockExecuteDirectWebSearch.mock.calls.map((c) => c[0])) {
      expect(call.tier).toBe('gruendlich');
      expect(call.maxResults).toBeGreaterThanOrEqual(8);
    }
  });

  it('asks the document search for more than four hits per sub-question', async () => {
    mockPlannerAndCoverage({
      subQuestions: [
        { id: 'q1', question: 'a', sources: ['qdrant'] },
        { id: 'q2', question: 'b', sources: ['qdrant'] },
      ],
      locale: 'de',
      reportShape: 'general',
    });

    await executeResearch({ question: 'eine frage' });

    for (const call of mockExecuteDirectSearch.mock.calls.map((c) => c[0])) {
      expect(call.limit).toBeGreaterThanOrEqual(8);
    }
  });

  /**
   * The cap contradicted the prompt shipped with it: `general` asks for 3–5
   * sections of 1–3 paragraphs, which does not fit in 2400 tokens — so the
   * report was truncated mid-section on exactly the broad questions it was
   * written for. The answer paths dropped their caps in #2002 for this reason.
   */
  it('puts no output-token cap on the report', async () => {
    mockPlannerAndCoverage(PLAN_TWO_WEB);

    await executeResearch({ question: 'eine frage' });

    const call = mockGenerateText.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(call).not.toHaveProperty('maxOutputTokens');
  });
});

/**
 * Rounds used to be "one optional refinement, hard cap 1", so a question the
 * assessor still called lückenhaft after two rounds was written up anyway —
 * with the gap known and unfilled.
 */
describe('executeResearch — the round budget', () => {
  it('keeps refining while coverage stays weak, past the old single-round cap', async () => {
    mockPlannerAndCoverage(PLAN_TWO_WEB, { score: 2, weakAspects: ['a1', 'a2', 'a3'] });

    await executeResearch({ question: 'eine frage' });

    // Old behaviour: round 1 (2 web) + exactly one refinement (3 web) = 5.
    expect(mockExecuteDirectWebSearch.mock.calls.length).toBeGreaterThan(5);
  });

  it('stops at the round ceiling even when coverage never improves', async () => {
    mockPlannerAndCoverage(PLAN_TWO_WEB, { score: 1, weakAspects: ['a1', 'a2', 'a3'] });

    await executeResearch({ question: 'eine frage' });

    // 3 rounds: 2 + 3 + 3 web searches. A missing ceiling would not terminate.
    expect(mockExecuteDirectWebSearch.mock.calls.length).toBe(8);
  });

  it('stops after one round when the material already covers the question', async () => {
    mockPlannerAndCoverage(PLAN_TWO_WEB, { score: 5, weakAspects: [] });

    await executeResearch({ question: 'gut abgedeckte frage' });

    expect(mockExecuteDirectWebSearch).toHaveBeenCalledTimes(2);
    expect(mockExecuteDirectSearch).toHaveBeenCalledTimes(0);
  });

  it('carries the entity through into the refinement queries', async () => {
    // The assessor returns terse phrases ("Herkunft"). Used as-is, a search
    // engine gets no signal about WHO — the live failure was Mona Neubaur's
    // "Herkunft" search returning random Bachelorarbeiten.
    mockPlannerAndCoverage(PLAN_TWO_WEB, { score: 2, weakAspects: ['Herkunft'] });

    await executeResearch({ question: 'wer ist mona neubaur' });

    const refinement = mockExecuteDirectWebSearch.mock.calls
      .map((c) => (c[0] as { query: string }).query)
      .find((q) => q.includes('Herkunft'));
    expect(refinement).toContain('mona neubaur');
  });

  it('does not spend the remaining rounds when the assessor itself fails', async () => {
    // A broken assessor cannot say what another round would target, so treating
    // its failure as "keep going" would spend the budget blind.
    mockGenerateObject.mockImplementation(async ({ schema }: { schema: unknown }) => {
      if (schema === DeepPlanSchema) return { object: PLAN_TWO_WEB };
      throw new Error('assessor exploded');
    });

    await executeResearch({ question: 'eine frage' });

    expect(mockExecuteDirectWebSearch).toHaveBeenCalledTimes(2);
  });
});

describe('executeResearch — the result', () => {
  it('reports low confidence instead of replacing the report when most citations are ungrounded', async () => {
    // The template synthesiser this replaces glued snippets into paragraphs and
    // stamped them with markers — a concatenation that read like an answer.
    mockPlannerAndCoverage(PLAN_TWO_WEB);
    mockValidateCitations.mockReturnValue({
      ungroundedCitations: [1, 2, 3],
      confidence: 0.2,
      totalCitations: 4,
    });

    const result = await executeResearch({ question: 'eine frage' });

    expect(result.answer).toBe('Mocked synthesis answer [1] [2].');
    expect(result.confidence).toBe('low');
  });

  it('names the failure instead of faking a report when synthesis dies', async () => {
    mockPlannerAndCoverage(PLAN_TWO_WEB);
    mockGenerateText.mockRejectedValue(new Error('synth exploded'));

    const result = await executeResearch({ question: 'eine frage' });

    expect(result.answer).toContain('konnte nicht erstellt werden');
    expect(result.confidence).toBe('low');
    expect(result.citations.length).toBeGreaterThan(0);
  });

  it('emits no follow-up questions', async () => {
    // The generator this replaces matched three regexes against the question and
    // emitted fixed strings about its SHAPE, not about what was found.
    mockPlannerAndCoverage(PLAN_TWO_WEB);

    const result = await executeResearch({ question: 'wer ist friedrich merz' });

    expect(result.followUpQuestions).toEqual([]);
  });

  it('carries documentId/chunkIndex from a document hit into its citation, and leaves a web citation without them', async () => {
    mockPlannerAndCoverage({
      subQuestions: [{ id: 'q1', question: 'eine frage', sources: ['qdrant', 'web'] }],
      locale: 'de',
      reportShape: 'general',
    });
    mockExecuteDirectSearch.mockResolvedValue({
      collection: 'mock',
      query: 'eine frage',
      resultsCount: 1,
      results: [
        {
          source: 'Grundsatzprogramm',
          url: 'https://gruene.de/grundsatzprogramm',
          excerpt: 'Auszug aus dem Programm',
          relevance: 'Hoch',
          documentId: '20200125_Grundsatzprogramm',
          chunkIndex: 3,
        },
      ],
    });
    mockExecuteDirectWebSearch.mockResolvedValue(makeWebResult('eine frage', 1));

    const result = await executeResearch({ question: 'eine frage' });

    const docCitation = result.citations.find(
      (c) => c.url === 'https://gruene.de/grundsatzprogramm'
    );
    expect(docCitation).toMatchObject({ documentId: '20200125_Grundsatzprogramm', chunkIndex: 3 });

    const webCitation = result.citations.find((c) => c.domain === 'example.com');
    expect(webCitation?.documentId).toBeUndefined();
    expect(webCitation?.chunkIndex).toBeUndefined();
  });
});

describe('researchConfidence', () => {
  const base = { sources: 12, domains: 6, answerLength: 800 };

  it('reports high only for a broad, multi-domain run', () => {
    expect(researchConfidence(base)).toBe('high');
  });

  it('drops to low when nothing came back', () => {
    expect(researchConfidence({ ...base, sources: 0 })).toBe('low');
    expect(researchConfidence({ ...base, answerLength: 20 })).toBe('low');
  });

  it('drops to medium for a thin single-domain run', () => {
    expect(researchConfidence({ ...base, sources: 4, domains: 2 })).toBe('medium');
    expect(researchConfidence({ ...base, sources: 4, domains: 1 })).toBe('low');
  });
});

/**
 * `applyMMR` documents its input as "sorted by relevance, highest first" and
 * seeds itself from the first element. `executeRound` sorts WITHIN a round, so a
 * single-round run satisfied that by accident — but rounds are concatenated in
 * the order they ran, so from round two on the array is sorted in segments and
 * MMR would seed from round one's best rather than the run's.
 */
describe('executeResearch — what MMR is handed', () => {
  it('sorts globally across rounds before reranking', async () => {
    mockPlannerAndCoverage(PLAN_TWO_WEB, { score: 2, weakAspects: ['luecke'] });
    // Round 2's hits outrank round 1's, so segment-wise sorting is visible.
    let round = 0;
    mockExecuteDirectWebSearch.mockImplementation(async ({ query }: { query: string }) => {
      round += 1;
      const base = makeWebResult(query);
      return {
        ...base,
        results: base.results.map((r, i) => ({ ...r, rank: round > 2 ? 1 : 5 + i })),
      };
    });

    await executeResearch({ question: 'eine frage' });

    const handed = mmrInput.at(-1) as Array<{ relevance: number }>;
    expect(handed.length).toBeGreaterThan(2);
    const scores = handed.map((s) => s.relevance);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});

/**
 * Restored from the Linkup dossier path, where it was the only consumer. It
 * belongs here at least as much: rounds are deduplicated by EXACT url as they
 * arrive, which lets the same page through under `?utm_source=…` and under a
 * second path on the same host.
 */
describe('dedupeResearchSources', () => {
  const cite = (id: number, url: string, snippet: string) => ({
    id,
    url,
    title: `Quelle ${id}`,
    domain: 'example.org',
    snippet,
  });

  it('folds two URLs that address the same document and renumbers the survivors', () => {
    const out = dedupeResearchSources([
      cite(1, 'https://example.org/meldung', 'Ein Text'),
      cite(2, 'https://www.example.org/meldung?utm_source=x', 'Ein Text'),
      cite(3, 'https://example.org/anderes', 'Etwas ganz anderes'),
    ]);

    expect(out.citations.map((c) => c.id)).toEqual([1, 2]);
    expect(out.remap.get('2')).toBe('1');
    expect(out.remap.get('3')).toBe('2');
  });

  it('keeps merely related sources apart', () => {
    const out = dedupeResearchSources([
      cite(1, 'https://a.example/1', 'Der Bundestag beschloss das Gesetz am Donnerstag.'),
      cite(2, 'https://b.example/2', 'Völlig anderer Gegenstand, andere Wörter, anderer Text.'),
    ]);
    expect(out.citations).toHaveLength(2);
  });

  it('moves the answer markers onto the surviving ids', () => {
    const remap = new Map([
      ['1', '1'],
      ['2', '1'],
      ['3', '2'],
    ]);
    expect(remapCitationMarkers('A [1] B [2] C [3]', remap)).toBe('A [1] B [1] C [2]');
  });

  it('leaves a marker the model invented alone', () => {
    expect(remapCitationMarkers('siehe [9]', new Map([['1', '1']]))).toBe('siehe [9]');
  });
});

describe('executeResearch — reading uses the validated URL', () => {
  it('fetches what the SSRF check returned, not the raw string', async () => {
    // CLAUDE.md: use the validated `url` from the result. The checker
    // normalises, so handing the raw string on would fetch something the check
    // never saw.
    mockPlannerAndCoverage(PLAN_TWO_WEB);
    mockValidateUrlForFetch.mockImplementation(async (url: string) => ({
      isValid: true,
      url: new URL(`https://normalisiert.example/${encodeURIComponent(url)}`),
    }));

    await executeResearch({ question: 'eine frage' });

    const seeds = (mockCrawlAndDistill.mock.calls[0] as [Array<{ url: string }>])[0];
    for (const seed of seeds) {
      expect(seed.url).toContain('normalisiert.example');
    }
  });

  it('still maps the digest back onto the source it came from', async () => {
    mockPlannerAndCoverage(PLAN_TWO_WEB);
    mockValidateUrlForFetch.mockImplementation(async (url: string) => ({
      isValid: true,
      url: new URL(`${url}?normalisiert=1`),
    }));

    await executeResearch({ question: 'eine frage' });

    expect(synthesisPrompt()).toContain('GELESENER VOLLTEXT');
  });
});

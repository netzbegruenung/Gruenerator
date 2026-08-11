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

// Linkup deep-research short-circuits the whole orchestrator when
// LINKUP_API_KEY is present (it is, in local .env). These tests exercise the
// planner/fan-out path, so force getLinkupService → null to keep them hermetic
// (otherwise executeResearch makes a real ~14s Linkup call and skips the fan-out).
vi.mock('../../../services/search/LinkupService.js', () => ({
  getLinkupService: vi.fn(() => null),
}));

// Same reasoning for the cheap lane: left live it would make a real GreenPT
// call whenever a developer has GREENPT_SEARCH_ENABLED set.
vi.mock('../../../services/search/GreenPTSearchService.js', () => ({
  getGreenPTSearchService: vi.fn(() => null),
  GREENPT_MAX_RESULTS: 10,
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

const {
  executeResearch,
  localeToSearchScope,
  DeepPlanSchema,
  linkupConfidence,
  dedupeResearchSources,
  remapCitationMarkers,
} = await import('./researchOrchestrator.js');
const { getLinkupService } = await import('../../../services/search/LinkupService.js');

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

describe('executeResearch — empty question refusal', () => {
  it('returns a graceful refusal when called with an empty question', async () => {
    const result = await executeResearch({ question: '', complexity: 'complex' });
    expect(result.citations).toHaveLength(0);
    expect(result.searchSteps).toHaveLength(0);
    expect(result.confidence).toBe('low');
    expect(result.answer).toContain('konkrete Recherche-Frage');
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it('returns the same refusal for whitespace-only question', async () => {
    const result = await executeResearch({ question: '   \n\t  ', complexity: 'complex' });
    expect(result.answer).toContain('konkrete Recherche-Frage');
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });
});

describe('executeResearch — onProgress callback', () => {
  it('fires progress at planner, search, and synthesis phases', async () => {
    const onProgress = vi.fn();
    mockGenerateObject.mockImplementation(async ({ schema }: { schema: unknown }) => {
      if (schema === DeepPlanSchema) {
        return {
          object: {
            subQuestions: [
              { id: 'q1', question: 'a', sources: ['web'] },
              { id: 'q2', question: 'b', sources: ['web'] },
            ],
            locale: 'de',
            reportShape: 'general',
          },
        };
      }
      return { object: { score: 5, weakAspects: [] } };
    });

    await executeResearch({
      question: 'eine frage',
      complexity: 'complex',
      onProgress,
    });

    const messages = onProgress.mock.calls.map((c) => c[0] as string);
    expect(messages).toContain('Plane Recherche…');
    expect(messages.some((m) => m.includes('Sub-Fragen'))).toBe(true);
    expect(messages).toContain('Erstelle Bericht…');
  });

  it('fires the refinement progress message when round 2 runs', async () => {
    const onProgress = vi.fn();
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
        object: { score: 2, weakAspects: ['konkrete-aspect'] },
      });

    await executeResearch({
      question: 'eine frage',
      complexity: 'complex',
      onProgress,
    });

    const messages = onProgress.mock.calls.map((c) => c[0] as string);
    expect(messages.some((m) => m.includes('Vertiefe Recherche zu: konkrete-aspect'))).toBe(true);
  });
});

describe('executeResearch — locale reaches the single-shot path', () => {
  // Regression: the single-shot path hardcoded collection 'deutschland' and
  // domain 'gruene.de', so a de-AT user searching without the deep planner got
  // the German corpus. Only the deep path went through localeToSearchScope.
  it('searches the Austrian collection for de-AT', async () => {
    const result = await executeResearch({
      question: 'position zur bodenversiegelung',
      complexity: 'moderate',
      useLLMSynthesis: false,
      userLocale: 'de-AT',
    });

    const docCalls = mockExecuteDirectSearch.mock.calls.map((c) => c[0]);
    expect(docCalls.length).toBeGreaterThan(0);
    for (const call of docCalls) {
      expect(call.collection).toBe('oesterreich');
    }
    for (const call of mockExecuteDirectWebSearch.mock.calls.map((c) => c[0])) {
      expect(call.language).toBe('de-AT');
    }
    const docCitations = result.citations.filter((c) => c.domain !== 'example.com');
    expect(docCitations.length).toBeGreaterThan(0);
    for (const citation of docCitations) {
      expect(citation.domain).toBe('gruene.at');
    }
  });

  it('still searches the German collection for de-DE', async () => {
    await executeResearch({
      question: 'position zur bodenversiegelung',
      complexity: 'moderate',
      useLLMSynthesis: false,
      userLocale: 'de-DE',
    });
    for (const call of mockExecuteDirectSearch.mock.calls.map((c) => c[0])) {
      expect(call.collection).toBe('deutschland');
    }
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

describe('linkupConfidence', () => {
  const base = { sources: 12, domains: 6, answerLength: 800, queryInherited: false };

  it('reports high only for a broad, multi-domain run on the user own question', () => {
    expect(linkupConfidence(base)).toBe('high');
  });

  it('caps an inherited query at medium — exhaustive research into the WRONG question is not high confidence', () => {
    // The live failure: "Ja, bitte recherchiere das jetzt im Web" produced 20
    // sources about the wrong topic and still shipped "Hohe Konfidenz".
    expect(linkupConfidence({ ...base, queryInherited: true })).toBe('medium');
  });

  it('drops to low when nothing came back', () => {
    expect(linkupConfidence({ ...base, sources: 0 })).toBe('low');
    expect(linkupConfidence({ ...base, answerLength: 20 })).toBe('low');
  });

  it('drops to medium for a thin single-domain run', () => {
    expect(linkupConfidence({ ...base, sources: 4, domains: 2 })).toBe('medium');
    expect(linkupConfidence({ ...base, sources: 4, domains: 1 })).toBe('low');
  });

  it('an inherited query with a thin run is low, not medium', () => {
    expect(linkupConfidence({ ...base, sources: 2, domains: 1, queryInherited: true })).toBe('low');
  });
});

describe('executeResearch — Linkup citation snippets are capped', () => {
  it('truncates the scraped page Linkup ships as `snippet`', async () => {
    // Linkup's sourcedAnswer sources carry the whole scraped page, not an
    // excerpt. Unbounded, the Monitor rendered a full Beschlusstext as one
    // blockquote per source.
    const wholePage = 'A'.repeat(8000);
    vi.mocked(getLinkupService).mockReturnValueOnce({
      deepResearch: vi.fn(async () => ({
        answer: 'Antwort [1].',
        sources: [{ name: 'Beschluss', url: 'https://gruene.de/beschluss', snippet: wholePage }],
      })),
    } as unknown as ReturnType<typeof getLinkupService>);

    const result = await executeResearch({ question: 'Was steht im Beschluss?' });

    expect(result.citations).toHaveLength(1);
    // 300 + the ellipsis truncateText appends.
    expect(result.citations[0]?.snippet.length).toBeLessThanOrEqual(303);
  });
});

describe('dedupeResearchSources', () => {
  const source = (id: number, url: string, snippet = `Text ${id}`) => ({
    id,
    title: `Quelle ${id}`,
    url,
    domain: 'example.com',
    snippet,
  });

  it('keeps distinct sources and numbers them from 1', () => {
    const result = dedupeResearchSources([
      source(1, 'https://gruene.de/a'),
      source(2, 'https://gruene.de/b'),
    ]);

    expect(result.citations.map((c) => c.id)).toEqual([1, 2]);
    expect(result.remap.get('2')).toBe('2');
  });

  it('folds the same page reached through www, tracking params and a trailing slash', () => {
    const result = dedupeResearchSources([
      source(1, 'https://bundestag.de/presse/meldung'),
      source(2, 'https://www.bundestag.de/presse/meldung/?utm_source=newsletter'),
    ]);

    expect(result.citations).toHaveLength(1);
    expect(result.remap.get('2')).toBe('1');
  });

  it('renumbers the survivors so the list has no gaps', () => {
    const result = dedupeResearchSources([
      source(1, 'https://gruene.de/a'),
      source(2, 'https://gruene.de/a'),
      source(3, 'https://gruene.de/c'),
    ]);

    expect(result.citations.map((c) => c.id)).toEqual([1, 2]);
    expect(result.citations[1]?.title).toBe('Quelle 3');
    expect(result.remap.get('3')).toBe('2');
  });

  // The two fixtures below are the actual pages from the Monitor run on
  // 11.08.2026 that motivated the text stage: same document, different host and
  // path, so the URL stage cannot see it.
  const PM_LANG =
    'Sie betonen außerdem, dass die iranische Bevölkerung unter der sogenannten „maximum pressure“-Kampagne der Trump-Administration seit dem einseitigen Ausstieg der USA aus der Wiener Nuklearvereinbarung und der Intensivierung des US-amerikanischen Sanktionsregimes leide. „Neben Korruption und Missmanagement verschärft es die wirtschaftliche Lage der Iranerinnen und Iraner dramatisch.“ Bündnis 90/Die Grünen fordern von der Bundesregierung mehr Konsequenz gegenüber dem Iran. Der Bundestag hat am Donnerstag, 8. Oktober 2020, erstmals eine halbe Stunde lang über Anträge der Grünen mit dem Titel „Iran – Menschenrechtsverletzungen verurteilen und völkerrechtliche Verpflichtungen kon... Die Fraktion Bündnis 90/Die Grünen wendet sich gegen die „Repression der Menschen- und Bürgerrechte im Iran“ und fordert die Bundesregierung auf, gegenüber der Regierung in Teheran auf Rechtsstaatlichkeit und die Einhaltung der Menschenrechte zu dringen.';
  const PM_KURZ =
    'Sie betonen außerdem, dass die ... US-amerikanischen Sanktionsregimes leide. „Neben Korruption und Missmanagement verschärft es die wirtschaftliche Lage der Iranerinnen und Iraner dramatisch.“... Bündnis 90/Die Grünen fordern von der Bundesregierung mehr Konsequenz gegenüber dem Iran. Der Bundestag hat am Donnerstag, 8. Oktober 2020, erstmals eine halbe Stunde lang über Anträge der Grünen mit dem Titel „Iran – Menschenrechtsverletzungen verurteilen und völkerrechtliche Verpflichtungen kon... Die Fraktion Bündnis 90/Die Grünen wendet sich gegen die „Repression der Menschen- und Bürgerrechte im Iran“ und fordert die Bundesregierung auf, gegenüber der Regierung in Teheran auf Rechtsstaatlichkeit und die Einhaltung der Menschenrechte zu dringen.';
  const ANDERE_PM =
    'Katharina Dröge zu den Themen Krankenkassenbeiträge, Bürgergeld, Rückführungen nach Syrien, Wirtschaftsreformen, Sondervermögen, Industrie- und internationale Handelspolitik sowie internationale Klimapolitik · Anlässlich der heutigen Fraktionssitzung der Bundestagsfraktion Bündnis 90/Die Grünen finden Sie nachfolgend Statements der Fraktionsvorsitzenden Katharina Dröge zu den Themen Ukraine, Wahlen in Ungarn, Koalitionsausschusses und nötige Entlastungen. Unsere Gedanken sind bei den Menschen im Iran, die so furchtbar unter dem iranischen Regime leiden und die einen absolut berechtigten Wunsch nach einem Ende des Regimes haben.';

  it('folds the same document served under two different paths', () => {
    const result = dedupeResearchSources([
      source(1, 'https://bundestag.de/dokumente/textarchiv/2020/kw41-de-iran', PM_LANG),
      source(2, 'https://www.bundestag.de/presse/hib/iran-menschenrechte', PM_KURZ),
    ]);

    expect(result.citations).toHaveLength(1);
    expect(result.remap.get('2')).toBe('1');
  });

  it('keeps two press releases that merely share a quoted sentence and a house format', () => {
    const result = dedupeResearchSources([
      source(1, 'https://bundestag.de/a', PM_LANG),
      source(2, 'https://gruene-bundestag.de/b', ANDERE_PM),
    ]);

    expect(result.citations).toHaveLength(2);
  });

  it('does not fold two sources that carry no text at all', () => {
    const result = dedupeResearchSources([source(1, '', ''), source(2, '', '')]);

    expect(result.citations).toHaveLength(2);
  });
});

describe('remapCitationMarkers', () => {
  it('moves a marker onto the id its source ended up with', () => {
    const remap = new Map([
      ['1', '1'],
      ['2', '1'],
      ['3', '2'],
    ]);

    expect(remapCitationMarkers('Erst [1], dann [2], dann [3].', remap)).toBe(
      'Erst [1], dann [1], dann [2].'
    );
  });

  it('leaves an invented marker untouched', () => {
    expect(remapCitationMarkers('Steht so in [7].', new Map([['1', '1']]))).toBe(
      'Steht so in [7].'
    );
  });
});

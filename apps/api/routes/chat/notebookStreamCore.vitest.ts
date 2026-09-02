/**
 * Notebook stream core — retrieval per depth tier.
 *
 * Two things are pinned here. First, every tier reranks: that used to be gated
 * on `isFast`, so "Tiefenrecherche" — the path that retrieves the MOST
 * candidates — was the only one handing the model the raw hybrid-search order.
 * Second, `fast` keeps its exact pre-tier numbers, because the public
 * Grün-O-Mat surface runs on it and is not part of the tier change.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { type NotebookDepth } from '@gruenerator/contracts';

const getSearchContext = vi.fn();
const rerankNotebookResults = vi.fn();
const resolveModel = vi.fn();
const streamWithFallback = vi.fn();
const streamForResolution = vi.fn();
const isProviderConfigured = vi.fn(() => true);
const expandQuery = vi.fn();

vi.mock('../../services/notebook/index.js', () => ({
  notebookQAService: {
    getSearchContext: (...args: unknown[]) => getSearchContext(...args),
  },
}));
vi.mock('../../services/notebook/rerankNotebookResults.js', () => ({
  rerankNotebookResults: (...args: unknown[]) => rerankNotebookResults(...args),
}));
vi.mock('./services/responseStreamingService.js', () => ({
  resolveModel: (...args: unknown[]) => resolveModel(...args),
  streamWithFallback: (...args: unknown[]) => streamWithFallback(...args),
  streamForResolution: (...args: unknown[]) => streamForResolution(...args),
}));
vi.mock('./agents/providers.js', () => ({
  isProviderConfigured: (...args: unknown[]) => isProviderConfigured(...args),
}));
vi.mock('../../services/telemetry/langfuseTelemetry.js', () => ({
  BOTH_LANES_FAILED: 'generation failed on both model lanes',
  buildAiTelemetry: () => undefined,
  // Mirrors the enabled-mode handle: a real trace id, update() swallowed.
  withLangfuseTrace: async (_o: unknown, fn: (t: unknown) => Promise<unknown>) =>
    fn({ traceId: 'a'.repeat(32), update: () => {} }),
}));
vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: class {
    getNotebookCollection = vi.fn();
    getCollectionDocuments = vi.fn(async () => []);
  },
}));
vi.mock('../../services/search/QueryExpansionService.js', () => ({
  expandQuery: (...args: unknown[]) => expandQuery(...args),
}));

const { handleNotebookStream } = await import('./notebookStreamCore.js');

/** Minimal express req/res doubles — the core only streams and never reads. */
function makeReqRes() {
  const sent: { event: string; data: Record<string, unknown> }[] = [];
  const req = { on: vi.fn() } as unknown as Parameters<typeof handleNotebookStream>[0]['req'];
  const res = {
    headersSent: true,
    write: vi.fn(),
    end: vi.fn(),
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
  } as unknown as Parameters<typeof handleNotebookStream>[0]['res'];
  const sse = {
    send: (event: string, data: Record<string, unknown>) => sent.push({ event, data }),
    end: vi.fn(),
    isEnded: () => false,
  } as unknown as Parameters<typeof handleNotebookStream>[0]['sse'];
  return { req, res, sse, sent };
}

function searchContextWith(n: number) {
  return {
    referencesMap: {},
    sortedResults: Array.from({ length: n }, (_, i) => ({
      title: `Doc ${i}`,
      snippet: `Inhalt ${i}`,
      similarity: 1 - i / 100,
    })),
    systemPrompt: 'ORIGINAL_SYSTEM_PROMPT',
    contextSummary: 'summary',
    isMulti: false,
    effectiveCollectionIds: ['grundsatz-system'],
  };
}

async function run(mode?: NotebookDepth, messages?: unknown[]) {
  const { req, res, sse, sent } = makeReqRes();
  await handleNotebookStream({
    req,
    res,
    sse,
    messages: (messages ?? [
      { role: 'user', content: 'Was steht zur sozialen Sicherung drin?' },
    ]) as Parameters<typeof handleNotebookStream>[0]['messages'],
    collectionId: 'grundsatz-system',
    ...(mode && { mode }),
    closeStream: false,
  });
  return sent;
}

/** A two-turn thread ending in a follow-up, as the ultra client sends it. */
const HISTORY_MESSAGES = [
  { role: 'user', content: 'Was sagt das Programm zu Windkraft?' },
  {
    role: 'assistant',
    content: 'Das Programm fordert massiven Ausbau [1].',
    citations: [
      {
        index: '1',
        document_id: 'doc-old',
        document_title: 'Wahlprogramm',
        cited_text: 'Windkraft massiv ausbauen',
        chunk_index: 4,
      },
    ],
  },
  { role: 'user', content: 'Und was heißt das für Bayern?' },
];

/** The messages the model actually received (via buildStream → streamForResolution). */
function modelMessages(): Array<{ role: string; content: string }> {
  const call = streamForResolution.mock.calls[0]?.[0] as
    { messages: Array<{ role: string; content: string }> } | undefined;
  return call?.messages ?? [];
}

/** The rerank window a tier asked for, from a clean slate each time. */
async function windowFor(mode?: NotebookDepth) {
  vi.clearAllMocks();
  setupMocks();
  await run(mode);
  const call = rerankNotebookResults.mock.calls[0][0] as { limit: number; inputLimit: number };
  return { limit: call.limit, inputLimit: call.inputLimit };
}

function setupMocks() {
  getSearchContext.mockResolvedValue(searchContextWith(40));
  rerankNotebookResults.mockImplementation(
    async ({ results, limit }: { results: unknown[]; limit: number }) => ({
      results: results.slice(0, limit),
      referencesMap: {},
      contextSummary: 'reranked summary',
      rerankTimeMs: 5,
    })
  );
  resolveModel.mockResolvedValue({
    provider: 'mistral',
    model: 'mistral-medium-2604',
    contextWindow: 262144,
  });
  // Drive buildStream so streamForResolution records the model messages.
  streamWithFallback.mockImplementation(
    async ({
      primary,
      buildStream,
    }: {
      primary: unknown;
      buildStream: (r: unknown) => Promise<string | null>;
    }) => {
      await buildStream(primary);
      return 'Eine Antwort mit Beleg [1].';
    }
  );
  streamForResolution.mockResolvedValue('Eine Antwort mit Beleg [1].');
  isProviderConfigured.mockReturnValue(true);
  expandQuery.mockResolvedValue({
    primary: 'Was steht zur sozialen Sicherung drin?',
    alternatives: ['Grundsicherung Positionen', 'Sozialstaat Reform'],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupMocks();
});

describe('handleNotebookStream — reranking per tier', () => {
  it.each(['fast', 'deep', 'ultra'] as const)('reranks in %s', async (mode) => {
    await run(mode);
    // Red before the fix: deep never called the reranker at all.
    expect(rerankNotebookResults).toHaveBeenCalledTimes(1);
  });

  it('keeps fast on its exact pre-tier window', async () => {
    // Grün-O-Mat runs on `fast` and is out of scope for the tier change, so
    // these two numbers are a promise, not a default.
    expect(await windowFor('fast')).toEqual({ inputLimit: 20, limit: 10 });
  });

  it('widens the ranked window with every tier', async () => {
    const fast = await windowFor('fast');
    const deep = await windowFor('deep');
    const ultra = await windowFor('ultra');

    expect(deep.limit).toBeGreaterThan(fast.limit);
    expect(ultra.limit).toBeGreaterThan(deep.limit);
    expect(deep.inputLimit).toBeGreaterThan(fast.inputLimit);
    expect(ultra.inputLimit).toBeGreaterThan(deep.inputLimit);
  });

  it('treats an omitted mode as the thorough tier, not the fast one', async () => {
    // What `isFast = mode === 'fast'` always did. Callers that never sent a
    // mode must not silently drop to the narrow window.
    const omitted = await windowFor(undefined);
    expect(omitted).toEqual(await windowFor('deep'));
    expect(omitted).not.toEqual(await windowFor('fast'));
  });

  it('keeps the concise prompt fast-only', async () => {
    await run('deep');
    const deepPrompt = streamWithFallback.mock.calls.length > 0;
    expect(deepPrompt).toBe(true);
    // Deep keeps whatever prompt getSearchContext chose; fast swaps in the
    // concise one to match its shrunken context.
    const ctxAfterDeep = getSearchContext.mock.results[0].value as Promise<{
      systemPrompt: string;
    }>;
    expect((await ctxAfterDeep).systemPrompt).toBe('ORIGINAL_SYSTEM_PROMPT');
  });

  it('searches one formulation without history', async () => {
    await run('deep');
    expect(expandQuery).not.toHaveBeenCalled();
    const { queries } = getSearchContext.mock.calls[0][0] as { queries: string[] };
    expect(queries).toEqual(['Was steht zur sozialen Sicherung drin?']);
  });

  it('unions several formulations in ultra and announces them', async () => {
    const sent = await run('ultra');
    expect(expandQuery).toHaveBeenCalledTimes(1);
    const { queries, depth } = getSearchContext.mock.calls[0][0] as {
      queries: string[];
      depth: string;
    };
    expect(queries).toHaveLength(3);
    expect(depth).toBe('ultra');
    // Silence during a 3× longer search reads as a hang, not as thoroughness.
    const progress = sent.find((e) => e.event === 'progress_step');
    expect(progress?.data.title).toContain('3');
  });

  it('falls back to the single query when expansion fails', async () => {
    // expandQuery swallows its own errors and returns no alternatives; ultra
    // must then behave like a wide single-query search, not break.
    expandQuery.mockResolvedValue({
      primary: 'Was steht zur sozialen Sicherung drin?',
      alternatives: [],
    });
    const sent = await run('ultra');
    const { queries } = getSearchContext.mock.calls[0][0] as { queries: string[] };
    expect(queries).toHaveLength(1);
    expect(sent.some((e) => e.event === 'completion')).toBe(true);
  });

  it('still answers when the reranker degrades to the original order', async () => {
    // Regolo unconfigured: the pipeline returns input order rather than throwing.
    rerankNotebookResults.mockImplementation(
      async ({ results, referencesMap }: { results: unknown[]; referencesMap: unknown }) => ({
        results,
        referencesMap,
        contextSummary: 'summary',
        rerankTimeMs: 0,
      })
    );
    const sent = await run('deep');
    expect(sent.some((e) => e.event === 'completion')).toBe(true);
  });
});

describe('handleNotebookStream — conversation history (ultra only)', () => {
  it('hands the history to the model in ultra, between system prompt and question', async () => {
    await run('ultra', HISTORY_MESSAGES);
    const msgs = modelMessages();
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(msgs[1].content).toBe('Was sagt das Programm zu Windkraft?');
    // The final user message carries the CURRENT question plus sources.
    expect(msgs[3].content).toContain('Und was heißt das für Bayern?');
  });

  it.each(['fast', 'deep'] as const)('drops incoming history explicitly in %s', async (mode) => {
    // The chat-mode client has always sent the full thread to this endpoint;
    // below ultra it must be ignored, not spread unbudgeted into the prompt.
    await run(mode, HISTORY_MESSAGES);
    const msgs = modelMessages();
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user']);
  });

  it('rewrites old citation markers to the merged numbering and appends the carried source', async () => {
    await run('ultra', HISTORY_MESSAGES);
    const msgs = modelMessages();
    const oldAnswer = msgs[2].content;
    // referencesMap of the reranked context is empty in this harness, so the
    // carried source becomes id 1 — the old [1] happens to map onto it; what
    // matters is that the marker went through the mapping, not verbatim.
    expect(oldAnswer).toContain('[1]');
    // The carried passage is offered as a citable source in the prompt.
    expect(msgs[3].content).toContain('aus früherer Antwort');
    expect(msgs[3].content).toContain('Wahlprogramm');
  });

  it('passes the conversation to the query rewrite in ultra', async () => {
    await run('ultra', HISTORY_MESSAGES);
    const [query, opts] = expandQuery.mock.calls[0] as [string, { historyContext?: string }];
    expect(query).toBe('Und was heißt das für Bayern?');
    expect(opts.historyContext).toContain('Was sagt das Programm zu Windkraft?');
  });

  it('sends no history context to the query rewrite on a first question', async () => {
    await run('ultra');
    const [, opts] = expandQuery.mock.calls[0] as [string, { historyContext?: string }];
    expect(opts.historyContext).toBeUndefined();
  });
});

describe('query rewrite in deep', () => {
  it('rewrites a follow-up against the history without feeding history to the model', async () => {
    vi.clearAllMocks();
    setupMocks();
    expandQuery.mockResolvedValue({ primary: 'Hitzeschutz Bayern', alternatives: [] });
    await run('deep', HISTORY_MESSAGES);
    expect(expandQuery).toHaveBeenCalledTimes(1);
    expect((expandQuery.mock.calls[0][1] as { historyContext?: string }).historyContext).toContain(
      'Windkraft'
    );
    const ctx = getSearchContext.mock.calls[0][0] as { queries: string[] };
    expect(ctx.queries).toEqual(['Hitzeschutz Bayern']);
    expect(modelMessages().filter((m) => m.role === 'assistant')).toHaveLength(0);
  });

  it('does not call the rewriter without history', async () => {
    vi.clearAllMocks();
    setupMocks();
    await run('deep');
    expect(expandQuery).not.toHaveBeenCalled();
  });
});

describe('citation validation', () => {
  it('warns when the model cites an id that is not in the reference map', async () => {
    vi.clearAllMocks();
    setupMocks();
    getSearchContext.mockResolvedValue({
      ...searchContextWith(4),
      referencesMap: {
        '1': {
          title: 'Doc 1',
          snippets: [['Text 1']],
          description: null,
          date: null,
          source: 's',
          document_id: 'd1',
          source_url: null,
          filename: null,
          similarity_score: 0.9,
          chunk_index: 0,
          page_number: null,
        },
      },
    });
    rerankNotebookResults.mockImplementation(async ({ results, referencesMap }) => ({
      results,
      referencesMap,
      contextSummary: 'x',
      rerankTimeMs: 1,
    }));
    streamWithFallback.mockResolvedValue('Aussage.[1] Andere Aussage.[9]');
    const sent = await run('deep');
    const warning = sent.find((e) => e.event === 'warning');
    expect(warning?.data.code).toBe('citation_invalid');
    const completion = sent.find((e) => e.event === 'completion');
    expect(completion?.data.answer).toContain('[cite:1]');
    expect(completion?.data.answer).toContain('[9]');
  });
});

describe('weak evidence warning', () => {
  it('warns when the best reranker score is under the threshold', async () => {
    vi.clearAllMocks();
    setupMocks();
    rerankNotebookResults.mockImplementation(async ({ results }) => ({
      results,
      referencesMap: {},
      contextSummary: 'x',
      rerankTimeMs: 1,
      topRelevance: 0.04,
    }));
    const sent = await run('deep');
    expect(sent.find((e) => e.event === 'warning')?.data.code).toBe('evidence_weak');
  });

  it('stays quiet when rerank was skipped', async () => {
    vi.clearAllMocks();
    setupMocks();
    rerankNotebookResults.mockImplementation(async ({ results }) => ({
      results,
      referencesMap: {},
      contextSummary: 'x',
      rerankTimeMs: 1,
      topRelevance: null,
    }));
    const sent = await run('deep');
    expect(sent.some((e) => e.event === 'warning' && e.data.code === 'evidence_weak')).toBe(false);
  });
});

describe('trace id', () => {
  it('puts the langfuse trace id into the completion metadata and the result', async () => {
    vi.clearAllMocks();
    setupMocks();
    const sent = await run('deep');
    const completion = sent.find((e) => e.event === 'completion');
    expect((completion?.data.metadata as { traceId?: string }).traceId).toBe('a'.repeat(32));
  });
});

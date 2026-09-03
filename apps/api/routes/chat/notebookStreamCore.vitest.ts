/**
 * Notebook stream core — retrieval per depth tier.
 *
 * Two things are pinned here. First, every tier reranks (when asked to): that
 * used to be gated on `isFast`, so "Tiefenrecherche" — the path that retrieves
 * the MOST candidates — was the only one handing the model the raw
 * hybrid-search order. Second, `fast` keeps its exact pre-tier numbers,
 * because the public Grün-O-Mat surface runs on it and is not part of the
 * tier change. Since 2026-09-03 the reranker itself is opt-in
 * (`rerank: { mode: 'sort' | 'filter' }`) — the default cuts to
 * `profile.rerankOutput` in retrieval order instead (see the `rerank option`
 * describe block). The other describe blocks below pass `mode: 'sort'`
 * explicitly through the shared `run()` helper so they keep exercising the
 * reranker mechanics they were written to pin.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

import { type NotebookDepth } from '@gruenerator/contracts';

const getSearchContext = vi.fn();
const rerankNotebookResults = vi.fn();
const resolveModel = vi.fn();
const streamWithFallback = vi.fn();
const streamForResolution = vi.fn();
const isProviderConfigured = vi.fn(() => true);
const expandQuery = vi.fn();
const logInfo = vi.fn();

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({
    info: (...args: unknown[]) => logInfo(...args),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock('../../services/notebook/index.js', () => ({
  notebookQAService: {
    getSearchContext: (...args: unknown[]) => getSearchContext(...args),
  },
}));
vi.mock('../../services/notebook/rerankNotebookResults.js', async () => {
  // `cutNotebookResults` stays real: it is a pure function, and mocking it
  // would just re-implement it a second time in this file.
  const actual = await vi.importActual<
    typeof import('../../services/notebook/rerankNotebookResults.js')
  >('../../services/notebook/rerankNotebookResults.js');
  return {
    ...actual,
    rerankNotebookResults: (...args: unknown[]) => rerankNotebookResults(...args),
  };
});
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

// `rerank: { mode: 'sort' }`: the default is now to cut instead of rerank
// (see the `rerank option` describe block below), so the tests in this file
// that pin per-tier reranking behaviour opt back into the reranker
// explicitly, exactly as `mode: 'sort'` lets a caller do in production.
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
    rerank: { mode: 'sort' },
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

describe('handleNotebookStream — rerank option', () => {
  async function runWithRerank(rerank?: { mode?: 'off' | 'sort' | 'filter'; instruct?: string }) {
    const { req, res, sse, sent } = makeReqRes();
    await handleNotebookStream({
      req,
      res,
      sse,
      messages: [{ role: 'user', content: 'Was steht zur sozialen Sicherung drin?' }] as Parameters<
        typeof handleNotebookStream
      >[0]['messages'],
      collectionId: 'grundsatz-system',
      mode: 'deep',
      ...(rerank && { rerank }),
      closeStream: false,
    });
    return sent;
  }

  it("mode: 'off' never calls rerankNotebookResults and cuts to the tier's rerankOutput", async () => {
    const sent = await runWithRerank({ mode: 'off' });
    expect(rerankNotebookResults).not.toHaveBeenCalled();
    // 'deep' has rerankOutput 18 against the 40-result fixture.
    const completion = sent.find((e) => e.event === 'completion');
    expect((completion?.data.metadata as { totalResults?: number })?.totalResults).toBe(18);
  });

  it("mode: 'filter' with instruct reaches rerankNotebookResults", async () => {
    await runWithRerank({ mode: 'filter', instruct: 'Bevorzuge amtliche Quellen' });
    expect(rerankNotebookResults).toHaveBeenCalledTimes(1);
    const call = rerankNotebookResults.mock.calls[0][0] as {
      mode?: string;
      instruct?: string;
    };
    expect(call.mode).toBe('filter');
    expect(call.instruct).toBe('Bevorzuge amtliche Quellen');
  });

  it("mode: 'sort' reaches rerankNotebookResults without instruct", async () => {
    await runWithRerank({ mode: 'sort' });
    expect(rerankNotebookResults).toHaveBeenCalledTimes(1);
    const call = rerankNotebookResults.mock.calls[0][0] as Record<string, unknown>;
    expect(call.mode).toBe('sort');
    expect(call).not.toHaveProperty('instruct');
  });

  it('an absent rerank option never calls rerankNotebookResults and cuts to rerankOutput, renumbering references', async () => {
    // Real referencesMap (not the `{}` default fixture) so the renumbering
    // `cutNotebookResults` does is actually exercised: 40 index-keyed entries
    // in, 18 kept and renumbered 1..18.
    getSearchContext.mockResolvedValue({
      ...searchContextWith(40),
      sortedResults: Array.from({ length: 40 }, (_, i) => ({
        title: `Doc ${i}`,
        snippet: `Inhalt ${i}`,
        similarity: 1 - i / 100,
        document_id: `doc-${i}`,
        chunk_index: 0,
      })),
      referencesMap: Object.fromEntries(
        Array.from({ length: 40 }, (_, i) => [
          String(i + 1),
          {
            title: `Doc ${i}`,
            snippets: [[`Inhalt ${i}`]],
            description: null,
            date: null,
            source: 's',
            document_id: `doc-${i}`,
            source_url: null,
            filename: null,
            similarity_score: 1 - i / 100,
            chunk_index: 0,
            page_number: null,
          },
        ])
      ),
    });

    const sent = await runWithRerank(undefined);
    expect(rerankNotebookResults).not.toHaveBeenCalled();
    const completion = sent.find((e) => e.event === 'completion');
    expect((completion?.data.metadata as { totalResults?: number })?.totalResults).toBe(18);
    // The model's [1] still resolves after the cut+renumber, to the first
    // retrieval-order result — not to whatever the un-renumbered map had at key 1.
    const citations = completion?.data.citations as { document_id: string }[];
    expect(citations[0]?.document_id).toBe('doc-0');
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

  it('does not call the rewriter in fast, even with history (Grün-O-Mat cost guard)', async () => {
    // `fast` has `queryRewrite: false` — history in the request must not
    // trigger a rewrite call regardless.
    vi.clearAllMocks();
    setupMocks();
    await run('fast', HISTORY_MESSAGES);
    expect(expandQuery).not.toHaveBeenCalled();
  });

  it('reranks against the rewritten query, not the raw follow-up', async () => {
    // Red before the fix: the reranker's cross-encoder read "Und was heißt
    // das für Bayern?" while the 40 candidates were retrieved for the
    // rewritten "Hitzeschutz Bayern".
    vi.clearAllMocks();
    setupMocks();
    expandQuery.mockResolvedValue({ primary: 'Hitzeschutz Bayern', alternatives: [] });
    await run('deep', HISTORY_MESSAGES);
    const rerankCall = rerankNotebookResults.mock.calls[0][0] as { question: string };
    expect(rerankCall.question).toBe('Hitzeschutz Bayern');
  });

  it('reranks against the raw question when there is no history to rewrite from', async () => {
    vi.clearAllMocks();
    setupMocks();
    await run('deep');
    const rerankCall = rerankNotebookResults.mock.calls[0][0] as { question: string };
    expect(rerankCall.question).toBe('Was steht zur sozialen Sicherung drin?');
  });

  it('never asks the rewriter for alternatives it would immediately discard', async () => {
    // deep keeps exactly one query (queryVariants: 1), so the alternatives a
    // full condense call would produce are pure spend.
    vi.clearAllMocks();
    setupMocks();
    expandQuery.mockResolvedValue({ primary: 'Hitzeschutz Bayern', alternatives: [] });
    await run('deep', HISTORY_MESSAGES);
    const opts = expandQuery.mock.calls[0][1] as { variants?: number };
    expect(opts.variants).toBe(0);
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

describe('trace id', () => {
  it('puts the langfuse trace id into the completion metadata and the result', async () => {
    vi.clearAllMocks();
    setupMocks();
    const sent = await run('deep');
    const completion = sent.find((e) => e.event === 'completion');
    expect((completion?.data.metadata as { traceId?: string }).traceId).toBe('a'.repeat(32));
  });
});

describe('handleNotebookStream — evidence_weak', () => {
  const KNOBS = ['NOTEBOOK_EVIDENCE_WEAK_ENABLED', 'NOTEBOOK_EVIDENCE_WEAK_THRESHOLD'] as const;
  let env: Record<(typeof KNOBS)[number], boolean | number>;
  let original: { enabled: boolean; threshold: number };

  beforeAll(async () => {
    // KEIN vi.mock: `env` ist `parsed.data`, ein gewöhnliches Objekt. Es zu
    // mocken hiesse, jedem anderen Modul in diesem Graphen seine env-Felder
    // wegzunehmen; punktuell mutieren tut das nicht.
    ({ env } = (await import('../../config/env.js')) as unknown as {
      env: Record<(typeof KNOBS)[number], boolean | number>;
    });
    original = {
      enabled: env.NOTEBOOK_EVIDENCE_WEAK_ENABLED as boolean,
      threshold: env.NOTEBOOK_EVIDENCE_WEAK_THRESHOLD as number,
    };
  });

  afterEach(() => {
    env.NOTEBOOK_EVIDENCE_WEAK_ENABLED = original.enabled;
    env.NOTEBOOK_EVIDENCE_WEAK_THRESHOLD = original.threshold;
  });

  /** Ein Suchkontext mit gesetztem Evidenz-Spitzenwert. */
  function contextWithEvidence(evidenceTop: number | null) {
    return { ...searchContextWith(40), evidenceTop };
  }

  function evidenceWarnings(sent: { event: string; data: Record<string, unknown> }[]) {
    return sent.filter((e) => e.event === 'warning' && e.data.code === 'evidence_weak');
  }

  it('meldet unter der Schwelle, wenn der Schalter an ist', async () => {
    env.NOTEBOOK_EVIDENCE_WEAK_ENABLED = true;
    env.NOTEBOOK_EVIDENCE_WEAK_THRESHOLD = 0.89;
    getSearchContext.mockResolvedValue(contextWithEvidence(0.8713));

    const warnings = evidenceWarnings(await run('deep'));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].data.message).toBe(
      'Zu dieser Frage habe ich im Notebook wenig Passendes gefunden — bitte die angegebenen Quellen prüfen.'
    );
  });

  it('schweigt bei ausgeschaltetem Schalter — der Dunkelbetrieb ist die Bauform', async () => {
    env.NOTEBOOK_EVIDENCE_WEAK_ENABLED = false;
    env.NOTEBOOK_EVIDENCE_WEAK_THRESHOLD = 0.89;
    getSearchContext.mockResolvedValue(contextWithEvidence(0.8713));

    expect(evidenceWarnings(await run('deep'))).toHaveLength(0);
  });

  it('schweigt über der Schwelle', async () => {
    env.NOTEBOOK_EVIDENCE_WEAK_ENABLED = true;
    env.NOTEBOOK_EVIDENCE_WEAK_THRESHOLD = 0.89;
    getSearchContext.mockResolvedValue(contextWithEvidence(0.9803));

    expect(evidenceWarnings(await run('deep'))).toHaveLength(0);
  });

  it('schweigt für den Grün-O-Mat, auch bei angeschaltetem Schalter', async () => {
    env.NOTEBOOK_EVIDENCE_WEAK_ENABLED = true;
    env.NOTEBOOK_EVIDENCE_WEAK_THRESHOLD = 0.89;
    getSearchContext.mockResolvedValue(contextWithEvidence(0.8713));

    const { req, res, sse, sent } = makeReqRes();
    await handleNotebookStream({
      req,
      res,
      sse,
      messages: [{ role: 'user', content: 'Was steht zur sozialen Sicherung drin?' }] as Parameters<
        typeof handleNotebookStream
      >[0]['messages'],
      collectionId: 'grundsatz-system',
      mode: 'fast',
      emitEvidenceWarning: false,
      closeStream: false,
    });

    expect(evidenceWarnings(sent)).toHaveLength(0);
  });

  it('liest den Wert VOR dem Rerank — die Regression aus #3140', async () => {
    // Der Rerank drückt jeden Treffer auf 0,05. Läse das Gitter die Liste NACH
    // dem Rerank, schlüge es hier Alarm. Genau dieser Griff auf den falschen
    // Wert war der Fehler des geparkten Anlaufs.
    env.NOTEBOOK_EVIDENCE_WEAK_ENABLED = true;
    env.NOTEBOOK_EVIDENCE_WEAK_THRESHOLD = 0.89;
    getSearchContext.mockResolvedValue(contextWithEvidence(0.9803));
    rerankNotebookResults.mockImplementation(
      async ({ results, limit }: { results: { title: string }[]; limit: number }) => ({
        results: results.slice(0, limit).map((r) => ({ ...r, similarity: 0.05 })),
        referencesMap: {},
        contextSummary: 'reranked summary',
        rerankTimeMs: 5,
      })
    );

    expect(evidenceWarnings(await run('deep'))).toHaveLength(0);
  });

  it('schweigt, wenn das Qualitäts-Gate die Antwort schon verweigert hat', async () => {
    // minResultsForGeneration greift NACH dem Rerank; die Warnung darf einer
    // verweigerten Antwort nie anhängen (F2).
    env.NOTEBOOK_EVIDENCE_WEAK_ENABLED = true;
    env.NOTEBOOK_EVIDENCE_WEAK_THRESHOLD = 0.89;
    getSearchContext.mockResolvedValue(contextWithEvidence(0.8713));
    rerankNotebookResults.mockImplementation(async () => ({
      results: [],
      referencesMap: {},
      contextSummary: 'summary',
      rerankTimeMs: 1,
    }));

    const { req, res, sse, sent } = makeReqRes();
    await handleNotebookStream({
      req,
      res,
      sse,
      messages: [{ role: 'user', content: 'Was steht zur sozialen Sicherung drin?' }] as Parameters<
        typeof handleNotebookStream
      >[0]['messages'],
      collectionId: 'grundsatz-system',
      mode: 'deep',
      minResultsForGeneration: 1,
      rerank: { mode: 'sort' },
      closeStream: false,
    });

    expect(evidenceWarnings(sent)).toHaveLength(0);
    const completion = sent.find((e) => e.event === 'completion');
    expect(
      (completion?.data.metadata as { qualityGateTriggered?: boolean })?.qualityGateTriggered
    ).toBe(true);
  });

  it('schweigt auf der Tiefe fast, protokolliert aber weiterhin', async () => {
    // Kalibriert wurde nur gegen `deep` — `fast` bekommt nie die Warnung,
    // auch nicht mit angeschaltetem Schalter und einem schwachen Wert (F5).
    env.NOTEBOOK_EVIDENCE_WEAK_ENABLED = true;
    env.NOTEBOOK_EVIDENCE_WEAK_THRESHOLD = 0.89;
    getSearchContext.mockResolvedValue(contextWithEvidence(0.8713));

    expect(evidenceWarnings(await run('fast'))).toHaveLength(0);
    expect(logInfo.mock.calls.some((args) => String(args[0]).includes('evidenceTop=0.8713'))).toBe(
      true
    );
  });

  it('protokolliert evidenceTop=none ohne Suchkontext und sendet keine Warnung', async () => {
    // Der schwächste Fall — nichts hat die Tiefenschwelle überlebt — darf in
    // der Produktionsmessung nicht stumm verschwinden (F3).
    env.NOTEBOOK_EVIDENCE_WEAK_ENABLED = true;
    env.NOTEBOOK_EVIDENCE_WEAK_THRESHOLD = 0.89;
    getSearchContext.mockResolvedValue(null);

    expect(evidenceWarnings(await run('deep'))).toHaveLength(0);
    expect(
      logInfo.mock.calls.some((args) =>
        String(args[0]).includes('evidenceTop=none (no candidates, deep)')
      )
    ).toBe(true);
  });
});

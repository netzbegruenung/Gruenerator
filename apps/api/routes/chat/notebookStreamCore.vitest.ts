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
  streamForResolution: vi.fn(),
}));
vi.mock('./agents/providers.js', () => ({
  isProviderConfigured: (...args: unknown[]) => isProviderConfigured(...args),
}));
vi.mock('../../services/telemetry/langfuseTelemetry.js', () => ({
  BOTH_LANES_FAILED: 'generation failed on both model lanes',
  buildAiTelemetry: () => undefined,
  // Mirrors the disabled-mode handle: no trace id, update() swallowed.
  withLangfuseTrace: async (_o: unknown, fn: (t: unknown) => Promise<unknown>) =>
    fn({ traceId: undefined, update: () => {} }),
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
vi.mock('../../utils/getAIWorkerPool.js', () => ({
  getAIWorkerPool: () => ({ processRequest: vi.fn() }),
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

async function run(mode?: NotebookDepth) {
  const { req, res, sse, sent } = makeReqRes();
  await handleNotebookStream({
    req,
    res,
    sse,
    messages: [{ role: 'user', content: 'Was steht zur sozialen Sicherung drin?' }],
    collectionId: 'grundsatz-system',
    ...(mode && { mode }),
    closeStream: false,
  });
  return sent;
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
  resolveModel.mockResolvedValue({ provider: 'mistral', model: 'mistral-medium-2604' });
  streamWithFallback.mockResolvedValue('Eine Antwort mit Beleg [1].');
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

  it('searches one formulation below ultra', async () => {
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

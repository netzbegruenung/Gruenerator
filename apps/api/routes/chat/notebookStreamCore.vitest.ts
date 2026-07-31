/**
 * Notebook stream core — retrieval reranking per mode.
 *
 * The load-bearing case is `deep`. Reranking used to be gated on `isFast`, so
 * "Tiefenrecherche" — the path that retrieves the MOST candidates — was the
 * only one handing the model the raw hybrid-search order. These tests pin that
 * both modes rerank, and that they keep different window sizes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSearchContext = vi.fn();
const rerankNotebookResults = vi.fn();
const resolveModel = vi.fn();
const streamWithFallback = vi.fn();
const isProviderConfigured = vi.fn(() => true);

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

async function run(mode: 'fast' | 'deep') {
  const { req, res, sse, sent } = makeReqRes();
  await handleNotebookStream({
    req,
    res,
    sse,
    messages: [{ role: 'user', content: 'Was steht zur sozialen Sicherung drin?' }],
    collectionId: 'grundsatz-system',
    mode,
    closeStream: false,
  });
  return sent;
}

beforeEach(() => {
  vi.clearAllMocks();
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
});

describe('handleNotebookStream — reranking per mode', () => {
  it('reranks in deep mode', async () => {
    await run('deep');
    // Red before the fix: deep never called the reranker at all.
    expect(rerankNotebookResults).toHaveBeenCalledTimes(1);
  });

  it('reranks in fast mode', async () => {
    await run('fast');
    expect(rerankNotebookResults).toHaveBeenCalledTimes(1);
  });

  it('gives deep a wider ranked window than fast', async () => {
    await run('deep');
    const deep = rerankNotebookResults.mock.calls[0][0];
    vi.clearAllMocks();
    getSearchContext.mockResolvedValue(searchContextWith(40));
    rerankNotebookResults.mockResolvedValue({
      results: [],
      referencesMap: {},
      contextSummary: 's',
      rerankTimeMs: 1,
    });
    resolveModel.mockResolvedValue({ provider: 'mistral', model: 'm' });
    streamWithFallback.mockResolvedValue('Antwort');
    isProviderConfigured.mockReturnValue(true);

    await run('fast');
    const fast = rerankNotebookResults.mock.calls[0][0];

    // Deep legitimately wants more context — but ranked, not raw.
    expect(deep.limit).toBeGreaterThan(fast.limit);
    expect(deep.inputLimit).toBeGreaterThan(fast.inputLimit);
    // Deep must actually see the candidates it retrieved (30-40), not 20.
    expect(deep.inputLimit).toBeGreaterThanOrEqual(40);
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

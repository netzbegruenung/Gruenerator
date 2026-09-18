import { describe, it, expect, vi, beforeEach } from 'vitest';

import { type ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';

/**
 * The deep-research cascade is the most expensive path in the single-pass
 * branch: two engines, one booking out of the shared budget, and each of them
 * replaces BOTH halves of the turn. What is asserted here is the ORDER and the skipping —
 * a regression makes the turn either pay twice or rerank a finished answer's
 * citations into the wrong order.
 */

const runDeepAgentTurn = vi.fn<(o: unknown) => Promise<unknown>>();
const runDeepResearchTurn = vi.fn<(o: unknown) => Promise<unknown>>();
vi.mock('../deepAgentTurn.js', () => ({
  runDeepAgentTurn: (o: unknown): Promise<unknown> => runDeepAgentTurn(o),
}));
vi.mock('../deepResearchTurn.js', () => ({
  runDeepResearchTurn: (o: unknown): Promise<unknown> => runDeepResearchTurn(o),
}));

const reserveDeepResearch = vi.fn<(userId: string) => Promise<{ ok: boolean; reason?: string }>>();
const releaseDeepResearch = vi.fn<(userId: string) => Promise<void>>();
vi.mock('../deepResearchQuota.js', () => ({
  reserveDeepResearch: (userId: string) => reserveDeepResearch(userId),
  releaseDeepResearch: (userId: string) => releaseDeepResearch(userId),
  deepResearchQuotaSpentMessage: (r: { reason: string }) => `Budget (${r.reason}) aufgebraucht`,
}));

const searchNode = vi.fn(async (_state: ChatGraphState) => ({
  searchResults: [{ source: 'web', title: 'Treffer', content: 'x', url: 'https://a.test/1' }],
  citations: [],
  searchCount: 1,
  searchTimeMs: 1,
}));
const briefGeneratorNode = vi.fn(async (_state: ChatGraphState): Promise<unknown> => ({}));
vi.mock('../../../../agents/langgraph/ChatGraph/index.js', async () => ({
  briefGeneratorNode: (s: ChatGraphState) => briefGeneratorNode(s),
  // Die ECHTE Fassung des Prädikats, gezielt aus seinem Knoten geholt — keine
  // Kopie (die wäre die dritte, die dieser Umbau beseitigt hat) und kein
  // `false`-Stummel: die #2856-Regressionstests unten brauchen das echte Gate
  // (moderate/complex ∧ research), sonst liefe der Brief-Pfad nie.
  wantsResearchBrief: (
    await vi.importActual<
      typeof import('../../../../agents/langgraph/ChatGraph/nodes/briefGeneratorNode.js')
    >('../../../../agents/langgraph/ChatGraph/nodes/briefGeneratorNode.js')
  ).wantsResearchBrief,
  searchNode: (s: ChatGraphState) => searchNode(s),
  rerankNode: vi.fn(async () => ({})),
  imageNode: vi.fn(),
  imageEditNode: vi.fn(),
  summarizeNode: vi.fn(),
  computeNode: vi.fn(),
  buildCitations: vi.fn(() => []),
}));

// Hits Postgres otherwise. Defaults to null (no reuse); the reuse test
// below overrides it for one case.
const getKeptResearchForRetry = vi.fn(async (): Promise<unknown> => null);
vi.mock('../threadPersistenceService.js', () => ({
  getKeptResearchForRetry: (threadId: string, query: string) =>
    getKeptResearchForRetry(threadId, query),
}));

const { runSearchBranch } = await import('./searchBranch.js');

const sse = { send: vi.fn(), isEnded: () => false };

const state = (over: Partial<ChatGraphState> = {}): ChatGraphState =>
  ({
    intent: 'research',
    searchQuery: 'Windkraft Ausbau',
    searchResults: [],
    citations: [],
    messages: [{ role: 'user', content: 'Recherchiere den Ausbau' }],
    complexity: 'simple',
    threadId: null,
    agentConfig: { identifier: 'gruenerator-universal', userId: 'u1' },
    ...over,
  }) as unknown as ChatGraphState;

const run = (over: Partial<ChatGraphState> = {}, enabledTools?: Record<string, boolean>) =>
  runSearchBranch({
    state: state(over),
    currentIntent: 'research',
    sse: sse as never,
    forcedTool: false,
    ...(enabledTools ? { enabledTools } : {}),
    priorIntentResults: [],
  });

beforeEach(() => {
  runDeepAgentTurn.mockReset();
  runDeepResearchTurn.mockReset();
  reserveDeepResearch.mockReset().mockResolvedValue({ ok: true });
  releaseDeepResearch.mockReset().mockResolvedValue(undefined);
  searchNode.mockClear();
  briefGeneratorNode.mockClear();
  briefGeneratorNode.mockResolvedValue({});
  getKeptResearchForRetry.mockClear();
  getKeptResearchForRetry.mockResolvedValue(null);
  sse.send.mockClear();
});

describe('runSearchBranch — deep-research cascade', () => {
  it('takes the agent first and skips both the dossier and the search when it serves', async () => {
    runDeepAgentTurn.mockResolvedValue({ deepResearchAnswer: 'Kurzfassung' });

    const result = await run({ deepResearchRequested: true });

    expect(runDeepResearchTurn).not.toHaveBeenCalled();
    expect(searchNode).not.toHaveBeenCalled();
    expect(result.servedWholeTurn).toBe(true);
    expect(result.state.deepResearchAnswer).toBe('Kurzfassung');
  });

  it('falls through to the dossier when the agent did not serve', async () => {
    runDeepAgentTurn.mockResolvedValue(null);
    runDeepResearchTurn.mockResolvedValue({
      searchResults: [{ source: 'web', title: 'Dossier-Quelle', content: 'y', url: 'https://d/1' }],
    });

    const result = await run({ deepResearchRequested: true });

    expect(runDeepAgentTurn).toHaveBeenCalledTimes(1);
    expect(runDeepResearchTurn).toHaveBeenCalledTimes(1);
    expect(searchNode).not.toHaveBeenCalled();
    expect(result.servedWholeTurn).toBe(true);
    expect(sse.send.mock.calls.some(([type]) => type === 'search_complete')).toBe(true);
  });

  it('keeps the booking when an engine delivered', async () => {
    runDeepAgentTurn.mockResolvedValue(null);
    runDeepResearchTurn.mockResolvedValue({ searchResults: [] });

    await run({ deepResearchRequested: true });

    expect(reserveDeepResearch).toHaveBeenCalledTimes(1);
    expect(releaseDeepResearch).not.toHaveBeenCalled();
  });

  /**
   * The booking is made before either engine runs, so a turn where neither
   * delivered would otherwise charge a Baum for the ordinary search the user
   * ends up with.
   */
  it('hands the booking back when both engines return null', async () => {
    runDeepAgentTurn.mockResolvedValue(null);
    runDeepResearchTurn.mockResolvedValue(null);

    await run({ deepResearchRequested: true });

    expect(releaseDeepResearch).toHaveBeenCalledWith('u1');
    expect(searchNode).toHaveBeenCalledTimes(1);
  });

  /**
   * Both engines cost the same one Baum. A refused booking is therefore
   * refused for both — calling the second would buy a doomed request and a
   * second warning naming a different number.
   */
  it('books once and skips BOTH engines when the budget refuses', async () => {
    reserveDeepResearch.mockResolvedValue({ ok: false, reason: 'exceeded' });

    const result = await run({ deepResearchRequested: true });

    expect(reserveDeepResearch).toHaveBeenCalledTimes(1);
    expect(runDeepAgentTurn).not.toHaveBeenCalled();
    expect(runDeepResearchTurn).not.toHaveBeenCalled();
    expect(releaseDeepResearch).not.toHaveBeenCalled();
    expect(searchNode).toHaveBeenCalledTimes(1);
    expect(result.servedWholeTurn).toBe(false);
  });

  /**
   * No userId means no meter. Booking would fail closed and report "not
   * billable" as "budget spent".
   */
  it('does not book without a userId', async () => {
    runDeepAgentTurn.mockResolvedValue(null);
    runDeepResearchTurn.mockResolvedValue(null);

    await run({ deepResearchRequested: true, agentConfig: { identifier: 'x' } } as never);

    expect(reserveDeepResearch).not.toHaveBeenCalled();
    expect(releaseDeepResearch).not.toHaveBeenCalled();
    expect(runDeepAgentTurn).toHaveBeenCalledTimes(1);
  });

  it('leaves both engines and the budget alone when the turn never asked for deep research', async () => {
    const result = await run();

    expect(reserveDeepResearch).not.toHaveBeenCalled();

    expect(runDeepAgentTurn).not.toHaveBeenCalled();
    expect(runDeepResearchTurn).not.toHaveBeenCalled();
    expect(searchNode).toHaveBeenCalledTimes(1);
    expect(result.servedWholeTurn).toBe(false);
  });

  it('does nothing at all when the tool is disabled for this turn', async () => {
    const result = await run({ deepResearchRequested: true }, { research: false });

    expect(runDeepAgentTurn).not.toHaveBeenCalled();
    expect(searchNode).not.toHaveBeenCalled();
    expect(sse.send).not.toHaveBeenCalled();
    expect(result.servedWholeTurn).toBe(false);
  });
});

describe('runSearchBranch — intent follows the loop, not the primary verdict', () => {
  /**
   * Regression for #2856: on a secondary research iteration the state still
   * carries the classifier's PRIMARY intent. The brief gate fired on
   * currentIntent, but the node got the primary state and skipped silently
   * (progress ping without a brief) — and the rebuild after it dropped the
   * `intent: currentIntent` override, so searchNode switched on the primary
   * branch again: the documented double-Linkup-search live bug.
   */
  it('generates the brief on a secondary research iteration and hands its result to the search', async () => {
    briefGeneratorNode.mockResolvedValue({ researchBrief: 'Auftrag' });

    await runSearchBranch({
      state: state({ intent: 'web', complexity: 'moderate' } as Partial<ChatGraphState>),
      currentIntent: 'research',
      sse: sse as never,
      forcedTool: false,
      priorIntentResults: [],
    });

    expect(briefGeneratorNode).toHaveBeenCalledTimes(1);
    expect(briefGeneratorNode.mock.calls[0]?.[0]?.intent).toBe('research');
    expect(searchNode).toHaveBeenCalledTimes(1);
    expect(searchNode.mock.calls[0]?.[0]?.intent).toBe('research');
    expect(searchNode.mock.calls[0]?.[0]?.researchBrief).toBe('Auftrag');
  });

  /**
   * The reused branch rebuilds searchInputState the same way the brief path
   * did — from finalState, dropping the override. searchNode is skipped here
   * by design, so the observable signal is the RETURNED state: it feeds the
   * synthesis half of the turn and must carry the loop intent.
   */
  it('keeps the loop intent when reusing kept research sources', async () => {
    getKeptResearchForRetry.mockResolvedValue({
      searchResults: [{ source: 'web', title: 'Behalten', content: 'k', url: 'https://kept/1' }],
    });

    const result = await runSearchBranch({
      state: state({ intent: 'web', threadId: 't1' } as Partial<ChatGraphState>),
      currentIntent: 'research',
      sse: sse as never,
      forcedTool: false,
      priorIntentResults: [],
    });

    expect(searchNode).not.toHaveBeenCalled();
    expect(briefGeneratorNode).not.toHaveBeenCalled();
    expect(result.state.intent).toBe('research');
    expect(result.state.searchResults.map((r) => r.url)).toEqual(['https://kept/1']);
  });

  it('keeps the loop intent for the search even on a primary research turn with a brief', async () => {
    await runSearchBranch({
      state: state({ complexity: 'complex' } as Partial<ChatGraphState>),
      currentIntent: 'research',
      sse: sse as never,
      forcedTool: false,
      priorIntentResults: [],
    });

    expect(briefGeneratorNode).toHaveBeenCalledTimes(1);
    expect(searchNode.mock.calls[0]?.[0]?.intent).toBe('research');
  });
});

describe('runSearchBranch — source union', () => {
  /**
   * searchNode REPLACES `searchResults`, so a second loop iteration would drop
   * the first one's sources. The union keeps them, this iteration's first.
   */
  it('unions this iteration onto the prior one and dedupes by url', async () => {
    const result = await runSearchBranch({
      state: state(),
      currentIntent: 'web',
      sse: sse as never,
      forcedTool: false,
      priorIntentResults: [
        { source: 'web', title: 'Früher', content: 'z', url: 'https://b.test/2' },
        { source: 'web', title: 'Doppelt', content: 'x', url: 'https://a.test/1' },
      ],
    });

    expect(result.state.searchResults.map((r) => r.url)).toEqual([
      'https://a.test/1',
      'https://b.test/2',
    ]);
  });
});

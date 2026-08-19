import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  type ChatGraphState,
  type SearchResult,
} from '../../../agents/langgraph/ChatGraph/types.js';

/**
 * The intent loop runs primary + secondary. `searchNode` switches on
 * `state.intent`, and the state threaded through the loop used to keep the
 * PRIMARY verdict for both iterations — so a `web → scrape_url` turn issued the
 * same paid Linkup search twice and never crawled the pasted page.
 */

/** Set to make the scrape branch come back empty (robots.txt, zero hits). */
let scrapeReturnsNothing = false;

const searchNode = vi.fn(async (state: ChatGraphState) => {
  if (state.intent === 'scrape_url' && scrapeReturnsNothing) {
    return { searchResults: [], citations: [], searchCount: 1, searchTimeMs: 1 };
  }
  const result: SearchResult =
    state.intent === 'scrape_url'
      ? { source: 'web', title: 'Gelesene Seite', content: 'Seiteninhalt', url: 'https://a.test/x' }
      : { source: 'web', title: 'Suchtreffer', content: 'Treffer', url: 'https://b.test/y' };
  return { searchResults: [result], citations: [], searchCount: 1, searchTimeMs: 1 };
});

vi.mock('../../../agents/langgraph/ChatGraph/index.js', () => ({
  briefGeneratorNode: vi.fn(),
  searchNode: (state: ChatGraphState) => searchNode(state),
  rerankNode: vi.fn(async () => ({})),
  imageNode: vi.fn(),
  imageEditNode: vi.fn(),
  summarizeNode: vi.fn(),
  computeNode: vi.fn(),
  buildCitations: vi.fn(() => []),
}));

// Not under test in the intent cases, and importing it pulls in the `deepagents`
// package (plus a LangChain graph build) for no benefit there.
const runDeepAgentTurn = vi.fn(async () => null);
vi.mock('./deepAgentTurn.js', () => ({ runDeepAgentTurn: () => runDeepAgentTurn() }));

// The `@deepresearch` engines and their shared allowance. Both are stubbed so
// the quota cases below can drive the VERDICT and watch what the caller does
// with it — that decision moved out of the engines and into this caller.
const runDeepResearchTurn = vi.fn(async () => null);
vi.mock('./deepResearchTurn.js', () => ({ runDeepResearchTurn: () => runDeepResearchTurn() }));

const checkDeepResearchQuota = vi.fn(async () => ({
  canResearch: true,
  count: 0,
  remaining: 3,
  limit: 3,
  resetIn: '5h 0m',
}));
vi.mock('./deepResearchQuota.js', () => ({
  checkDeepResearchQuota: (userId: string) => checkDeepResearchQuota(userId),
  deepResearchQuotaSpentMessage: (q: { limit: number; resetIn: string }) =>
    `aufgebraucht (${q.limit}× pro Tag, neu in ${q.resetIn})`,
}));

// The chat_history branch runs its OWN retrieval (not searchNode) and writes
// `searchResults` directly — that is exactly why the carry-over must not live
// inside the searchNode branch.
vi.mock('./pastChatRecallService.js', () => ({
  recallPastChats: vi.fn(async () => []),
  recallOfficeDocuments: vi.fn(async () => []),
  recallReels: vi.fn(async () => []),
  rerankRecall: vi.fn(async () => ({
    chats: [{ threadId: 't1', threadTitle: 'Früherer Chat', snippet: 'Alter Verlauf' }],
    officeDocs: [],
    reels: [],
  })),
  getThreadRecallContext: vi.fn(async () => null),
  formatPastChatsBlock: vi.fn(() => 'block'),
  formatOfficeDocsBlock: vi.fn(() => ''),
  formatReelsBlock: vi.fn(() => ''),
  getSpaceRecallScope: vi.fn(async () => null),
}));

const buildState = (over: Partial<ChatGraphState>): ChatGraphState =>
  ({
    intent: 'web',
    secondaryIntent: null,
    searchQuery: 'zusammenfassen',
    searchResults: [],
    citations: [],
    messages: [{ role: 'user', content: 'zusammenfassen https://a.test/x' }],
    complexity: 'simple',
    detectedUrls: [],
    agentConfig: { identifier: 'gruenerator-universal', userId: 'u1' },
    ...over,
  }) as unknown as ChatGraphState;

/**
 * Imported once at module level, not inside each test.
 *
 * `intentExecutionService` pulls in a large graph, and a dynamic import inside a
 * test body charges that one-time load to THAT test's 5 s timeout. Under CI load
 * the first test tipped over it (5016 ms observed) — and then took the next one
 * with it: the timed-out call kept running and its `searchNode` calls landed in
 * the following test, which asserts a call COUNT and saw three instead of one.
 * At module level the load happens before any timeout is running.
 */
const { executeIntentPipeline } = await import('./intentExecutionService.js');

// `isEnded` because sendChatWarning checks it before writing; a double without
// it throws where production would simply have emitted the warning.
const sse = { send: vi.fn(), isEnded: () => false };

beforeEach(() => {
  searchNode.mockClear();
  sse.send.mockClear();
  runDeepAgentTurn.mockClear();
  runDeepResearchTurn.mockClear();
  checkDeepResearchQuota.mockClear();
  scrapeReturnsNothing = false;
});

describe('executeIntentPipeline — intent follows the loop', () => {
  it('runs each intent in its OWN searchNode branch and unions the sources', async () => {
    const { finalState } = await executeIntentPipeline({
      classifiedState: buildState({
        intent: 'web',
        secondaryIntent: 'scrape_url',
        detectedUrls: ['https://a.test/x'],
      }),
      sse: sse as never,
      forcedTool: true,
      imageAttachments: [],
    });

    expect(searchNode.mock.calls.map(([s]) => s.intent)).toEqual(['web', 'scrape_url']);
    // Both branches' sources survive; the crawled page is not dropped by the
    // web hit, and the web hit is not dropped by the crawl.
    expect(finalState.searchResults.map((r) => r.url).sort()).toEqual([
      'https://a.test/x',
      'https://b.test/y',
    ]);
  });

  it('single-intent turns are unchanged — one call, one result set', async () => {
    const { finalState } = await executeIntentPipeline({
      classifiedState: buildState({ intent: 'scrape_url', detectedUrls: ['https://a.test/x'] }),
      sse: sse as never,
      forcedTool: true,
      imageAttachments: [],
    });

    expect(searchNode).toHaveBeenCalledTimes(1);
    expect(finalState.searchResults).toHaveLength(1);
    expect(finalState.searchResults[0]?.url).toBe('https://a.test/x');
  });

  it('a FAILED scrape does not wipe the sources the first branch found', async () => {
    // robots.txt-Verbot oder Null-Treffer: searchNode überschreibt
    // `searchResults` trotzdem mit [], also muss die Vereinigung auch dann
    // laufen, wenn der ZWEITE Zweig leer zurückkommt.
    scrapeReturnsNothing = true;
    const { finalState } = await executeIntentPipeline({
      classifiedState: buildState({
        intent: 'web',
        secondaryIntent: 'scrape_url',
        detectedUrls: ['https://a.test/x'],
      }),
      sse: sse as never,
      forcedTool: true,
      imageAttachments: [],
    });

    expect(finalState.searchResults.map((r) => r.url)).toEqual(['https://b.test/y']);
  });

  it('keeps chat_history recall when a scrape follows it', async () => {
    // chat_history schreibt `searchResults` selbst, ohne searchNode. Lebte die
    // Übernahme im searchNode-Zweig, hätte der folgende Scrape den Recall
    // überschrieben, ohne ihn je als „vorher" gesehen zu haben.
    const { finalState } = await executeIntentPipeline({
      classifiedState: buildState({
        intent: 'chat_history',
        secondaryIntent: 'scrape_url',
        detectedUrls: ['https://a.test/x'],
      }),
      sse: sse as never,
      forcedTool: true,
      imageAttachments: [],
    });

    const sources = finalState.searchResults.map((r) => r.url ?? r.source);
    expect(sources).toContain('https://a.test/x');
    expect(sources.length).toBeGreaterThan(1);
  });
});

/**
 * The daily `@deepresearch` allowance is one number for two engines, and the
 * caller is the single place that reads it. Each engine used to hold its own
 * limit against the shared Redis key (agent 3, dossier 1), which made the
 * verdict depend on which engine happened to ask.
 */
describe('executeIntentPipeline — ein `mcp`-Turn ohne Schleife', () => {
  // Der Einzeldurchlauf hat für `mcp` keinen Ausführenden: die Werkzeuge des
  // gewählten Servers gibt es nur in der agentischen Schleife, und `searchNode`
  // bricht für diesen Intent ohne Abruf ab. Hier zu landen heisst also, dass ein
  // Notausschalter (Bildanhang, Verbund, zweiter Intent) gegriffen hat.
  it('sagt ab, statt still `searchNode` für einen Intent ohne Zweig zu rufen', async () => {
    const { finalState } = await executeIntentPipeline({
      classifiedState: buildState({ intent: 'mcp' }),
      sse: sse as never,
      forcedTool: true,
      imageAttachments: [{ mimeType: 'image/png', data: 'x' } as never],
    });

    expect(searchNode).not.toHaveBeenCalled();
    expect(sse.send.mock.calls.find(([e]) => e === 'warning')?.[1]).toMatchObject({
      code: 'mcp_not_consulted',
    });
    // Die Antwort selbst muss den Grund tragen — sonst liest sich der Turn wie
    // eine gewöhnliche Auskunft, die den Server einfach nicht erwähnt.
    expect(finalState.degradationNotes?.at(-1)?.code).toBe('mcp_not_consulted');
  });
});

describe('executeIntentPipeline — the shared @deepresearch allowance', () => {
  const deepState = () => buildState({ intent: 'web', deepResearchRequested: true });

  it('asks once and lets both engines run while the allowance holds', async () => {
    await executeIntentPipeline({
      classifiedState: deepState(),
      sse: sse as never,
      forcedTool: true,
      imageAttachments: [],
    });

    expect(checkDeepResearchQuota).toHaveBeenCalledTimes(1);
    expect(runDeepAgentTurn).toHaveBeenCalledTimes(1);
    expect(runDeepResearchTurn).toHaveBeenCalledTimes(1);
  });

  it('skips BOTH engines on a spent allowance, with one warning naming one number', async () => {
    checkDeepResearchQuota.mockResolvedValue({
      canResearch: false,
      count: 3,
      remaining: 0,
      limit: 3,
      resetIn: '5h 0m',
    });

    await executeIntentPipeline({
      classifiedState: deepState(),
      sse: sse as never,
      forcedTool: true,
      imageAttachments: [],
    });

    expect(runDeepAgentTurn).not.toHaveBeenCalled();
    expect(runDeepResearchTurn).not.toHaveBeenCalled();

    const warnings = sse.send.mock.calls.filter(([event]) => event === 'warning');
    expect(warnings).toHaveLength(1);
    expect(JSON.stringify(warnings[0]?.[1])).toContain('3× pro Tag');
  });

  it('does not consult the counter without a userId — it would fail closed and mislabel', async () => {
    await executeIntentPipeline({
      classifiedState: buildState({
        intent: 'web',
        deepResearchRequested: true,
        agentConfig: { identifier: 'gruenerator-universal' },
      }),
      sse: sse as never,
      forcedTool: true,
      imageAttachments: [],
    });

    expect(checkDeepResearchQuota).not.toHaveBeenCalled();
    // The engines refuse an unmeterable run on their own, which is a different
    // thing from "your allowance is gone" and must not be narrated as one.
    expect(sse.send.mock.calls.filter(([event]) => event === 'warning')).toHaveLength(0);
  });
});

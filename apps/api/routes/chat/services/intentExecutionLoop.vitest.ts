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

// Not under test, and importing it pulls in the `deepagents` package (plus a
// LangChain graph build) for no benefit here.
vi.mock('./deepAgentTurn.js', () => ({ runDeepAgentTurn: vi.fn(async () => null) }));

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

const sse = { send: vi.fn() };

beforeEach(() => {
  searchNode.mockClear();
  sse.send.mockClear();
  scrapeReturnsNothing = false;
});

describe('executeIntentPipeline — intent follows the loop', () => {
  it('runs each intent in its OWN searchNode branch and unions the sources', async () => {
    const { executeIntentPipeline } = await import('./intentExecutionService.js');

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
    const { executeIntentPipeline } = await import('./intentExecutionService.js');

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
    const { executeIntentPipeline } = await import('./intentExecutionService.js');

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
    const { executeIntentPipeline } = await import('./intentExecutionService.js');

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

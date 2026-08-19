import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeDirectSearch = vi.fn();
const executeDirectWebSearch = vi.fn();

vi.mock('../../../../routes/chat/agents/directSearch.js', () => ({
  executeDirectSearch: (...a: unknown[]) => executeDirectSearch(...a),
  executeDirectExamplesSearch: vi.fn(),
  executeDirectWebSearch: (...a: unknown[]) => executeDirectWebSearch(...a),
}));

const { searchNode } = await import('./searchNode.js');

import type { ChatGraphState, SearchIntent } from '../types.js';

/**
 * The single-pass web gate for corpus-bound agents.
 *
 * The Landesverband agents answer from their own notebook and the party
 * corpora — their prompt says so, and their `enabledTools` said so too. But the
 * classifier picks `searchSources` from keyword heuristics alone and never
 * consults the agent, so the single-pass path went to the open web anyway
 * (observed live on gruenerator-buergeranfragen-berlin). A declaration is not a
 * gate; these pin the gate.
 *
 * Sibling of searchWebFallback.vitest.ts, which pins the notebook-SCOPE
 * boundary. Same web door, different key: scope vs. capability.
 */

function agentConfig(enabledTools?: string[]) {
  return {
    identifier: enabledTools ? 'gruenerator-buergeranfragen-berlin' : 'gruenerator-universal',
    name: 'Test Agent',
    systemPrompt: '',
    allowedCollections: null,
    description: '',
    avatar: '',
    backgroundColor: '',
    slug: 'test',
    isSystemDefault: true,
    ...(enabledTools ? { enabledTools } : {}),
  };
}

/** The LV shape: search + housekeeping, deliberately no web. */
const NO_WEB = ['search', 'memory', 'self_review'];

function buildState(overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    messages: [{ role: 'user' as const, content: 'Was steht im Programm zum Klimaschutz?' }],
    threadId: null,
    agentConfig: agentConfig(),
    enabledTools: { search: true, web: true },
    userLocale: 'de-DE',
    intent: 'search' as SearchIntent,
    searchQuery: 'Klimaschutz Programm',
    subQueries: null,
    detectedFilters: null,
    searchSources: [],
    notebookCollectionIds: [],
    notebookDocumentIds: [],
    defaultNotebookCollectionIds: [],
    documentIds: [],
    documentChatIds: [],
    docMentionIds: [],
    threadAttachments: [],
    imageAttachments: [],
    searchResults: [],
    citations: [],
    ...overrides,
  } as unknown as ChatGraphState;
}

const emptyInternal = { collection: 'deutschland', results: [], resultsCount: 0 };
const internalHit = {
  collection: 'berlin',
  resultsCount: 1,
  results: [
    {
      source: 'gruene-berlin.de',
      url: 'https://gruene-berlin.de/klima',
      excerpt: 'Interner Treffer aus dem Landesverband.',
      relevance: 'Hoch',
    },
  ],
};
const webHit = {
  results: [
    {
      title: 'Klimaschutz aktuell',
      url: 'https://example.org/klima',
      excerpt: 'Ein belegter Satz zum Klimaschutz.',
      relevance: 'Hoch',
    },
  ],
};

describe('searchNode — Web-Gate für Agenten ohne Web-Recht', () => {
  beforeEach(() => {
    executeDirectSearch.mockReset();
    executeDirectWebSearch.mockReset();
  });

  it('degradiert einen web-Intent zur internen Suche', async () => {
    executeDirectSearch.mockResolvedValue(internalHit);
    executeDirectWebSearch.mockResolvedValue(webHit);

    const result = await searchNode(
      buildState({
        agentConfig: agentConfig(NO_WEB),
        intent: 'web' as SearchIntent,
      } as Partial<ChatGraphState>)
    );

    expect(executeDirectWebSearch).not.toHaveBeenCalled();
    expect(executeDirectSearch).toHaveBeenCalled();
    expect(result.searchResults?.length ?? 0).toBeGreaterThan(0);
  });

  it('entfernt die Web-Quelle aus einer Multi-Source-Suche', async () => {
    executeDirectSearch.mockResolvedValue(internalHit);
    executeDirectWebSearch.mockResolvedValue(webHit);

    await searchNode(
      buildState({
        agentConfig: agentConfig(NO_WEB),
        searchSources: ['documents', 'web'],
      } as Partial<ChatGraphState>)
    );

    expect(executeDirectWebSearch).not.toHaveBeenCalled();
  });

  it('nimmt auch den Notausgang: kein Web-Fallback bei 0 internen Treffern', async () => {
    executeDirectSearch.mockResolvedValue(emptyInternal);
    executeDirectWebSearch.mockResolvedValue(webHit);

    const result = await searchNode(
      buildState({ agentConfig: agentConfig(NO_WEB) } as Partial<ChatGraphState>)
    );

    expect(executeDirectWebSearch).not.toHaveBeenCalled();
    expect(result.searchResults?.length ?? 0).toBe(0);
  });

  it('lässt einen Agenten MIT Web-Recht unverändert', async () => {
    executeDirectSearch.mockResolvedValue(emptyInternal);
    executeDirectWebSearch.mockResolvedValue(webHit);

    const result = await searchNode(
      buildState({ agentConfig: agentConfig(['search', 'web']) } as Partial<ChatGraphState>)
    );

    expect(executeDirectWebSearch).toHaveBeenCalled();
    expect(result.searchResults?.length ?? 0).toBeGreaterThan(0);
  });

  it('lässt einen Agenten ohne jede Deklaration unverändert', async () => {
    executeDirectSearch.mockResolvedValue(emptyInternal);
    executeDirectWebSearch.mockResolvedValue(webHit);

    await searchNode(buildState());

    expect(executeDirectWebSearch).toHaveBeenCalled();
  });
});

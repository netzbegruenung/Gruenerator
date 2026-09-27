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
 * The loop path forces the web after an empty internal search
 * (loopGuards.emptyResultFallback). This path could not follow: `search` is an
 * exclusive, one-time intent choice, so a turn that found nothing internally
 * answered from the model's memory — ungrounded, and to the reader
 * indistinguishable from a researched answer.
 *
 * The scope boundary is the interesting half: a notebook-scoped turn means
 * "search MY documents". Widening that to the open web would answer a
 * different question than the one asked.
 */

const STUB_AGENT_CONFIG = {
  identifier: 'gruenerator-universal',
  name: 'Test Agent',
  systemPrompt: '',
  allowedCollections: null,
  description: '',
  avatar: '',
  backgroundColor: '',
  slug: 'test',
  isSystemDefault: true,
};

function buildState(overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    messages: [{ role: 'user' as const, content: 'Was steht im Programm zum Klimaschutz?' }],
    threadId: null,
    agentConfig: STUB_AGENT_CONFIG,
    enabledTools: { search: true, web: true },
    // Query expansion is best-effort and wrapped in try/catch — a pool that
    // rejects exercises exactly the path a slow lane would take.
    userLocale: 'de-DE',
    intent: 'search' as SearchIntent,
    searchQuery: 'Klimaschutz Programm',
    subQueries: null,
    detectedFilters: null,
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

describe('searchNode — Web-Fallback bei 0 internen Treffern', () => {
  beforeEach(() => {
    executeDirectSearch.mockReset();
    executeDirectWebSearch.mockReset();
  });

  it('geht ins Web, wenn die internen Sammlungen nichts liefern', async () => {
    executeDirectSearch.mockResolvedValue(emptyInternal);
    executeDirectWebSearch.mockResolvedValue(webHit);

    const result = await searchNode(buildState());

    expect(executeDirectWebSearch).toHaveBeenCalled();
    expect(result.searchResults?.length ?? 0).toBeGreaterThan(0);
  });

  it('lässt die Websuche in Ruhe, wenn intern etwas gefunden wurde', async () => {
    executeDirectSearch.mockResolvedValue({
      collection: 'deutschland',
      resultsCount: 1,
      results: [
        {
          source: 'gruene.de',
          url: 'https://gruene.de/klima',
          excerpt: 'Interner Treffer.',
          relevance: 'Hoch',
        },
      ],
    });

    const result = await searchNode(buildState());

    expect(executeDirectWebSearch).not.toHaveBeenCalled();
    expect(result.searchResults?.length ?? 0).toBeGreaterThan(0);
  });

  it('weitet einen notebook-gebundenen Turn NICHT aufs Web aus', async () => {
    // "Durchsuche MEINE Dokumente" ist eine Zusage. Leer heisst hier leer.
    executeDirectSearch.mockResolvedValue(emptyInternal);
    executeDirectWebSearch.mockResolvedValue(webHit);

    const result = await searchNode(
      buildState({ notebookCollectionIds: ['mein-notebook'] } as Partial<ChatGraphState>)
    );

    expect(executeDirectWebSearch).not.toHaveBeenCalled();
    expect(result.searchResults?.length ?? 0).toBe(0);
  });
});

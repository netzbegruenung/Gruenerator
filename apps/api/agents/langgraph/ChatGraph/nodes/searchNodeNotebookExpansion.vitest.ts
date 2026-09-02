/**
 * Seit #3121 sucht ein notebook-gebundener Turn mit ZWEI Formulierungen. Genau
 * eine Zahl darf sich dabei bewegen — die Zahl der Alternativen —, und sie hängt
 * an einem `slice`, den beim Lesen niemand sieht. Fällt er weg, verdreifachen
 * sich die Qdrant-Aufrufe je Turn (40er-Anfragen, drei statt einer je Sammlung).
 *
 * Gepinnt wird deshalb dreierlei: dass `expandQuery` im Notebook-Zweig
 * überhaupt läuft, dass es OHNE Optionen gerufen wird (kein `historyContext` —
 * der Auflöser im Klassifikator hat die Folgefrage schon aufgelöst, und
 * `rerankNode` rankt mit `state.searchQuery`; `variants` wirkt ohne Verlauf
 * ohnehin nicht, QueryExpansionService.ts:91), und dass genau EINE Alternative
 * bis in die Suche kommt. Der allgemeine Zweig behält seine zwei — das ist
 * Abnahmebedingung des PRs, nicht Nebenwirkung.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeDirectSearch = vi.fn();
const executeDirectWebSearch = vi.fn();
const expandQuery = vi.fn();

vi.mock('../../../../routes/chat/agents/directSearch.js', () => ({
  executeDirectSearch: (...a: unknown[]) => executeDirectSearch(...a),
  executeDirectExamplesSearch: vi.fn(),
  executeDirectWebSearch: (...a: unknown[]) => executeDirectWebSearch(...a),
}));
vi.mock('../../../../services/search/QueryExpansionService.js', () => ({
  expandQuery: (...a: unknown[]) => expandQuery(...a),
}));

const { searchNode } = await import('./searchNode.js');

import type { ChatGraphState, SearchIntent } from '../types.js';

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

const hit = {
  collection: 'berlin',
  resultsCount: 1,
  results: [
    {
      source: 'Wahlprogramm Berlin',
      url: 'https://gruene.berlin/programm',
      excerpt: 'Ein belegter Satz.',
      relevance: 'Hoch',
    },
  ],
};

/** Die Anfragen in Aufrufreihenfolge — das ist, was Qdrant wirklich sieht. */
function queriesSearched(): string[] {
  return executeDirectSearch.mock.calls.map((c) => (c[0] as { query: string }).query);
}

describe('searchNode — zweite Formulierung im Notebook-Zweig', () => {
  beforeEach(() => {
    executeDirectSearch.mockReset();
    executeDirectWebSearch.mockReset();
    expandQuery.mockReset();
    executeDirectSearch.mockResolvedValue(hit);
    expandQuery.mockResolvedValue({
      primary: 'Klimaschutz Programm',
      alternatives: ['Klimapolitik Berlin', 'Emissionsminderung Berlin'],
    });
  });

  it('erweitert einen notebook-gebundenen Turn — mit genau EINER Alternative', async () => {
    await searchNode(buildState({ notebookCollectionIds: ['berlin'] } as Partial<ChatGraphState>));

    expect(expandQuery).toHaveBeenCalledTimes(1);
    // Eine Sammlung × zwei Formulierungen. Drei Aufrufe wären die verdreifachten
    // Kosten, die #3121 ausdrücklich ausschliesst.
    expect(queriesSearched()).toEqual(['Klimaschutz Programm', 'Klimapolitik Berlin']);
  });

  it('erweitert auch ein agentgebundenes Notebook (defaultNotebookCollectionIds)', async () => {
    // Der schlechter gestellte der beiden Fälle: ohne Anhang bekommt er nicht
    // einmal den Auflöser (classifierNode.ts:867-886).
    await searchNode(
      buildState({ defaultNotebookCollectionIds: ['bayern'] } as Partial<ChatGraphState>)
    );

    expect(expandQuery).toHaveBeenCalledTimes(1);
    expect(queriesSearched()).toEqual(['Klimaschutz Programm', 'Klimapolitik Berlin']);
  });

  it('ruft expandQuery ohne jede Option — kein Verlauf, kein variants', async () => {
    await searchNode(buildState({ notebookCollectionIds: ['berlin'] } as Partial<ChatGraphState>));

    expect(expandQuery).toHaveBeenCalledWith('Klimaschutz Programm');
    // Genau EIN Argument: `variants` wirkt ohne `historyContext` gar nicht, und
    // ein zweiter Umschreiber liefe der Anfrage davon, mit der rerankNode rankt.
    expect(expandQuery.mock.calls[0]).toHaveLength(1);
  });

  it('lässt dem allgemeinen Zweig beide Alternativen', async () => {
    await searchNode(buildState());

    const distinct = new Set(queriesSearched());
    expect([...distinct]).toEqual([
      'Klimaschutz Programm',
      'Klimapolitik Berlin',
      'Emissionsminderung Berlin',
    ]);
  });

  it('sucht mit einer Formulierung weiter, wenn die Erweiterung ausfällt', async () => {
    // Der Ausfall ist der Zustand von vorher — nicht ein Fehler des Turns.
    expandQuery.mockRejectedValue(new Error('lane timeout'));

    await searchNode(buildState({ notebookCollectionIds: ['berlin'] } as Partial<ChatGraphState>));

    expect(queriesSearched()).toEqual(['Klimaschutz Programm']);
  });
});

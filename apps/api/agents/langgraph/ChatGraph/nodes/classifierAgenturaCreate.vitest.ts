import { describe, it, expect, vi } from 'vitest';

/**
 * Ein Anlegeauftrag für die Agentura („erstell mir ein Rezept für
 * Instagram-Posts", „bau einen Agenten, der Pressemitteilungen schreibt")
 * nennt fast immer eine Textsorte — und die Textsorten-Schnellpfade darunter
 * (Social-Post → `produktion`) griffen das Nomen, bevor jemand fragte, WAS
 * erstellt werden soll. Der Turn schrieb dann einen Post, statt ein Rezept
 * anzulegen. Jetzt geht er in die Schleife, wo `recipes`/`user_agents` montiert
 * sind — bewusst OHNE Pin (Begründung am Zweig in `classifierNode.ts`).
 */

const executeProvider = vi.fn(async () => ({ content: 'keine' }));
vi.mock('../../../../services/ai/execution/index.js', () => ({
  executeProvider: (...args: unknown[]) => executeProvider(...args),
}));

const { classifierNode } = await import('./classifierNode.js');

import type { ChatGraphState, SearchIntent } from '../types.js';

const STUB_AGENT_CONFIG = {
  identifier: 'gruenerator-universal',
  name: 'Test Agent',
  systemPrompt: 'Du bist ein Assistent.',
  allowedCollections: null,
  description: '',
  avatar: '',
  backgroundColor: '',
  slug: 'test',
  isSystemDefault: true,
};

function buildState(userMessage: string): ChatGraphState {
  return {
    messages: [{ role: 'user' as const, content: userMessage }],
    threadId: null,
    agentConfig: STUB_AGENT_CONFIG,
    enabledTools: { search: true, web: true, examples: true, research: true },
    userLocale: 'de-DE',
    attachmentContext: null,
    imageAttachments: [],
    threadAttachments: [],
    notebookIds: [],
    notebookCollectionIds: [],
    notebookDocumentIds: [],
    defaultNotebookCollectionIds: [],
    documentIds: [],
    documentChatIds: [],
    boardIds: [],
    boardContext: null,
    sheetIds: [],
    sheetContext: null,
    docMentionIds: [],
    documentMentionContext: null,
    currentDocument: null,
    customSystemPrompt: null,
    userInstructions: null,
    memoryContext: null,
    memoryRetrieveTimeMs: 0,
    chatHistoryContext: null,
    isCompound: false,
    gatherSources: [],
    intent: 'direct' as SearchIntent,
    secondaryIntent: null,
    searchSources: [],
    searchQuery: null,
    subQueries: null,
    reasoning: '',
    hasTemporal: false,
    complexity: 'moderate' as const,
    contentType: null,
    documentSubtype: null,
    platform: null,
    needsClarification: false,
    clarificationQuestion: null,
    clarificationOptions: null,
    detectedFilters: null,
    researchBrief: null,
    researchMeta: null,
    searchResults: [],
    citations: [],
    searchCount: 0,
    maxSearches: 2,
    qualityScore: 0,
    qualityAssessmentTimeMs: 0,
    imagePrompt: null,
    imageStyle: null,
    imageEditStyle: null,
    generatedImage: null,
    imageTimeMs: 0,
    summaryContext: null,
    summaryTimeMs: 0,
    chartData: null,
    responseText: '',
    streamingStarted: false,
    contextWindowTokens: 128000,
    startTime: Date.now(),
    classificationTimeMs: 0,
    searchTimeMs: 0,
    rerankTimeMs: 0,
    searchedCollections: [],
    responseTimeMs: 0,
    error: null,
  } as unknown as ChatGraphState;
}

async function classify(text: string, over: Partial<ChatGraphState> = {}) {
  return (await classifierNode({ ...buildState(text), ...over })) as Partial<ChatGraphState>;
}

describe('Agentura-Anlegeauftrag → Schleife, kein Pin', () => {
  it.each([
    'Erstell mir ein Rezept für Instagram-Posts zur Verkehrswende',
    'Kannst du ein neues Rezept für Pressemitteilungen anlegen?',
    'Bau mir bitte ein Rezept, das Einladungen zur Mitgliederversammlung schreibt',
    'Leg ein Rezept für Facebook-Posts an',
  ])('%s → recipes', async (text) => {
    const out = await classify(text);
    expect(out.intent).toBe('agentic');
    expect(out.reasoning).toMatch(/Rezept anzulegen/);
    expect(out.mentionPinnedTool ?? null).toBeNull();
  });

  it.each([
    'Erstell einen Agenten, der Instagram-Posts schreibt',
    'Bau mir einen Grünerator-Agenten für Pressemitteilungen',
    'Leg bitte einen neuen Agenten für Tweets an',
  ])('%s → user_agents', async (text) => {
    const out = await classify(text);
    expect(out.intent).toBe('agentic');
    expect(out.reasoning).toMatch(/Grünerator-Agenten anzulegen/);
  });

  it.each([
    'Instagram-Post zu Tempo 30',
    'Schreib einen Instagram-Post mit einem Rezept für Kürbissuppe',
    'Erstelle einen Instagram-Post über unseren Agenten-Workshop',
    'Wie erstelle ich ein eigenes Rezept?',
  ])('%s → kein Anlegeauftrag', async (text) => {
    const out = await classify(text);
    expect(out.reasoning ?? '').not.toMatch(/anzulegen/);
  });
});

describe('Agentura-Anlegeauftrag mit gewählten Quellen', () => {
  const ORDER = 'Erstell mir ein Rezept für Instagram-Posts aus diesem Leitfaden';

  it('@Dokument: Schleife statt Zwangssuche — der Loop bringt den Anhang-Seed mit', async () => {
    const out = await classify(ORDER, { documentIds: ['doc-1'] } as Partial<ChatGraphState>);
    expect(out.intent).toBe('agentic');
    expect(out.reasoning).toMatch(/Rezept anzulegen/);
  });

  it('großer Anhang (vektorisiert, documentChatIds): Schleife statt Zwangssuche', async () => {
    const out = await classify(ORDER, { documentChatIds: ['doc-1'] } as Partial<ChatGraphState>);
    expect(out.intent).toBe('agentic');
    expect(out.reasoning).toMatch(/Rezept anzulegen/);
  });

  it('„Zusammenfassung" als Textsorte schlägt den Zusammenfassungs-Zweig nicht', async () => {
    const out = await classify(
      'Erstell mir ein Rezept für die Zusammenfassung von Sitzungsprotokollen',
      { documentChatIds: ['doc-1'] } as Partial<ChatGraphState>
    );
    expect(out.intent).toBe('agentic');
  });

  it('Wolke-Datei: Schleife statt Zwangssuche — der Loop hat cloud_files', async () => {
    const out = await classify(ORDER, {
      wolkeFiles: [{ shareLinkId: 's', path: '/leitfaden.pdf', name: 'leitfaden.pdf' }],
    } as unknown as Partial<ChatGraphState>);
    expect(out.intent).toBe('agentic');
  });

  it('gewähltes Notebook: Schleife mit agenturaCreateOrder, ohne Pin (#3679)', async () => {
    const out = await classify(ORDER, { notebookIds: ['nb-1'] } as Partial<ChatGraphState>);
    expect(out.intent).toBe('agentic');
    expect(out.agenturaCreateOrder).toBe(true);
    expect(out.mentionPinnedTool ?? null).toBeNull();
  });
});

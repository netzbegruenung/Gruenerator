/**
 * Golden-Test für den Zusammenbau des Systemprompts.
 *
 * Er sichert den fertigen String Byte für Byte zu — Reihenfolge der Blöcke,
 * führende Leerzeilen, Auslassungen. Alle I/O-Produzenten (Rezepttext,
 * gelernte Textform, Produktwissen, Doku-Seitenkarte) sind durch feste
 * Marker ersetzt: geprüft wird der Zusammenbau, nicht ihr Inhalt.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

import type { ChatGraphState } from '../types.js';

vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../../../services/skills/internalPrompts.js', () => ({
  getInternalSkillPrompt: (mention: string) => `<<REZEPT-PROMPT:${mention}>>`,
}));

const getTextFormForInjection = vi.fn<
  (userId: string, mention: string) => Promise<{ title: string; styleBlock: string } | null>
>(async () => null);
vi.mock('../../../../services/user/textFormRepository.js', () => ({
  getTextFormForInjection: (userId: string, mention: string) =>
    getTextFormForInjection(userId, mention),
}));

vi.mock('../../../../services/docs/docsIndex.js', () => ({
  buildDocsPageMap: () => '\n\n<<DOKU-SEITENKARTE>>',
}));

vi.mock('../../../../services/chat/productKnowledge.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../services/chat/productKnowledge.js')>()),
  buildProductKnowledgeBlock: async () => '\n\n<<PRODUKTWISSEN>>',
}));

const { buildSystemMessage } = await import('./respondNode.js');

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-21T09:00:00Z'));
});
afterAll(() => {
  vi.useRealTimers();
});

function makeState(overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    messages: [{ role: 'user', content: 'Was fordert ihr beim Tempolimit?' }],
    threadId: 't-1',
    agentConfig: {
      systemRole: 'Du bist der Grünerator-Agent {{partyName}}.',
      userId: null,
      inlineSourceLinks: false,
      defaultRecipeMention: null,
    },
    enabledTools: {},
    userLocale: 'de-DE',
    clientPlatform: 'web',
    intent: 'direct',
    responseText: null,
    contentType: null,
    contextWindowTokens: 128000,

    attachmentContext: null,
    imageAttachments: [],
    threadAttachments: [],
    threadArtifacts: [],
    hasTabularAttachment: false,
    pdfFormAttachments: [],
    clientCanRunPython: true,

    notebookIds: [],
    notebookCollectionIds: [],
    notebookDocumentIds: [],
    defaultNotebookCollectionIds: [],
    defaultNotebookDocumentIds: [],
    documentIds: [],
    documentChatIds: [],
    docMentionIds: [],
    boardIds: [],
    sheetIds: [],
    sheetEditId: null,
    wolkeFiles: [],
    connectFiles: [],
    attachedWebpageUrls: [],

    boardContext: null,
    sheetContext: null,
    documentMentionContext: null,
    pipelineSourceText: null,
    currentDocument: null,
    currentBoard: null,
    customSystemPrompt: null,
    roleBausteinActive: false,
    userRoles: [],
    activeSkillMention: null,
    userInstructions: null,
    memoryContext: null,
    memoryRetrieveTimeMs: 0,
    chatHistoryContext: null,
    summaryContext: null,
    computedResult: null,
    computedResultFresh: false,
    isCompound: false,
    gatherSources: [],
    documentSources: [],
    perSourceResults: {},
    searchResults: [],
    searchQuery: null,
    searchSources: [],
    researchBrief: null,
    complexity: 'simple',
    citations: [],
    degradationNotes: [],
    imageEditDescriptions: null,
    mentionPinnedTool: null,
    injectionSuspected: false,
    forbiddenArtifactAction: null,
    ...overrides,
  } as unknown as ChatGraphState;
}

const sources = [
  {
    source: 'web:tempolimit',
    title: 'Tempolimit 130',
    content: 'Ein generelles Tempolimit von 130 km/h auf Autobahnen.',
    relevance: 0.9,
    url: 'https://example.org/tempolimit',
  },
  {
    source: 'gruenerator:programm',
    title: 'Wahlprogramm',
    content: 'Verkehrswende: Vorrang für Bahn und Rad.',
    relevance: 0.7,
  },
];

const CASES: ReadonlyArray<{
  name: string;
  state: ChatGraphState;
  opts?: { retrievalExpected?: boolean };
}> = [
  { name: 'leerer zustand', state: makeState() },
  {
    name: 'mit quellen',
    state: makeState({
      intent: 'search',
      searchResults: sources,
      searchQuery: 'tempolimit',
      searchSources: ['web'],
      citations: [{ id: 1 }, { id: 2 }],
    } as unknown as Partial<ChatGraphState>),
  },
  {
    name: 'mit quellen und contentType (polished)',
    state: makeState({
      intent: 'produktion',
      contentType: 'pressemitteilung',
      searchResults: sources,
      searchQuery: 'tempolimit',
      searchSources: ['web'],
      citations: [{ id: 1 }, { id: 2 }],
    } as unknown as Partial<ChatGraphState>),
  },
  {
    name: 'mit anhaengen',
    state: makeState({
      attachmentContext: '### Antrag.pdf\n\nDer Antrag fordert ein Tempolimit.',
      threadAttachments: [
        { name: 'Protokoll.pdf', content: 'Beschluss der Fraktion vom 3. Mai.', turn: 1 },
      ],
    } as unknown as Partial<ChatGraphState>),
  },
  {
    name: 'mit bildern',
    state: makeState({
      imageAttachments: [{ name: 'plakat.png', data: '', mimeType: 'image/png' }],
    } as unknown as Partial<ChatGraphState>),
  },
  {
    name: 'mit board',
    state: makeState({ boardContext: 'Spalte To Do: Karte „Antrag schreiben"' }),
  },
  {
    name: 'mit notizbuch',
    state: makeState({
      intent: 'search',
      notebookCollectionIds: ['nb-1'],
      searchResults: sources,
      searchQuery: 'tempolimit',
      searchSources: ['notebook'],
      citations: [{ id: 1 }, { id: 2 }],
    } as unknown as Partial<ChatGraphState>),
  },
  { name: 'locale de-AT', state: makeState({ userLocale: 'de-AT' } as Partial<ChatGraphState>) },
  { name: 'plattform app', state: makeState({ clientPlatform: 'app' } as Partial<ChatGraphState>) },
  {
    name: 'aktives rezept (system)',
    state: makeState({ activeSkillMention: 'instagram' }),
  },
  {
    name: 'aktives rezept (agenten-standard, write-eligible)',
    state: makeState({
      agentConfig: {
        systemRole: 'Du bist der Grünerator-Agent {{partyName}}.',
        userId: 'u-1',
        inlineSourceLinks: false,
        defaultRecipeMention: 'instagram',
      },
    } as unknown as Partial<ChatGraphState>),
  },
  {
    name: 'custom system prompt',
    state: makeState({
      customSystemPrompt: 'Du bist eine neutrale Assistenz {{partyName}}.',
      memoryContext: 'Mag kurze Antworten.',
      boardContext: 'Spalte To Do',
      searchResults: sources,
      searchQuery: 'tempolimit',
      searchSources: ['web'],
      citations: [{ id: 1 }, { id: 2 }],
    } as unknown as Partial<ChatGraphState>),
  },
  {
    name: 'composer-bypass',
    state: makeState({
      intent: 'pressemitteilung_examples',
      responseText: 'WÖRTLICH DURCHGEREICHTER COMPOSER-PROMPT',
    } as unknown as Partial<ChatGraphState>),
  },
  {
    name: 'pipeline-uebertragung (pinned)',
    state: makeState({
      pipelineSourceText: 'Der Gemeinderat hat beschlossen …',
      attachmentContext: '### Alt.pdf\n\nAlter Anhang, muss schweigen.',
      currentDocument: { title: 'Doc', markdown: 'Inhalt', selectionText: null },
      documentMentionContext: 'Referenz, muss schweigen.',
    } as unknown as Partial<ChatGraphState>),
  },
  {
    name: 'voller materialstapel',
    state: makeState({
      intent: 'search',
      userInstructions: 'Ich bin Pressesprecherin im Landesverband.',
      memoryContext: 'Mag kurze Antworten.',
      chatHistoryContext: '## FRÜHERE GESPRÄCHE\n\nEs ging um Verkehr.',
      boardContext: 'Spalte To Do: Karte „Antrag schreiben"',
      sheetContext: '| A1 | B1 |',
      documentMentionContext: 'Referenziertes Dokument.',
      attachmentContext: '### Antrag.pdf\n\nDer Antrag fordert ein Tempolimit.',
      currentDocument: { title: 'Entwurf', markdown: 'Offener Text', selectionText: 'Auswahl' },
      imageAttachments: [{ name: 'plakat.png', data: '', mimeType: 'image/png' }],
      summaryContext: 'Kurzfassung des Dokuments.',
      hasTabularAttachment: true,
      searchResults: sources,
      searchQuery: 'tempolimit',
      searchSources: ['web', 'notebook'],
      citations: [{ id: 1 }, { id: 2 }],
      injectionSuspected: true,
      degradationNotes: [{ step: 'compute', message: 'Berechnung fehlgeschlagen' }],
    } as unknown as Partial<ChatGraphState>),
  },
  {
    name: 'neutraler zusammenfassungs-turn',
    state: makeState({
      intent: 'summary',
      summaryContext: 'Kurzfassung des Dokuments.',
    } as unknown as Partial<ChatGraphState>),
  },
  {
    name: 'produkt-metafrage',
    state: makeState({
      messages: [{ role: 'user', content: 'Was kannst du?' }],
    } as unknown as Partial<ChatGraphState>),
  },
  {
    name: 'doku-hilfefrage per gepinntem werkzeug',
    state: makeState({
      mentionPinnedTool: 'gruenerator_docs_search',
    } as unknown as Partial<ChatGraphState>),
  },
  {
    name: 'retrievalExpected (agentischer loop)',
    state: makeState({
      agentConfig: {
        systemRole: 'Du bist der Grünerator-Agent {{partyName}}.',
        userId: 'u-1',
        inlineSourceLinks: false,
        defaultRecipeMention: 'instagram',
      },
    } as unknown as Partial<ChatGraphState>),
    opts: { retrievalExpected: true },
  },
];

describe('buildSystemMessage — Golden', () => {
  for (const testCase of CASES) {
    it(testCase.name, async () => {
      const out = await buildSystemMessage(testCase.state, testCase.opts ?? {});
      expect(out).toMatchSnapshot();
    });
  }

  it('gelernte textform ersetzt den system-rezepttext', async () => {
    getTextFormForInjection.mockResolvedValueOnce({
      title: 'Instagram',
      styleBlock: '<<GELERNTE TEXTFORM>>',
    });
    const out = await buildSystemMessage(
      makeState({
        activeSkillMention: 'instagram',
        agentConfig: {
          systemRole: 'Du bist der Grünerator-Agent {{partyName}}.',
          userId: 'u-1',
          inlineSourceLinks: false,
          defaultRecipeMention: null,
        },
      } as unknown as Partial<ChatGraphState>),
      {}
    );
    expect(out).toMatchSnapshot();
  });
});

/**
 * Golden-Test für den Zusammenbau des Systemprompts.
 *
 * Er sichert den fertigen String Byte für Byte zu — Reihenfolge der Blöcke,
 * führende Leerzeilen, Auslassungen — und dazu die Nebenwirkungen des
 * Zusammenbaus (`state.usedRecipes`, die Entscheidung der Formatregel). Alle
 * I/O-Produzenten (Rezepttext, angelernte Textform, Produktwissen,
 * Doku-Seitenkarte) sind durch feste Marker ersetzt: geprüft wird der
 * Zusammenbau, nicht ihr Inhalt.
 *
 * Ein Golden-Fall sieht eine falsche Zuordnung nur, wenn sein Zustand den
 * betroffenen Block auch füllen würde — ein leerer Block rendert `''` und fällt
 * in keinem Schnappschuss auf. Deshalb gibt es für BEIDE Zweige einen Fall mit
 * vollem Materialstapel.
 */
import { VISUAL_BLOCK_KINDS } from '@gruenerator/contracts';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  createDecisionJournal,
  runWithDecisionJournal,
} from '../../../../utils/decisionJournal.js';

import type * as productKnowledge from '../../../../services/chat/productKnowledge.js';
import type { ChatGraphState } from '../types.js';

vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../../../services/skills/internalPrompts.js', () => ({
  getInternalSkillPrompt: (mention: string) => `<<REZEPT-PROMPT:${mention}>>`,
}));
// Ohne Katalog hängt kein Vorlagen-Angebot am Social-Rezept — die Goldens
// halten den Prompt fest, nicht den privaten Katalog.
vi.mock('../../../../services/sharepicVorlagen/catalog.js', () => ({
  listSharepicVorlagen: () => [],
}));

type TextForm = {
  id: string;
  mention: string;
  kind: 'recipe';
  textType: string;
  title: string;
  styleBlock: string;
};
const getTextFormForInjection =
  vi.fn<(userId: string, mention: string) => Promise<TextForm | null>>();
const getTextFormForInjectionById =
  vi.fn<(id: string, userId: string) => Promise<TextForm | null>>();
vi.mock('../../../../services/user/textFormRepository.js', () => ({
  getTextFormForInjection: (userId: string, mention: string) =>
    getTextFormForInjection(userId, mention),
  getTextFormForInjectionById: (id: string, userId: string) =>
    getTextFormForInjectionById(id, userId),
}));

vi.mock('../../../../services/docs/docsIndex.js', () => ({
  buildDocsPageMap: () => '\n\n<<DOKU-SEITENKARTE>>',
}));

vi.mock('../../../../services/chat/productKnowledge.js', async (importOriginal) => ({
  ...(await importOriginal<typeof productKnowledge>()),
  buildProductKnowledgeBlock: async () => '\n\n<<PRODUKTWISSEN>>',
}));

const { buildSystemMessage, activePromptBlocks, PROMPT_BLOCK_ORDER } =
  await import('./respondNode.js');

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-27T09:00:00Z'));
});
afterAll(() => {
  vi.useRealTimers();
});
beforeEach(() => {
  getTextFormForInjection.mockReset();
  getTextFormForInjection.mockResolvedValue(null);
  getTextFormForInjectionById.mockReset();
  getTextFormForInjectionById.mockResolvedValue(null);
});

const ROLE = 'Du bist der Grünerator-Agent {{partyName}}.';
const CUSTOM_ROLE = 'Du bist eine neutrale Assistenz {{partyName}}.';

function makeState(overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    messages: [{ role: 'user', content: 'Was fordert ihr beim Tempolimit?' }],
    threadId: 't-1',
    agentConfig: {
      identifier: 'gruenerator-universal',
      systemRole: ROLE,
      userId: null,
      inlineSourceLinks: false,
      defaultRecipeMention: null,
    },
    enabledTools: {},
    userLocale: 'de-DE',
    clientPlatform: 'web',
    visualBlocks: [],
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
    currentCanvas: null,
    currentBoard: null,
    customSystemPrompt: null,
    roleBausteinActive: false,
    userRoles: [],
    activeRole: null,
    activeSkillMention: null,
    activeRecipeId: null,
    userInstructions: null,
    memoryContext: null,
    chatHistoryContext: null,
    summaryContext: null,
    computedResult: null,
    computedResultFresh: false,
    isCompound: false,
    gatherSources: [],
    documentSources: [],
    perSourceResults: {},
    synthesisMode: null,
    searchResults: [],
    searchQuery: null,
    searchSources: [],
    searchErrors: [],
    sourcesCarriedFromThread: false,
    researchBrief: null,
    complexity: 'simple',
    citations: [],
    degradationNotes: [],
    imageEditDescriptions: null,
    mentionPinnedTool: null,
    injectionSuspected: false,
    forbiddenArtifactAction: null,
    generatedImage: null,
    imagePrompt: null,
    sharepicVariants: [],
    createdDocument: null,
    createdBoard: null,
    lastToolContext: null,
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

const protokoll = {
  id: 'att-1',
  name: 'Protokoll.pdf',
  mimeType: 'application/pdf',
  isImage: false,
  extractedText: 'Beschluss der Fraktion vom 3. Mai.',
  documentId: null,
  summary: 'Beschluss vom 3. Mai.',
  hasFileData: false,
  createdAt: new Date('2026-09-20T10:00:00Z'),
};

const withSources = {
  searchResults: sources,
  searchQuery: 'tempolimit',
  searchSources: ['web'],
  citations: [{ id: 1 }, { id: 2 }],
};

const twoDocuments = {
  documentSources: [
    { kind: 'document', id: 'd-a', label: 'Antrag A' },
    { kind: 'document', id: 'd-b', label: 'Antrag B' },
  ],
  perSourceResults: {
    'd-a': [
      {
        source: 'Antrag A',
        title: 'Antrag A',
        content: 'A fordert Tempo 30.',
        relevance: 0.8,
        documentId: 'd-a',
      },
    ],
    'd-b': [
      {
        source: 'Antrag B',
        title: 'Antrag B',
        content: 'B fordert Tempo 50.',
        relevance: 0.8,
        documentId: 'd-b',
      },
    ],
  },
};

const computed = {
  operation: 'sum',
  entries: [{ label: 'Summe', value: '42' }],
  summary: 'Die Summe beträgt 42.',
  figures: [],
  figureUrls: [],
  files: [{ name: 'ergebnis.xlsx' }],
  fileAssets: [],
};

const GELTUNGSFRAGE =
  'Gilt das Verbrenner-Aus ab 2035 in der EU noch? Antworte in zwei getrennten ' +
  'Abschnitten: (a) was rechtlich in Kraft ist, (b) was politisch verhandelt wird ' +
  'und noch nicht gilt. Nenne für beides den Rechtsakt bzw. das Verfahrensstadium.';

/** Jeder Material-Block belegt — in beiden Zweigen derselbe Stapel. */
const fullMaterial = {
  intent: 'search',
  userInstructions: 'Ich bin Pressesprecherin im Landesverband.',
  memoryContext: '### Dauerhafte Anweisungen\nNr. 1 (01.09.2026): Ab jetzt duzen.',
  chatHistoryContext: '## FRÜHERE GESPRÄCHE\n\nEs ging um Verkehr.',
  boardContext: 'Spalte To Do: Karte „Antrag schreiben"',
  sheetContext: '| A1 | B1 |',
  documentMentionContext: '### Referenziertes Dokument\n\nText der Referenz.',
  attachmentContext: '### Antrag.pdf\n\nDer Antrag fordert ein Tempolimit.',
  currentDocument: {
    id: 'doc-1',
    title: 'Entwurf',
    markdown: 'Offener Text',
    selectionText: 'Auswahl',
  },
  threadAttachments: [protokoll],
  imageAttachments: [{ name: 'plakat.png', data: '', mimeType: 'image/png' }],
  threadArtifacts: [{ kind: 'image', ref: 'https://x/alt.png', label: 'Windrad' }],
  threadLookups: [{ toolName: 'find_content', query: 'Wärmepumpe', resultCount: 0, failed: false }],
  summaryContext: 'Kurzfassung des Dokuments.',
  computedResult: computed,
  hasTabularAttachment: true,
  ...withSources,
  ...twoDocuments,
  synthesisMode: 'table',
  searchSources: ['web', 'notebook'],
  notebookCollectionIds: ['nb-1'],
  searchErrors: [{ source: 'web', message: 'timeout' }],
  injectionSuspected: true,
  degradationNotes: [{ code: 'compute_failed', modelHint: 'Berechnung fehlgeschlagen' }],
  userLocale: 'de-AT',
  clientPlatform: 'app',
  messages: [{ role: 'user', content: GELTUNGSFRAGE }],
};

const pinnedTransfer = {
  pipelineSourceText: 'Der Gemeinderat hat beschlossen …',
  attachmentContext: '### Alt.pdf\n\nAlter Anhang, muss schweigen.',
  currentDocument: { id: 'doc-1', title: 'Doc', markdown: 'Inhalt', selectionText: null },
  documentMentionContext: 'Referenz, muss schweigen.',
  threadAttachments: [
    { ...protokoll, id: 'att-2', name: 'P.pdf', extractedText: 'Früherer Anhang, muss schweigen.' },
  ],
};

const withAgentDefaultRecipe = {
  agentConfig: {
    identifier: 'gruenerator-universal',
    systemRole: ROLE,
    userId: 'u-1',
    inlineSourceLinks: false,
    defaultRecipeMention: 'instagram',
  },
};

const hessenRow: TextForm = {
  id: 'row-hessen',
  mention: 'presse-hessen-partei',
  kind: 'recipe',
  textType: 'presse',
  title: 'Mein Hessen-Stil',
  styleBlock: '<<GELERNTER STIL>>',
};

type Case = {
  name: string;
  state: ChatGraphState;
  opts?: { retrievalExpected?: boolean };
  setup?: () => void;
};

const GOLDEN_CASES: readonly Case[] = [
  { name: 'leerer zustand', state: makeState() },
  { name: 'mit quellen', state: makeState({ intent: 'search', ...withSources } as never) },
  {
    name: 'mit quellen und contentType (polished)',
    state: makeState({
      intent: 'produktion',
      contentType: 'pressemitteilung',
      ...withSources,
    } as never),
  },
  {
    name: 'mit suchfehler ohne treffer',
    state: makeState({
      intent: 'search',
      searchQuery: 'tempolimit',
      searchSources: ['web'],
      searchErrors: [{ source: 'web', message: 'timeout' }],
    } as never),
  },
  {
    name: 'mit anhaengen',
    state: makeState({
      attachmentContext: '### Antrag.pdf\n\nDer Antrag fordert ein Tempolimit.',
      threadAttachments: [protokoll],
    } as never),
  },
  {
    name: 'mit bildern und bearbeitungsbeschreibung',
    state: makeState({
      imageAttachments: [{ name: 'plakat.png', data: '', mimeType: 'image/png' }],
      imageEditDescriptions: { original: 'Grauer Himmel', edited: 'Himmel blauer' },
    } as never),
  },
  {
    name: 'mit board',
    state: makeState({ boardContext: 'Spalte To Do: Karte „Antrag schreiben"' }),
  },
  { name: 'mit tabelle', state: makeState({ sheetContext: '| A1 | B1 |' }) },
  {
    name: 'mit offenem canvas',
    state: makeState({
      currentCanvas: { template: 'Sharepic', text: 'Klimaschutz jetzt' },
    } as never),
  },
  {
    name: 'mit notebook',
    state: makeState({
      intent: 'search',
      notebookCollectionIds: ['nb-1'],
      ...withSources,
      searchSources: ['notebook'],
    } as never),
  },
  {
    name: 'mehrere dokumente (vergleich)',
    state: makeState({
      intent: 'search',
      ...withSources,
      ...twoDocuments,
      synthesisMode: 'table',
    } as never),
  },
  {
    name: 'gedaechtnis mit profil',
    state: makeState({
      userInstructions: 'Immer in der Sie-Form.',
      memoryContext: '### Dauerhafte Anweisungen\nNr. 1 (01.09.2026): Ab jetzt duzen.',
    }),
  },
  { name: 'gedaechtnis ohne profil', state: makeState({ memoryContext: 'Mag kurze Antworten.' }) },
  {
    name: 'fruehere gespraeche',
    state: makeState({ chatHistoryContext: '## FRÜHERE GESPRÄCHE\n\nVerkehr.' }),
  },
  {
    name: 'geltungsfrage',
    state: makeState({ messages: [{ role: 'user', content: GELTUNGSFRAGE }] } as never),
  },
  { name: 'locale de-AT', state: makeState({ userLocale: 'de-AT' } as never) },
  { name: 'plattform app', state: makeState({ clientPlatform: 'app' } as never) },
  {
    name: 'visuelle bausteine (client zeichnet alle)',
    state: makeState({ visualBlocks: [...VISUAL_BLOCK_KINDS] }),
  },
  {
    // Das Rezept gibt die Form vor — der Katalog bleibt draußen.
    name: 'visuelle bausteine entfallen bei aktivem rezept',
    state: makeState({ visualBlocks: [...VISUAL_BLOCK_KINDS], activeSkillMention: 'instagram' }),
  },
  {
    name: 'degradierter turn',
    state: makeState({
      degradationNotes: [{ code: 'compute_failed', modelHint: 'Berechnung fehlgeschlagen' }],
    } as never),
  },
  {
    name: 'berechnung mit tabellenanhang',
    state: makeState({
      intent: 'compute',
      computedResult: computed,
      computedResultFresh: true,
      hasTabularAttachment: true,
    } as never),
  },
  {
    name: 'artefakte (frueher + frisch)',
    state: makeState({
      intent: 'image',
      threadArtifacts: [{ kind: 'sheet', ref: 'd1', label: 'Quartalszahlen' }],
      generatedImage: { url: 'https://x/y.png', prompt: 'Windrad' },
      imagePrompt: 'Windrad',
    } as never),
  },
  {
    name: 'intent greeting',
    state: makeState({
      intent: 'greeting',
      messages: [{ role: 'user', content: 'Hallo!' }],
    } as never),
  },
  {
    name: 'intent edit_current_doc',
    state: makeState({
      intent: 'edit_current_doc',
      messages: [{ role: 'user', content: 'Kürze den ersten Absatz' }],
      currentDocument: {
        id: 'doc-1',
        title: null,
        markdown: '# Antrag\n\nEin langer Absatz.',
        selectionText: null,
      },
    } as never),
  },
  { name: 'intent image_edit fehlgeschlagen', state: makeState({ intent: 'image_edit' } as never) },
  {
    name: 'direct mit mitgetragenen quellen',
    state: makeState({ intent: 'direct', sourcesCarriedFromThread: true, ...withSources } as never),
  },
  {
    name: 'direct mit verbotener artefakt-aktion',
    state: makeState({ intent: 'direct', forbiddenArtifactAction: 'edit_document' } as never),
  },
  { name: 'komplexe frage', state: makeState({ complexity: 'complex' } as never) },
  { name: 'aktives rezept (system)', state: makeState({ activeSkillMention: 'instagram' }) },
  {
    name: 'aktives rezept (agenten-standard, write-eligible)',
    state: makeState(withAgentDefaultRecipe as never),
  },
  {
    name: 'agenten-standard entfaellt bei plauderei',
    state: makeState({
      ...withAgentDefaultRecipe,
      messages: [{ role: 'user', content: 'Danke dir!' }],
    } as never),
  },
  {
    name: 'rezept ohne mitgelieferten text (fehlt)',
    state: makeState({ activeSkillMention: 'gibt-es-nicht' }),
  },
  {
    name: 'angelernte textform ersetzt den system-rezepttext',
    state: makeState({
      activeSkillMention: 'presse-hessen-partei',
      agentConfig: { ...withAgentDefaultRecipe.agentConfig, defaultRecipeMention: null },
    } as never),
    setup: () => getTextFormForInjection.mockResolvedValue(hessenRow),
  },
  {
    name: 'angelernte textform ohne systemrezept',
    state: makeState({
      activeSkillMention: 'mein-newsletter',
      agentConfig: { ...withAgentDefaultRecipe.agentConfig, defaultRecipeMention: null },
    } as never),
    setup: () =>
      getTextFormForInjection.mockResolvedValue({
        ...hessenRow,
        id: 'row-newsletter',
        mention: 'mein-newsletter',
        title: 'Mein Newsletter',
      }),
  },
  {
    name: 'gepinntes rezept per id',
    state: makeState({
      activeRecipeId: 'row-hessen',
      agentConfig: { ...withAgentDefaultRecipe.agentConfig, defaultRecipeMention: null },
    } as never),
    setup: () => getTextFormForInjectionById.mockResolvedValue(hessenRow),
  },
  { name: 'voller materialstapel', state: makeState(fullMaterial as never) },
  {
    name: 'voller materialstapel mit rezept und agentischem loop',
    state: makeState({ ...fullMaterial, activeSkillMention: 'instagram' } as never),
    opts: { retrievalExpected: true },
  },
  { name: 'pipeline-uebertragung (pinned)', state: makeState(pinnedTransfer as never) },
  {
    name: 'neutraler zusammenfassungs-turn',
    state: makeState({
      intent: 'summary',
      summaryContext: 'Kurzfassung des Dokuments.',
      activeSkillMention: 'instagram',
      agentConfig: { ...withAgentDefaultRecipe.agentConfig },
    } as never),
  },
  {
    name: 'produkt-metafrage',
    state: makeState({ messages: [{ role: 'user', content: 'Was kannst du?' }] } as never),
  },
  {
    name: 'doku-hilfefrage per gepinntem werkzeug',
    state: makeState({ mentionPinnedTool: 'gruenerator_docs_search' } as never),
  },
  {
    name: 'retrievalExpected (agentischer loop)',
    state: makeState(withAgentDefaultRecipe as never),
    opts: { retrievalExpected: true },
  },
  {
    name: 'custom system prompt — duenn',
    state: makeState({ customSystemPrompt: CUSTOM_ROLE }),
  },
  {
    name: 'custom system prompt — mit quellen',
    state: makeState({
      customSystemPrompt: CUSTOM_ROLE,
      intent: 'search',
      ...withSources,
    } as never),
  },
  {
    name: 'custom system prompt — voller materialstapel',
    state: makeState({
      ...fullMaterial,
      customSystemPrompt: CUSTOM_ROLE,
      activeSkillMention: 'instagram',
    } as never),
  },
  {
    name: 'custom system prompt — pipeline-uebertragung (pinned)',
    state: makeState({ ...pinnedTransfer, customSystemPrompt: CUSTOM_ROLE } as never),
  },
  {
    name: 'custom system prompt — agenten-standard gilt nicht',
    state: makeState({ ...withAgentDefaultRecipe, customSystemPrompt: CUSTOM_ROLE } as never),
  },
  {
    name: 'custom system prompt — produkt-metafrage und doku-karte',
    state: makeState({
      customSystemPrompt: CUSTOM_ROLE,
      mentionPinnedTool: 'gruenerator_docs_search',
      messages: [{ role: 'user', content: 'Was kannst du?' }],
    } as never),
  },
  {
    name: 'custom system prompt — gepinntes rezept per id',
    state: makeState({
      customSystemPrompt: CUSTOM_ROLE,
      activeRecipeId: 'row-hessen',
      agentConfig: { ...withAgentDefaultRecipe.agentConfig, defaultRecipeMention: null },
    } as never),
    setup: () => getTextFormForInjectionById.mockResolvedValue(hessenRow),
  },
  {
    name: 'composer-bypass',
    state: makeState({
      intent: 'pressemitteilung_examples',
      responseText: 'WÖRTLICH DURCHGEREICHTER COMPOSER-PROMPT',
    } as never),
  },
];

/**
 * Der Zusammenbau plus seine Nebenwirkungen: `usedRecipes` landet auf dem
 * Zustand (Abzeichenzeile), die Formatregel schreibt ihre Entscheidung ins
 * Journal. Beides gehört zum Vertrag — ein Umbau darf es weder verlieren noch
 * verdoppeln.
 */
async function runGoldenCase(testCase: Case) {
  testCase.setup?.();
  const state = structuredClone(testCase.state);
  const journal = createDecisionJournal();
  const prompt = await runWithDecisionJournal(journal, () =>
    buildSystemMessage(state, testCase.opts ?? {})
  );
  return {
    prompt,
    usedRecipes: state.usedRecipes ?? null,
    decisions: journal.entries.map((e) => `${e.point}=${e.chose}`),
  };
}

describe('buildSystemMessage — Golden', () => {
  for (const testCase of GOLDEN_CASES) {
    it(testCase.name, async () => {
      const { prompt, ...sideEffects } = await runGoldenCase(testCase);
      expect(prompt).toMatchSnapshot('prompt');
      expect(sideEffects).toMatchSnapshot('nebenwirkungen');
    });
  }
});

describe('Blockliste — Auswahl und Reihenfolge', () => {
  async function active(testCase: Case) {
    testCase.setup?.();
    return activePromptBlocks(structuredClone(testCase.state), testCase.opts ?? {});
  }

  it('vergibt jede id genau einmal', () => {
    expect(new Set(PROMPT_BLOCK_ORDER).size).toBe(PROMPT_BLOCK_ORDER.length);
  });

  // Ein Block, den kein Golden-Fall füllt, ist durch den Golden-Test nicht
  // gedeckt: ein leerer Block rendert `''` — auch im falschen Zweig oder an der
  // falschen Stelle. Wer einen Block ergänzt, braucht deshalb einen Fall dazu.
  it('füllt jeden Block in mindestens einem Golden-Fall jedes seiner Zweige', async () => {
    const seen = { default: new Set<string>(), custom: new Set<string>() };
    for (const testCase of GOLDEN_CASES) {
      const branch = testCase.state.customSystemPrompt ? 'custom' : 'default';
      for (const id of await active(testCase)) seen[branch].add(id);
    }
    const customOnly = [
      'custom-system-prompt',
      'custom-citation-instruction',
      'custom-integrity-rule',
    ];
    const defaultOnly = [
      'system-role',
      'degradation-notes',
      'product-identity',
      'product-knowledge',
      'docs-page-map',
      'intent-guidance',
      'pipeline-source-text',
      'answer-rules',
      'visual-blocks',
      'citation-instruction',
    ];
    const missing = PROMPT_BLOCK_ORDER.flatMap((id) => [
      ...(customOnly.includes(id) || seen.default.has(id) ? [] : [`default:${id}`]),
      ...(defaultOnly.includes(id) || seen.custom.has(id) ? [] : [`custom:${id}`]),
    ]);
    expect(missing).toEqual([]);
  });

  // Die Reihenfolge steht in PROMPT_BLOCKS und nirgends sonst. Kein Zustand
  // darf sie umordnen — er darf nur auslassen.
  it('ist für jeden Zustand eine Teilfolge der Registry-Reihenfolge', async () => {
    for (const testCase of GOLDEN_CASES) {
      const positions = (await active(testCase)).map((id) => PROMPT_BLOCK_ORDER.indexOf(id));
      expect(positions, testCase.name).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it('liefert für den leeren Zustand genau diese Blöcke', async () => {
    expect(await activePromptBlocks(makeState())).toEqual([
      'system-role',
      'datum',
      'product-identity',
      'user-instructions',
      'intent-guidance',
      'answer-rules',
    ]);
  });

  it('baut beim Composer-Bypass gar nichts zusammen', async () => {
    const state = makeState({
      intent: 'pressemitteilung_examples',
      responseText: 'WÖRTLICH',
    } as never);
    expect(await activePromptBlocks(state)).toEqual([]);
    expect(await buildSystemMessage(state)).toBe('WÖRTLICH');
  });

  it('lässt im Rollen-Chat die default-eigenen Blöcke aus, auch wenn ihr Material da ist', async () => {
    const ids = await activePromptBlocks(
      makeState({
        ...fullMaterial,
        ...pinnedTransfer,
        customSystemPrompt: CUSTOM_ROLE,
        messages: [{ role: 'user', content: 'Was kannst du?' }],
        mentionPinnedTool: 'gruenerator_docs_search',
      } as never)
    );
    expect(ids[0]).toBe('custom-system-prompt');
    for (const id of [
      'system-role',
      'degradation-notes',
      'product-identity',
      'product-knowledge',
      'docs-page-map',
      'intent-guidance',
      'pipeline-source-text',
      'answer-rules',
      'citation-instruction',
    ]) {
      expect(ids, id).not.toContain(id);
    }
  });

  // Ein Übertragungs-Turn hat genau ein Original — die übrigen Material-Blöcke
  // schweigen, statt danebenzustehen (13.08.2026).
  it('lässt beim Pipeline-Turn die konkurrierenden Material-Blöcke aus', async () => {
    const ids = await activePromptBlocks(makeState(pinnedTransfer as never));
    expect(ids).toContain('pipeline-source-text');
    for (const id of [
      'attachments',
      'current-document',
      'document-mention-context',
      'thread-attachments',
    ]) {
      expect(ids, id).not.toContain(id);
    }
  });

  it('hängt die Hierarchie-Regel nur bei fremdem Material an — im Rollen-Chat immer', async () => {
    expect(await activePromptBlocks(makeState())).not.toContain('instruction-hierarchy');
    expect(
      await activePromptBlocks(makeState({ attachmentContext: '### A.pdf\n\nInhalt.' }))
    ).toContain('instruction-hierarchy');
    expect(await activePromptBlocks(makeState({ memoryContext: 'Duzen.' }))).toContain(
      'instruction-hierarchy'
    );
    expect(await activePromptBlocks(makeState({ customSystemPrompt: CUSTOM_ROLE }))).toContain(
      'instruction-hierarchy'
    );
  });

  // Das Agenten-Standardrezept füllt nur den Einzelpfad; im Loop wählt das
  // Modell selbst über `rezept_laden`, und eine Persona gibt die Form schon vor.
  it('backt das Agenten-Standardrezept weder in den Loop noch in den Rollen-Chat', async () => {
    const state = makeState(withAgentDefaultRecipe as never);
    expect(await activePromptBlocks(state)).toContain('skill-fragment');
    expect(await activePromptBlocks(state, { retrievalExpected: true })).not.toContain(
      'skill-fragment'
    );
    expect(
      await activePromptBlocks(
        makeState({ ...withAgentDefaultRecipe, customSystemPrompt: CUSTOM_ROLE } as never)
      )
    ).not.toContain('skill-fragment');
  });

  it('trägt ein ausdrücklich gewähltes Rezept auch in den Rollen-Chat', async () => {
    expect(
      await activePromptBlocks(
        makeState({ customSystemPrompt: CUSTOM_ROLE, activeSkillMention: 'instagram' })
      )
    ).toContain('skill-fragment');
  });
});

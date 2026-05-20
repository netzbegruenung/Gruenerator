/**
 * Classifier Forced-Intent Tests — Tier 1 (mutation) & Tier 2 (context) priority
 *
 * These tests verify that the classifierNode correctly routes when
 * multiple resource types are present simultaneously (boards + docs + images).
 *
 * The forced-intent checks return BEFORE hitting the LLM, so aiWorkerPool
 * is stubbed but never called.
 *
 * Run with: pnpm --filter @gruenerator/api test -- classifierForcedIntent
 */

import { describe, it, expect } from 'vitest';

import { classifierNode } from './classifierNode.js';
import type { ChatGraphState, SearchIntent } from '../types.js';

// ── Test helpers ─────────────────────────────────────────────────────────

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

/** Build a minimal ChatGraphState with overrides for the fields under test. */
function buildState(overrides: Partial<ChatGraphState> & { userMessage: string }): ChatGraphState {
  const { userMessage, ...rest } = overrides;
  return {
    messages: [{ role: 'user' as const, content: userMessage }],
    threadId: null,
    agentConfig: STUB_AGENT_CONFIG,
    enabledTools: {
      search: true,
      web: true,
      person: true,
      examples: true,
      research: true,
      image: true,
      image_edit: true,
    },
    aiWorkerPool: null as any,
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
    ...rest,
  } as ChatGraphState;
}

// ── TIER 1: Mutation intents ─────────────────────────────────────────────

describe('Tier 1 — mutation intents (resource + keywords)', () => {
  it('board + "vereinfache" → modify_board', async () => {
    const state = buildState({
      userMessage: 'kannst du dieses board vereinfachen?',
      boardIds: ['board-123'],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('modify_board');
  });

  it('board + "fuege Aufgabe hinzu" → modify_board', async () => {
    const state = buildState({
      userMessage: 'fuege eine neue Aufgabe hinzu',
      boardIds: ['board-456'],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('modify_board');
  });

  it('board + "loesch" → modify_board', async () => {
    const state = buildState({
      userMessage: 'loesch die erledigten Eintraege',
      boardIds: ['board-789'],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('modify_board');
  });

  it('board + "sortier" → modify_board', async () => {
    const state = buildState({
      userMessage: 'sortier die Aufgaben nach Prioritaet',
      boardIds: ['board-abc'],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('modify_board');
  });

  it('doc + "ergaenze" → modify_doc', async () => {
    const state = buildState({
      userMessage: 'ergaenze den Abschnitt ueber Klimaschutz',
      docMentionIds: ['doc-123'],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('modify_doc');
  });

  it('doc + "kuerz" → modify_doc', async () => {
    const state = buildState({
      userMessage: 'kuerz den Text auf die Haelfte',
      docMentionIds: ['doc-456'],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('modify_doc');
  });

  it('doc + "umschreib" → modify_doc', async () => {
    const state = buildState({
      userMessage: 'umschreib den letzten Absatz',
      docMentionIds: ['doc-789'],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('modify_doc');
  });

  it('doc + "ersetz" → modify_doc', async () => {
    const state = buildState({
      userMessage: 'ersetze den ersten Absatz durch eine Einleitung',
      docMentionIds: ['doc-ersetz'],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('modify_doc');
  });

  it('doc + umlaut "ändere" → modify_doc (umlaut handled)', async () => {
    const state = buildState({
      userMessage: 'ändere den Titel auf "Mobilitätswende"',
      docMentionIds: ['doc-umlaut'],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('modify_doc');
  });
});

// ── TIER 1: edit_current_doc (open document in editor + mutation keywords) ──

const STUB_CURRENT_DOC = {
  id: 'doc-open-1',
  title: 'Antrag',
  markdown: '# Antrag\n\nText.',
  selectionText: null,
};

describe('Tier 1 — edit_current_doc (currentDocument + edit verb)', () => {
  it('currentDocument + "füge … ein" → edit_current_doc (regression: user-reported phrasing)', async () => {
    const state = buildState({
      userMessage: 'füge dies im dokument ein',
      currentDocument: STUB_CURRENT_DOC,
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('edit_current_doc');
  });

  it('currentDocument + "ersetze" → edit_current_doc', async () => {
    const state = buildState({
      userMessage: 'ersetze den ersten Absatz durch eine schärfere Einleitung',
      currentDocument: STUB_CURRENT_DOC,
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('edit_current_doc');
  });

  it('currentDocument + umlaut "ändere" → edit_current_doc (umlaut handled)', async () => {
    const state = buildState({
      userMessage: 'ändere den Titel',
      currentDocument: STUB_CURRENT_DOC,
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('edit_current_doc');
  });

  it('currentDocument + "verbessere" → edit_current_doc', async () => {
    const state = buildState({
      userMessage: 'verbessere die Begründung',
      currentDocument: STUB_CURRENT_DOC,
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('edit_current_doc');
  });

  it('currentDocument + "füge … hinzu" → edit_current_doc (existing phrasing still works)', async () => {
    const state = buildState({
      userMessage: 'füge einen Absatz zur Verkehrswende hinzu',
      currentDocument: STUB_CURRENT_DOC,
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('edit_current_doc');
  });

  it('currentDocument + plain question (no edit verb) → NOT edit_current_doc', async () => {
    const state = buildState({
      userMessage: 'was steht im dokument?',
      currentDocument: STUB_CURRENT_DOC,
    });
    const result = await classifierNode(state);
    expect(result.intent).not.toBe('edit_current_doc');
  });
});

// ── TIER 2: Context intents (resource presence, no mutation keywords) ────

describe('Tier 2 — context intents (resource presence only)', () => {
  it('board without mutation keywords → direct', async () => {
    const state = buildState({
      userMessage: 'was steht auf dem board?',
      boardIds: ['board-123'],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('direct');
  });

  it('doc without mutation keywords → direct', async () => {
    const state = buildState({
      userMessage: 'worum geht es in dem Dokument?',
      docMentionIds: ['doc-123'],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('direct');
  });

  it('image attachment without other context → direct', async () => {
    const state = buildState({
      userMessage: 'was zeigt dieses Bild?',
      imageAttachments: [{ url: 'data:image/png;base64,...', mimeType: 'image/png' }],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('direct');
  });

  it('file attachment + summary request → summary', async () => {
    const state = buildState({
      userMessage: 'fasse die Datei zusammen',
      attachmentContext: 'Inhalt der hochgeladenen Datei...',
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('summary');
  });

  it('file attachment without summary keywords → direct', async () => {
    const state = buildState({
      userMessage: 'was steht in der Datei?',
      attachmentContext: 'Inhalt der hochgeladenen Datei...',
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('direct');
  });
});

// ── EDGE CASES: Multi-resource combinations ──────────────────────────────

describe('Edge cases — multiple resource types combined', () => {
  it('board + image + mutation keyword → modify_board (tier 1 wins)', async () => {
    const state = buildState({
      userMessage: 'vereinfache die Aufgaben auf dem Board',
      boardIds: ['board-123'],
      imageAttachments: [{ url: 'data:image/png;base64,...', mimeType: 'image/png' }],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('modify_board');
  });

  it('board + image + NO mutation keyword → direct (image tier 2 wins)', async () => {
    const state = buildState({
      userMessage: 'was zeigt dieses Bild im Kontext des Boards?',
      boardIds: ['board-123'],
      imageAttachments: [{ url: 'data:image/png;base64,...', mimeType: 'image/png' }],
    });
    const result = await classifierNode(state);
    // No mutation keyword → tier 1 skipped → tier 2: image check fires first
    expect(result.intent).toBe('direct');
  });

  it('board + doc + mutation keyword → modify_board (first tier 1 match)', async () => {
    const state = buildState({
      userMessage: 'strukturier das Board neu',
      boardIds: ['board-123'],
      docMentionIds: ['doc-456'],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('modify_board');
  });

  it('doc + image + mutation keyword → modify_doc (tier 1 wins over image)', async () => {
    const state = buildState({
      userMessage: 'ergaenze das Dokument basierend auf dem Bild',
      docMentionIds: ['doc-123'],
      imageAttachments: [{ url: 'data:image/png;base64,...', mimeType: 'image/png' }],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('modify_doc');
  });

  it('doc + image + NO mutation keyword → direct (image tier 2)', async () => {
    const state = buildState({
      userMessage: 'vergleiche das Bild mit dem Dokument',
      docMentionIds: ['doc-123'],
      imageAttachments: [{ url: 'data:image/png;base64,...', mimeType: 'image/png' }],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('direct');
  });

  it('board + attachment + mutation keyword → modify_board (tier 1 wins over attachment)', async () => {
    const state = buildState({
      userMessage: 'ergaenze das Board mit den Infos aus der Datei',
      boardIds: ['board-123'],
      attachmentContext: 'OCR-extracted content from uploaded file...',
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('modify_board');
  });

  it('board + attachment + NO mutation keyword → direct (attachment tier 2)', async () => {
    const state = buildState({
      userMessage: 'was sagt die Datei zum Board?',
      boardIds: ['board-123'],
      attachmentContext: 'OCR-extracted content...',
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('direct');
  });

  it('board + doc + image + mutation → modify_board (tier 1, board first)', async () => {
    const state = buildState({
      userMessage: 'vereinfache alles',
      boardIds: ['board-123'],
      docMentionIds: ['doc-456'],
      imageAttachments: [{ url: 'data:image/png;base64,...', mimeType: 'image/png' }],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('modify_board');
  });

  it('doc + board (no board keywords, doc keywords) → modify_doc', async () => {
    const state = buildState({
      userMessage: 'kuerz das Dokument',
      boardIds: ['board-123'],
      docMentionIds: ['doc-456'],
    });
    const result = await classifierNode(state);
    // "kuerz" matches docModifyPattern but NOT boardModifyPattern → board tier 1 skipped → doc tier 1 fires
    expect(result.intent).toBe('modify_doc');
  });
});

// ── TIER 2: image_edit ───────────────────────────────────────────────────

describe('Tier 2 — image_edit (edit verb + image signal)', () => {
  it('image attached + "bearbeite" → image_edit', async () => {
    const state = buildState({
      userMessage: 'bearbeite dieses Bild und mach mehr Bäume rein',
      imageAttachments: [{ url: 'data:image/png;base64,...', mimeType: 'image/png' }],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('image_edit');
  });

  it('image attached + "ändere" → image_edit', async () => {
    const state = buildState({
      userMessage: 'ändere die Farbe der Tür',
      imageAttachments: [{ url: 'data:image/png;base64,...', mimeType: 'image/png' }],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('image_edit');
  });

  it('image attached + "transformiere" → image_edit', async () => {
    const state = buildState({
      userMessage: 'transformiere das in Aquarell',
      imageAttachments: [{ url: 'data:image/png;base64,...', mimeType: 'image/png' }],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('image_edit');
  });

  it('no attachment but verb + "Foto" → image_edit (node will ask for attachment)', async () => {
    const state = buildState({
      userMessage: 'bearbeite mein Foto',
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('image_edit');
  });

  it('image attached + plain question (no edit verb) → direct (vision Q&A preserved)', async () => {
    const state = buildState({
      userMessage: 'was siehst du auf diesem Bild?',
      imageAttachments: [{ url: 'data:image/png;base64,...', mimeType: 'image/png' }],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('direct');
  });

  it('"bearbeite den Text" without image attachment or noun → NOT image_edit', async () => {
    const state = buildState({
      userMessage: 'bearbeite den Text und mach ihn kürzer',
    });
    const result = await classifierNode(state);
    expect(result.intent).not.toBe('image_edit');
  });
});

// ── Summary interaction ──────────────────────────────────────────────────

describe('Summary intent interactions', () => {
  it('documents + "fasse zusammen" → summary (even with board present)', async () => {
    const state = buildState({
      userMessage: 'fasse das Dokument zusammen',
      documentIds: ['datei-123'],
      boardIds: ['board-456'],
    });
    const result = await classifierNode(state);
    // No board mutation keywords → tier 1 skipped
    // hasAnyDocuments (documentIds) + summaryPattern → summary
    expect(result.intent).toBe('summary');
  });

  it('attachment + "zusammenfassung" → summary', async () => {
    const state = buildState({
      userMessage: 'erstelle eine Zusammenfassung',
      attachmentContext: 'Langer Dokumentinhalt...',
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('summary');
  });
});

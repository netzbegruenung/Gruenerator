/**
 * Classifier Forced-Intent Tests — Tier 1 (mutation) & Tier 2 (context) priority
 *
 * These tests verify that the classifierNode correctly routes when
 * multiple resource types are present simultaneously (boards + docs + images).
 *
 * The forced-intent checks return BEFORE hitting the LLM, so the model door
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
  it('board without mutation keywords → produktion', async () => {
    const state = buildState({
      userMessage: 'was steht auf dem board?',
      boardIds: ['board-123'],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('produktion');
  });

  it('doc without mutation keywords → produktion', async () => {
    const state = buildState({
      userMessage: 'worum geht es in dem Dokument?',
      docMentionIds: ['doc-123'],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('produktion');
  });

  it('image attachment without other context → produktion', async () => {
    const state = buildState({
      userMessage: 'was zeigt dieses Bild?',
      imageAttachments: [{ url: 'data:image/png;base64,...', mimeType: 'image/png' }],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('produktion');
  });

  it('file attachment + summary request → summary', async () => {
    const state = buildState({
      userMessage: 'fasse die Datei zusammen',
      attachmentContext: 'Inhalt der hochgeladenen Datei...',
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('summary');
  });

  it('file attachment without summary keywords → produktion', async () => {
    const state = buildState({
      userMessage: 'was steht in der Datei?',
      attachmentContext: 'Inhalt der hochgeladenen Datei...',
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('produktion');
  });

  it('file attachment + agent default notebook collections → search', async () => {
    const state = buildState({
      userMessage: 'Antworte auf diese E-Mail einer Bürgerin:',
      attachmentContext:
        'Sehr geehrte Damen und Herren, wie steht Ihre Partei zur Stadtentwicklung in Pankow?',
      defaultNotebookCollectionIds: ['berlin'],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('search');
    expect(result.searchQuery).not.toBeNull();
  });

  it('file attachment + default notebook document ids → search', async () => {
    const state = buildState({
      userMessage: 'was steht dazu in unseren Beschlüssen?',
      attachmentContext: 'Inhalt der hochgeladenen Datei...',
      defaultNotebookDocumentIds: ['nb-doc-1'],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('search');
  });

  it('file attachment + default notebook + summary keywords → summary (tier 2 wins)', async () => {
    const state = buildState({
      userMessage: 'fasse die Datei zusammen',
      attachmentContext: 'Inhalt der hochgeladenen Datei...',
      defaultNotebookCollectionIds: ['berlin'],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('summary');
  });

  // Live on beta 20.08.2026: "schreibe darauf basierend einen antrag für mehr
  // hitzeschtutz für alfter" came back as a sourced research answer. Forcing
  // `search` is right — a notebook-bound agent must research before it writes —
  // but nothing carried the ordered Textsorte through to the answer stage.
  describe('an ordered Textsorte survives the forced search', () => {
    it('names the document type while still routing to search', async () => {
      const state = buildState({
        userMessage: 'schreibe darauf basierend einen Antrag für mehr Hitzeschutz für Alfter',
        attachmentContext: 'Die Grünen fordern ein Abkühl-Sofortprogramm...',
        defaultNotebookCollectionIds: ['berlin'],
      });
      const result = await classifierNode(state);
      // The research stage must still run.
      expect(result.intent).toBe('search');
      expect(result.searchQuery).not.toBeNull();
      // …and the answer stage now knows what it owes.
      expect(result.documentSubtype).toBe('antrag');
    });

    // The guard against a too-broad predicate: this names no Textsorte, so it
    // has to behave exactly as it did before.
    it('leaves a plain reply request untouched', async () => {
      const state = buildState({
        userMessage: 'Antworte auf diese E-Mail einer Bürgerin:',
        attachmentContext:
          'Sehr geehrte Damen und Herren, wie steht Ihre Partei zur Stadtentwicklung in Pankow?',
        defaultNotebookCollectionIds: ['berlin'],
      });
      const result = await classifierNode(state);
      expect(result.intent).toBe('search');
      expect(result.documentSubtype).toBeUndefined();
    });

    // Die Textsorte haengt am erzwungenen Suchpfad, nicht am Anhang-Zweig.
    // Sie war zuerst an genau EINER der sechs Aufrufstellen verdrahtet — die
    // uebrigen fuenf erzwingen dieselbe Suche und sind die haeufigeren Wege.
    it.each([
      ['@notebook', { notebookIds: ['nb-1'] }],
      ['@document', { documentIds: ['doc-1'] }],
      ['@dokumentchat', { documentChatIds: ['dc-1'] }],
    ] as const)('names the document type on the %s path too', async (_label, mention) => {
      const state = buildState({
        userMessage: 'schreibe darauf basierend einen Antrag für mehr Hitzeschutz',
        ...mention,
      });
      const result = await classifierNode(state);
      expect(result.intent).toBe('search');
      expect(result.documentSubtype).toBe('antrag');
    });
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

  it('board + image + NO mutation keyword → produktion (image tier 2 wins)', async () => {
    const state = buildState({
      userMessage: 'was zeigt dieses Bild im Kontext des Boards?',
      boardIds: ['board-123'],
      imageAttachments: [{ url: 'data:image/png;base64,...', mimeType: 'image/png' }],
    });
    const result = await classifierNode(state);
    // No mutation keyword → tier 1 skipped → tier 2: image check fires first
    expect(result.intent).toBe('produktion');
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

  it('doc + image + NO mutation keyword → produktion (image tier 2)', async () => {
    const state = buildState({
      userMessage: 'vergleiche das Bild mit dem Dokument',
      docMentionIds: ['doc-123'],
      imageAttachments: [{ url: 'data:image/png;base64,...', mimeType: 'image/png' }],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('produktion');
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

  it('board + attachment + NO mutation keyword → produktion (attachment tier 2)', async () => {
    const state = buildState({
      userMessage: 'was sagt die Datei zum Board?',
      boardIds: ['board-123'],
      attachmentContext: 'OCR-extracted content...',
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('produktion');
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

  it('image attached + plain question (no edit verb) → produktion (vision Q&A preserved)', async () => {
    const state = buildState({
      userMessage: 'was siehst du auf diesem Bild?',
      imageAttachments: [{ url: 'data:image/png;base64,...', mimeType: 'image/png' }],
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('produktion');
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

describe('Tier 2.7 — follow-up on the thread last artifact (lastToolContext)', () => {
  it('document context + "Kürze die Begründung" → modify_doc targeting the ref', async () => {
    const state = buildState({
      userMessage: 'Kürze die Begründung auf die Hälfte',
      lastToolContext: { kind: 'document', ref: 'doc-created-1' },
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('modify_doc');
    expect(result.docMentionIds).toContain('doc-created-1');
  });

  it('document context + a plain question → NOT modify_doc (meta/question guard)', async () => {
    const state = buildState({
      userMessage: 'Worum ging es in dem Dokument nochmal?',
      lastToolContext: { kind: 'document', ref: 'doc-created-1' },
    });
    const result = await classifierNode(state);
    expect(result.intent).not.toBe('modify_doc');
  });

  it('an OPEN document wins over lastToolContext (edit_current_doc)', async () => {
    const state = buildState({
      userMessage: 'kürze die Begründung',
      currentDocument: STUB_CURRENT_DOC,
      lastToolContext: { kind: 'document', ref: 'doc-created-1' },
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('edit_current_doc');
  });

  it('an explicit @-mention wins over lastToolContext', async () => {
    const state = buildState({
      userMessage: 'kürze den Text',
      docMentionIds: ['doc-mentioned-9'],
      lastToolContext: { kind: 'document', ref: 'doc-created-1' },
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('modify_doc');
  });

  it('image context + "Nochmal, aber abends mit warmem Licht" → image_edit', async () => {
    const state = buildState({
      userMessage: 'Nochmal, aber abends mit warmem Licht',
      lastToolContext: { kind: 'image' },
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('image_edit');
  });

  it('image context + "mach es blauer" → image_edit', async () => {
    const state = buildState({
      userMessage: 'mach es blauer',
      lastToolContext: { kind: 'image' },
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('image_edit');
  });

  it('image context + "Erklär nochmal, warum du diese Farben gewählt hast" → NOT image_edit', async () => {
    const state = buildState({
      userMessage: 'Erklär nochmal, warum du diese Farben gewählt hast',
      lastToolContext: { kind: 'image' },
    });
    const result = await classifierNode(state);
    expect(result.intent).not.toBe('image_edit');
  });

  it('no lastToolContext + "Nochmal, aber abends" → NOT image_edit (gate needs context)', async () => {
    const state = buildState({ userMessage: 'Nochmal, aber abends mit warmem Licht' });
    const result = await classifierNode(state);
    expect(result.intent).not.toBe('image_edit');
  });

  // ── mcp branch: re-scope a vague follow-up to the thread's last connector ──
  it('mcp context + anaphoric "zeig mir das nochmal" → mcp targeting the scope', async () => {
    const state = buildState({
      userMessage: 'zeig mir das nochmal',
      lastToolContext: { kind: 'mcp', ref: 'server-tally-1', label: 'Tally' },
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('mcp');
    expect(result.mcpServerScope).toBe('server-tally-1');
  });

  it('mcp context + a NEW knowledge question with article "das" → NOT mcp', async () => {
    const state = buildState({
      userMessage: 'erkläre mir das Grundeinkommen',
      lastToolContext: { kind: 'mcp', ref: 'server-tally-1', label: 'Tally' },
    });
    const result = await classifierNode(state);
    // "das" is an article here, not anaphora — must not hijack to the connector.
    expect(result.intent).not.toBe('mcp');
  });

  it('mcp context + action verb "erstelle noch eins" → mcp', async () => {
    const state = buildState({
      userMessage: 'erstelle noch eins',
      lastToolContext: { kind: 'mcp', ref: 'server-tally-1', label: 'Tally' },
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('mcp');
    expect(result.mcpServerScope).toBe('server-tally-1');
  });

  it('mcp context + "versuchs nochmal über mcp" → mcp', async () => {
    const state = buildState({
      userMessage: 'versuchs nochmal über mcp',
      lastToolContext: { kind: 'mcp', ref: 'server-tally-1', label: 'Tally' },
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('mcp');
  });

  it('mcp context + "erstelle ein Sharepic dazu" → NOT mcp (own-artifact wins)', async () => {
    const state = buildState({
      userMessage: 'erstelle ein Sharepic dazu',
      lastToolContext: { kind: 'mcp', ref: 'server-tally-1', label: 'Tally' },
    });
    const result = await classifierNode(state);
    expect(result.intent).not.toBe('mcp');
  });

  it('mcp context + verb-less imperative "denk dir ein muster aus" → mcp', async () => {
    const state = buildState({
      userMessage: 'denk dir ein muster kontaktformular aus',
      lastToolContext: { kind: 'mcp', ref: 'server-tally-1', label: 'Tally' },
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('mcp');
    expect(result.mcpServerScope).toBe('server-tally-1');
  });

  it('mcp context + "los, erstellen" → mcp', async () => {
    const state = buildState({
      userMessage: 'los, erstellen',
      lastToolContext: { kind: 'mcp', ref: 'server-tally-1', label: 'Tally' },
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('mcp');
  });

  it('mcp context + clause-final anaphora "wo ist das?" → mcp', async () => {
    const state = buildState({
      userMessage: 'wo ist das?',
      lastToolContext: { kind: 'mcp', ref: 'server-tally-1', label: 'Tally' },
    });
    const result = await classifierNode(state);
    expect(result.intent).toBe('mcp');
  });

  it('mcp context + first-person comment "ich finde die Idee gut" → NOT mcp', async () => {
    const state = buildState({
      userMessage: 'ich finde die Idee gut',
      lastToolContext: { kind: 'mcp', ref: 'server-tally-1', label: 'Tally' },
    });
    const result = await classifierNode(state);
    expect(result.intent).not.toBe('mcp');
  });

  it('mcp context + pure ack "danke!" → NOT mcp', async () => {
    const state = buildState({
      userMessage: 'danke!',
      lastToolContext: { kind: 'mcp', ref: 'server-tally-1', label: 'Tally' },
    });
    const result = await classifierNode(state);
    expect(result.intent).not.toBe('mcp');
  });
});

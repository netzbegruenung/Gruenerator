import { describe, it, expect, vi } from 'vitest';

/** `keine` heisst bei jedem der kleinen Auflöser „ich entscheide hier nichts". */
const executeProvider = vi.fn(async () => ({ content: 'keine' }));
vi.mock('../../../../services/ai/execution/index.js', () => ({
  executeProvider: (...args: unknown[]) => executeProvider(...args),
}));
// Die Seitenleiste fragt bei Formulierungen ohne Bearbeitungsverb ein kleines
// Modell. Hier sagt es „edit" — geprüft wird, dass Tier 1 den Turn nimmt,
// bevor der Adressat von Tier 2.7 überhaupt gefragt wird.
vi.mock('./docsIntentTiebreak.js', () => ({
  classifyDocsIntentTiebreak: async () => 'edit',
}));

const { classifierNode } = await import('./classifierNode.js');

import type { ChatGraphState, SearchIntent } from '../types.js';

/**
 * Folgeaufträge auf ein Dokument oder eine Tabelle aus dem Chat (#3941).
 *
 * `last_tool_context` überschreibt erst das nächste Artefakt, und
 * `DOC_MODIFY_PATTERN` feuert auf einzelne Verben. Zehn Turns nach einem
 * Dokument wurde „Verbesser meine Formulierung: …" deshalb zu `modify_doc` auf
 * das alte Dokument. Jetzt braucht Tier 2.7 einen Adressaten: das Artefakt kam
 * im Turn davor, oder der Auftrag nennt es. Das offene Dokument (Seitenleiste,
 * Dokument-Chat) entscheidet schon Tier 1 — das zeigen die letzten Fälle.
 */

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

function buildState(overrides: Partial<ChatGraphState> & { userMessage: string }): ChatGraphState {
  const { userMessage, ...rest } = overrides;
  return {
    messages: [{ role: 'user' as const, content: userMessage }],
    threadId: 'thread-1',
    agentConfig: STUB_AGENT_CONFIG,
    enabledTools: { search: true, web: true },
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
    docMentionIds: [],
    sheetIds: [],
    boardIds: [],
    currentDocument: null,
    intent: 'direct' as SearchIntent,
    searchSources: [],
    searchQuery: null,
    ...rest,
  } as unknown as ChatGraphState;
}

const DOC = { kind: 'document' as const, ref: 'doc-1', label: 'Antrag Radverkehr' };
const SHEET = { kind: 'sheet' as const, ref: 'sheet-1', label: 'Budget 2026' };

describe('Tier 2.7 — Dokument-Folgeauftrag braucht einen Adressaten', () => {
  it.each(['kürz den zweiten Absatz', 'ergänz einen Abschnitt zu Kosten'])(
    'direkt nach dem Dokument: „%s" → modify_doc',
    async (text) => {
      const result = await classifierNode(
        buildState({ userMessage: text, lastToolContext: DOC, lastTurnEditables: ['document'] })
      );
      expect(result.intent).toBe('modify_doc');
      expect(result.docMentionIds).toEqual(['doc-1']);
    }
  );

  it.each([
    'kürz das Dokument',
    'verbesser den Text im Dokument',
    'kürz den Antrag Radverkehr',
    'Kürze in dem Antrag von vorhin die Begründung auf die Hälfte',
  ])('Turns später, der Auftrag nennt es: „%s" → modify_doc', async (text) => {
    const result = await classifierNode(
      buildState({ userMessage: text, lastToolContext: DOC, lastTurnEditables: [] })
    );
    expect(result.intent).toBe('modify_doc');
  });

  it('zehn Turns später ist „Verbesser meine Formulierung: …" keine Dokumentbearbeitung', async () => {
    const result = await classifierNode(
      buildState({
        userMessage: 'Verbesser meine Formulierung: Wir fordern mehr Radwege.',
        lastToolContext: DOC,
        lastTurnEditables: [],
      })
    );
    expect(result.intent).not.toBe('modify_doc');
  });
});

describe('Tier 2.7 — Tabellen-Folgeauftrag braucht einen Adressaten', () => {
  it('direkt nach der Tabelle: „füg eine Spalte für 2025 hinzu" → edit_sheet', async () => {
    const result = await classifierNode(
      buildState({
        userMessage: 'füg eine Spalte für 2025 hinzu',
        lastToolContext: SHEET,
        lastTurnEditables: ['sheet'],
      })
    );
    expect(result.intent).toBe('edit_sheet');
    expect(result.sheetEditId).toBe('sheet-1');
  });

  it('Turns später, der Auftrag nennt sie: „füg in der Tabelle eine Spalte hinzu" → edit_sheet', async () => {
    const result = await classifierNode(
      buildState({
        userMessage: 'füg in der Tabelle eine Spalte für 2025 hinzu',
        lastToolContext: SHEET,
        lastTurnEditables: [],
      })
    );
    expect(result.intent).toBe('edit_sheet');
  });

  it('nach Zwischen-Turns ist das Füllwort-Entfernen im eigenen Absatz keine Tabellenbearbeitung', async () => {
    const result = await classifierNode(
      buildState({
        userMessage:
          'Entfern bitte die Füllwörter aus meinem Absatz: Wir wollen eigentlich ja im Grunde mehr Busse.',
        lastToolContext: SHEET,
        lastTurnEditables: [],
      })
    );
    expect(result.intent).not.toBe('edit_sheet');
  });
});

describe('Offenes Dokument — die Seitenleiste bleibt, wie sie war', () => {
  const OPEN_DOC = { id: 'doc-1', title: 'Antrag', markdown: 'Text', selectionText: null };

  it.each([
    'Verbesser meine Formulierung: Wir fordern mehr Radwege.',
    'kürz den zweiten Absatz',
    'mach das knackiger',
  ])('„%s" mit offenem Dokument und altem Kontext → edit_current_doc', async (text) => {
    const result = await classifierNode(
      buildState({
        userMessage: text,
        currentDocument: OPEN_DOC,
        lastToolContext: DOC,
        lastTurnEditables: [],
      })
    );
    expect(result.intent).toBe('edit_current_doc');
  });

  it('offene Tabelle: „füg eine Spalte für 2025 hinzu" → edit_current_doc', async () => {
    const result = await classifierNode(
      buildState({
        userMessage: 'füg eine Spalte für 2025 hinzu',
        currentDocument: { id: 'sheet-1', title: 'Budget', markdown: '', selectionText: null },
        lastToolContext: SHEET,
        lastTurnEditables: [],
      })
    );
    expect(result.intent).toBe('edit_current_doc');
  });
});

// Claude-Review #3949: `lastTurnEditables` kennt nur die ART. Mit zwei
// Dokumenten im Thread darf die Modell-Wahl nicht das ältere nehmen und sich
// dabei auf das neuere berufen, das direkt davor entstand.
describe('Tier 2.7 — „direkt davor" gilt nur für genau dieses Dokument', () => {
  const OLD = { kind: 'document' as const, ref: 'doc-old', label: 'Satzung Ortsverband' };
  const NEW = { kind: 'document' as const, ref: 'doc-new', label: 'Antrag Radverkehr' };

  async function classifyWithPick(text: string, pick: string) {
    executeProvider.mockImplementation(async () => ({ content: pick }));
    try {
      return await classifierNode(
        buildState({
          userMessage: text,
          lastToolContext: NEW,
          threadArtifacts: [NEW, OLD],
          lastTurnEditables: ['document'],
        })
      );
    } finally {
      executeProvider.mockImplementation(async () => ({ content: 'keine' }));
    }
  }

  it('die Wahl des älteren Dokuments ist kein Adressat', async () => {
    const result = await classifyWithPick('Kürze die Begründung auf die Hälfte', '2');
    expect(result.docMentionIds ?? []).not.toContain('doc-old');
  });

  it('das Dokument von direkt davor bleibt adressiert', async () => {
    const result = await classifyWithPick('Kürze die Begründung auf die Hälfte', '1');
    expect(result.intent).toBe('modify_doc');
    expect(result.docMentionIds).toEqual(['doc-new']);
  });

  it('nennt der Auftrag das Dokument, zählt auch das ältere', async () => {
    const result = await classifyWithPick('Kürze im Dokument die Begründung auf die Hälfte', '2');
    expect(result.intent).toBe('modify_doc');
    expect(result.docMentionIds).toEqual(['doc-old']);
  });
});

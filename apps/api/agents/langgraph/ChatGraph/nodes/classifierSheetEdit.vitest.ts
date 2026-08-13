import { describe, it, expect, vi } from 'vitest';

import { classifierNode } from './classifierNode.js';

import type { ChatGraphState, SearchIntent } from '../types.js';

/**
 * "in der tabelle die erste zeile fett machen" after a chat-created sheet must
 * edit that sheet, not silently create a second, unrelated one.
 *
 * Live bug, 09.08.2026: create_sheet has no edit counterpart, so a follow-up
 * fell through Tier 2.7 (only 'document'/'image'/'sharepic'/'mcp' branches
 * existed) straight into GenerationScope, whose intent space is creation-only
 * — "tabelle" in the message just re-triggered create_sheet. This suite pins
 * the fix: a 'sheet' branch mirroring the existing 'document' one.
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

function makeWorkerPool() {
  return { processRequest: vi.fn(async () => ({ content: 'keine' })) };
}

function buildState(userMessage: string, overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    messages: [{ role: 'user' as const, content: userMessage }],
    threadId: 'thread-1',
    agentConfig: STUB_AGENT_CONFIG,
    enabledTools: { search: true, web: true },
    aiWorkerPool: makeWorkerPool(),
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
    ...overrides,
  } as unknown as ChatGraphState;
}

const AFTER_SHEET = {
  kind: 'sheet' as const,
  ref: 'sheet-1',
  label: 'Budgetplanung Kreisverband Musterstadt',
};

describe('Tier 2.7 — Folgeauftrag auf die letzte Tabelle', () => {
  it('greift bei einem echten Änderungsauftrag → edit_sheet, nicht create_sheet erneut', async () => {
    const result = await classifierNode(
      buildState('in der tabelle die erste zeile fett machen', { lastToolContext: AFTER_SHEET })
    );
    expect(result.intent).toBe('edit_sheet');
    expect(result.sheetEditId).toBe('sheet-1');
  });

  it('steht still, wenn der Turn eine Tabellenaktion ausschließt', async () => {
    const result = await classifierNode(
      buildState('Mach die erste Zeile fett, aber keine Tabellenaktion', {
        lastToolContext: AFTER_SHEET,
      })
    );
    expect(result.intent).not.toBe('edit_sheet');
  });

  it('greift nicht, wenn die Tabelle bereits im Editor offen ist (currentDocument gewinnt)', async () => {
    // hasCurrentDocument is a different, earlier-gated anchor (edit_current_doc /
    // the agentic loop's own sheet-edit tool) — Tier 2.7 must not double-fire.
    const result = await classifierNode(
      buildState('mach die erste zeile fett', {
        lastToolContext: AFTER_SHEET,
        currentDocument: { id: 'sheet-1', title: 'Budget', markdown: '', selectionText: null },
      })
    );
    expect(result.intent).not.toBe('edit_sheet');
  });

  it('greift nicht, wenn die Nachricht kein Bearbeitungsauftrag ist', async () => {
    const result = await classifierNode(
      buildState('Was ist eigentlich der Unterschied zwischen Bund und Land?', {
        lastToolContext: AFTER_SHEET,
      })
    );
    expect(result.intent).not.toBe('edit_sheet');
  });
});

describe('Tier 2.7 — Chat-Deliverable klebt nicht an der Tabelle', () => {
  // QA 08/2026: nach der (ungewollt) erzeugten Tabelle verlangte der Turn
  // ausdrücklich eine Zusammenfassung in genau zwei Stichpunkten — und bekam
  // stattdessen 7 Sheet-Operationen ohne jeden Antworttext.
  it('„Erstelle eine aktualisierte Zusammenfassung" bleibt eine Chat-Antwort', async () => {
    const result = await classifierNode(
      buildState(
        'Neue Information: Der Termin aus Quelle B wurde bestätigt. Erstelle eine aktualisierte Zusammenfassung in genau zwei Stichpunkten.',
        { lastToolContext: AFTER_SHEET }
      )
    );
    expect(result.intent).not.toBe('edit_sheet');
  });

  it('bleibt edit_sheet, wenn die Zusammenfassung IN die Tabelle soll', async () => {
    const result = await classifierNode(
      buildState('Ergänze in der Tabelle eine Zeile mit einer kurzen Zusammenfassung.', {
        lastToolContext: AFTER_SHEET,
      })
    );
    expect(result.intent).toBe('edit_sheet');
  });
});

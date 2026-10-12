import { describe, it, expect, vi } from 'vitest';

/**
 * Der Klassifikator ruft das Modell über `executeProvider` — nicht mehr über
 * einen `aiClient` im Zustand. Die Attrappe muss deshalb an dieser Tür stehen;
 * eine im Zustand hinterlegte wäre eine, die nichts abfängt: der echte Provider
 * würde versucht, am fehlenden API-Key scheitern und die Entscheidung in eine
 * heuristische Stufe zurückfallen lassen — grün gemeldet, nichts geprüft.
 *
 * `keine` heisst bei jedem der kleinen Auflöser „ich entscheide hier nichts".
 */
const executeProvider = vi.fn(async (..._args: unknown[]) => ({ content: 'keine' }));
vi.mock('../../../../services/ai/execution/index.js', () => ({
  executeProvider: (...args: unknown[]) => executeProvider(...args),
}));

const { classifierNode } = await import('./classifierNode.js');

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

function buildState(userMessage: string, overrides: Partial<ChatGraphState> = {}): ChatGraphState {
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
        lastTurnEditables: ['sheet'],
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
        { lastToolContext: AFTER_SHEET, lastTurnEditables: ['sheet'] }
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

describe('„ja" auf eine Rückfrage zu Tabelle oder Präsentation', () => {
  const thread = (kind: 'sheet' | 'presentation', question: string, answer: string) =>
    buildState(answer, {
      messages: [
        { role: 'user', content: 'Mach Folie 3 kürzer' },
        { role: 'assistant', content: question },
        { role: 'user', content: answer },
      ],
      threadArtifacts: [{ kind, ref: `${kind}-1` }],
    } as Partial<ChatGraphState>);

  it.each(['sheet', 'presentation'] as const)('%s → Werkzeug-Loop statt direct', async (kind) => {
    const result = await classifierNode(
      thread(kind, 'Dabei würden Folien gelöscht. Soll das so passieren?', 'ja')
    );
    expect(result.intent).toBe('agentic');
  });

  it('ohne Rückfrage bleibt ein „ja" beim üblichen Weg', async () => {
    const result = await classifierNode(thread('presentation', 'Erledigt.', 'ja'));
    expect(result.intent).not.toBe('agentic');
  });

  it('ohne Tabelle oder Präsentation im Thread greift die Weiche nicht', async () => {
    const result = await classifierNode(
      buildState('ja', {
        messages: [
          { role: 'assistant', content: 'Soll ich weitermachen?' },
          { role: 'user', content: 'ja' },
        ],
        threadArtifacts: [{ kind: 'sharepic', ref: 'sp' }],
      } as Partial<ChatGraphState>)
    );
    expect(result.intent).not.toBe('agentic');
  });
});

describe('Erstell-Verdikt auf eine vorhandene Tabelle (Live-Test 11.10.2026)', () => {
  const withSheet = (text: string) =>
    buildState(text, {
      messages: [
        { role: 'user', content: 'Erstelle eine Tabelle mit den Städten in Hessen' },
        { role: 'assistant', content: 'Tabelle **"Städte"** wurde erstellt.' },
        { role: 'user', content: text },
      ],
      threadArtifacts: [{ kind: 'sheet', ref: 'sheet-1' }],
    } as Partial<ChatGraphState>);

  it('„Da fehlt noch Marburg in der Tabelle" ändert die Tabelle im Loop, statt eine zweite zu bauen', async () => {
    executeProvider.mockImplementation(async () => ({ content: 'tabelle' }));
    try {
      const result = await classifierNode(withSheet('Da fehlt noch Marburg in der Tabelle'));
      expect(result.intent).toBe('agentic');
    } finally {
      executeProvider.mockImplementation(async () => ({ content: 'keine' }));
    }
  });

  it('hängt nicht am Auflöser: auch bei „keine" bleibt es ein Tabellen-Auftrag im Loop', async () => {
    const result = await classifierNode(withSheet('Da fehlt noch Gießen in der Tabelle'));
    expect(result.intent).toBe('agentic');
    expect(result.artifactEditOrder).toBe(true);
  });

  it('eine ausdrücklich neue Tabelle bleibt eine Erstellung', async () => {
    executeProvider.mockImplementation(async () => ({ content: 'tabelle' }));
    try {
      const result = await classifierNode(
        withSheet('Erstelle noch eine Tabelle mit den Städten in Bayern')
      );
      expect(result.intent).toBe('create_sheet');
    } finally {
      executeProvider.mockImplementation(async () => ({ content: 'keine' }));
    }
  });
});

describe('Auftrag an ein vorhandenes Explainable', () => {
  it('„Erklär im Explainable … einfacher" ändert es, statt ein zweites zu bauen', async () => {
    const result = await classifierNode(
      buildState('Erklär im Explainable den Begriff CO2-Preis noch einfacher', {
        threadArtifacts: [{ kind: 'explainable', ref: 'e1' }],
      } as Partial<ChatGraphState>)
    );
    expect(result.intent).toBe('agentic');
    expect(result.artifactEditOrder).toBe(true);
  });

  it('ohne vorhandenes Explainable greift die Regel nicht', async () => {
    const result = await classifierNode(
      buildState('Erklär im Explainable den Begriff CO2-Preis noch einfacher')
    );
    expect(result.artifactEditOrder).toBeUndefined();
  });
});

describe('„ja" auf eine offene Werkzeug-Rückfrage', () => {
  it('geht in den Loop, auch wenn die Antwort nicht mit „?" endete (live 11.10.2026)', async () => {
    const result = await classifierNode(
      buildState('ja', {
        messages: [
          { role: 'user', content: 'Kürz den ersten Absatz im Dokument' },
          { role: 'assistant', content: 'Hier ist der überarbeitete Antrag: …' },
          { role: 'user', content: 'ja' },
        ],
        lastTurnPendingConfirm: true,
      } as Partial<ChatGraphState>)
    );
    expect(result.intent).toBe('agentic');
    expect(result.artifactEditOrder).toBe(true);
  });
});

describe('Eine Folie ist ein Teil der vorhandenen Präsentation', () => {
  const withDeck = (text: string) =>
    buildState(text, {
      threadArtifacts: [{ kind: 'presentation', ref: 'p1' }],
    } as Partial<ChatGraphState>);

  it('„Füg noch eine Folie zu den Kosten hinzu" ändert das Deck', async () => {
    const result = await classifierNode(withDeck('Füg noch eine Folie zu den Kosten hinzu'));
    expect(result.intent).toBe('agentic');
    expect(result.artifactEditOrder).toBe(true);
  });

  it('eine Frage über Folien ist kein Auftrag', async () => {
    const result = await classifierNode(withDeck('Was macht eine gute Folie aus?'));
    expect(result.artifactEditOrder).toBeUndefined();
  });

  it('„vortragen" ist kein Präsentations-Nomen', async () => {
    const result = await classifierNode(
      withDeck('Füg eine Folie hinzu, die ich morgen vortragen will')
    );
    expect(result.artifactEditOrder).toBe(true);
  });

  it('„Erstelle noch eine Präsentation …" bleibt eine Erstellung', async () => {
    const result = await classifierNode(
      withDeck('Erstelle noch eine Präsentation zur Wärmewende mit fünf Folien')
    );
    expect(result.artifactEditOrder).toBeUndefined();
  });
});

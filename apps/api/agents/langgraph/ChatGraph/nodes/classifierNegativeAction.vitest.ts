import { describe, it, expect, vi } from 'vitest';

import { classifierNode } from './classifierNode.js';

import type { ChatGraphState, SearchIntent } from '../types.js';

/**
 * "Erstelle diesmal kein Dokument" must actually mean it.
 *
 * QA, 28.07.2026: once ONE document existed in a thread, every substantive turn
 * afterwards offered to update it — including turns whose prompt ended in "keine
 * Dokumentaktion". A one-word answer ("Quarantänisiert") escaped; a JSON dump or
 * a short briefing did not. That looked like a length heuristic and wasn't: the
 * turns differ in whether they LOOK like content production, and two paths that
 * had no negation check at all voted on that.
 *
 * The negation guard already existed — `negatedOrMeta` sits at eleven Tier-3
 * fast paths. It sat at the wrong eleven. This suite pins the two paths that
 * actually fire once a thread is going:
 *   1. Tier 2.7 (lastToolContext → modify_doc), purely positive-patterned.
 *   2. The tool-context hint shipped to the LLM tier, a standing nudge toward
 *      the last artifact.
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

/** Neutrale Auflöser-Antwort, damit jedes Dokument-Routing unten nur aus den
 *  deterministischen Stufen stammen kann, um die es hier geht. */
function makeAiClient() {
  return { processRequest: vi.fn(async () => ({ content: 'keine' })) };
}

function buildState(userMessage: string, overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    messages: [{ role: 'user' as const, content: userMessage }],
    threadId: 'thread-1',
    agentConfig: STUB_AGENT_CONFIG,
    enabledTools: { search: true, web: true },
    aiClient: makeAiClient(),
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
    currentDocument: null,
    intent: 'direct' as SearchIntent,
    searchSources: [],
    searchQuery: null,
    ...overrides,
  } as unknown as ChatGraphState;
}

const AFTER_DOC = { kind: 'document' as const, ref: 'doc-1', label: 'Projekt-Pitch' };

describe('Tier 2.7 — Folgeauftrag auf das letzte Dokument', () => {
  it('greift weiterhin bei einem echten Änderungsauftrag', async () => {
    // The control case. Without it a broken guard would look like a passing
    // suite: everything stands down, nothing routes, all assertions green.
    const result = await classifierNode(
      buildState('Kürze die Begründung auf die Hälfte', { lastToolContext: AFTER_DOC })
    );
    expect(result.intent).toBe('modify_doc');
    expect(result.docMentionIds).toEqual(['doc-1']);
  });

  it('steht still, wenn der Turn eine Dokumentaktion ausschließt', async () => {
    for (const msg of [
      'Kürze die Begründung auf die Hälfte, aber keine Dokumentaktion',
      'Überarbeite den Text nur im Chat, nichts speichern',
      'Aktualisiere die Zielgruppe — das Dokument unverändert lassen',
    ]) {
      const result = await classifierNode(buildState(msg, { lastToolContext: AFTER_DOC }));
      expect(result.intent, msg).not.toBe('modify_doc');
    }
  });
});

// GELÖSCHT: „Tool-Kontext-Hinweis an den LLM-Tier".
//
// Der Hinweis war eine Prosa-Zeile im 27k-Prompt („der vorherige Turn arbeitete
// mit der Dokument-Erstellung, vage Folgeaufträge beziehen sich meist darauf"),
// und der Fall darunter prüfte, dass sie neben einem Verbot SCHWEIGT — weil das
// Modell ihr sonst folgte und ein ungefragtes `save_as_doc` als
// `secondaryIntent` lieferte. Prompt und Modell sind weg; das Artefakt-Gedächtnis
// liest jetzt Tier 2.7 direkt aus `lastToolContext`, und dort steht das Verbot
// als `forbidsPersistentAction` im Zweig selbst — geprüft von den beiden Fällen
// oben, deterministisch statt als Formulierung.

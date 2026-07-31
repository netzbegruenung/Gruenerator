import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { classifierNode } from './classifierNode.js';
import { CLASSIFIER_PROMPT } from './classifierPrompt.js';

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

/** The LLM tier answers `direct`, so any doc routing in these cases can only
 *  have come from the deterministic tiers under test. */
function makeWorkerPool() {
  return {
    processRequest: vi.fn(async () => ({
      content: JSON.stringify({ intent: 'direct', reasoning: 'stub', searchQuery: null }),
    })),
  };
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

describe('Tool-Kontext-Hinweis an den LLM-Tier', () => {
  // Loop demotion (Tier 3.5) short-circuits a low-confidence `direct` straight
  // to `agentic` and never calls the LLM — with the loop on by default these
  // cases would assert on a prompt that was never built. Turning it off is what
  // exposes the tier under test.
  const ORIGINAL_FLAG = process.env.CHAT_AGENT_LOOP;
  beforeEach(() => {
    process.env.CHAT_AGENT_LOOP = 'false';
  });
  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.CHAT_AGENT_LOOP;
    else process.env.CHAT_AGENT_LOOP = ORIGINAL_FLAG;
  });

  /** Runs the LLM tier and returns the prompt it was handed. */
  async function promptFor(userMessage: string): Promise<string> {
    const pool = makeWorkerPool();
    // A message with no deterministic signal at all, so classification is
    // guaranteed to reach the LLM tier where the hint lives.
    await classifierNode(
      buildState(userMessage, { lastToolContext: AFTER_DOC, aiWorkerPool: pool })
    );
    // Nicht calls[0]: seit Tier 3.7 geht der kleine Quellen-Auflöser zuerst an
    // denselben Pool. Gesucht ist der Aufruf mit dem grossen Prompt — sonst
    // prüft der Fall den Prompt des Auflösers und ist immer grün.
    const llmCall = pool.processRequest.mock.calls.find(
      (call) => (call[0] as { systemPrompt?: string })?.systemPrompt === CLASSIFIER_PROMPT
    );
    expect(llmCall).toBeDefined();
    return JSON.stringify(llmCall);
  }

  it('nennt das letzte Dokument normalerweise', async () => {
    expect(await promptFor('Und wie sieht es beim Termin aus?')).toContain('Dokument-Erstellung');
  });

  it('schweigt, wenn der Turn Dokumentaktionen ausschließt', async () => {
    // The hint reads "vage Folgeaufträge beziehen sich meist darauf" — next to a
    // prohibition it argues for exactly what the user just ruled out, and the
    // LLM followed it (observed live as an unasked-for save_as_doc
    // secondaryIntent).
    expect(await promptFor('Und wie sieht es beim Termin aus? Keine Dokumentaktion')).not.toContain(
      'Dokument-Erstellung'
    );
  });
});

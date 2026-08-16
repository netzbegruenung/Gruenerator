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
const executeProvider = vi.fn(async () => ({ content: 'keine' }));
vi.mock('../../../../services/ai/execution/index.js', () => ({
  executeProvider: (...args: unknown[]) => executeProvider(...args),
}));

import { buildSharepicConfirmation } from '../../../../routes/chat/services/artifactConfirmations.js';

const { classifierNode } = await import('./classifierNode.js');

import type { ChatGraphState, SearchIntent } from '../types.js';

/**
 * A create turn has to know WHAT it is about.
 *
 * Live failure: after a Zitat-Sharepic about Klimaanlagen in Schulen, "jetzt
 * noch ein normales sharepic" produced "Jetzt handeln für morgen und
 * übermorgen" — the generator built the sharepic about the instruction, because
 * a single-pass generator only ever sees the last user message.
 *
 * Die LLM-Stufe beantwortete das eine Zeit lang mit einem eigenen Feld
 * (`creationTopic`), das nur sie füllen konnte — sie war die einzige Stufe, die
 * den Verlauf las. Mit ihr ist das Feld weg: es ist heute auf JEDEM Pfad `null`.
 *
 * Ersatzlos ist das nicht, sondern die Rückkehr zu dem Weg, den alle anderen
 * Stufen ohnehin schon nahmen: `createTopic()` im Router fällt auf
 * `resolveReferentialTopic` zurück, das denselben Verlauf liest. Was hier
 * geprüft wird, ist genau diese Grenze — dass die Stufe, die den Turn
 * beansprucht, die ART entscheidet und das THEMA offen lässt, statt eins zu
 * erfinden.
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

function buildState(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): ChatGraphState {
  return {
    messages,
    threadId: 'thread-1',
    agentConfig: STUB_AGENT_CONFIG,
    enabledTools: { search: true, web: true, image: true },
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
    creationTopic: null,
  } as unknown as ChatGraphState;
}

// The exact thread from the bug report.
const SCREENSHOT_THREAD = [
  { role: 'user' as const, content: 'zitat sharepic für klimaanlagen in schulen für hitzeschutz' },
  { role: 'assistant' as const, content: buildSharepicConfirmation(1) },
  { role: 'user' as const, content: 'jetzt noch ein normales sharepic' },
];

describe('classifierNode — creationTopic', () => {
  it('der Auflöser entscheidet die ART, aber liefert kein Thema', async () => {
    // Der Verlauf aus dem Fehlerbericht trägt das Wort „sharepic", erreicht den
    // Generierungs-Auflöser also — und wird dort entschieden. Der Auflöser hat
    // einen GESCHLOSSENEN Antwortraum (welche Artefaktart, mehr nicht), kann
    // also gar kein Thema liefern, und genau das ist hier die Zusicherung: die
    // Stufe erfindet keins. Das Thema kommt aus `createTopic()` im Router, der
    // auf `resolveReferentialTopic` über denselben Verlauf zurückfällt.
    const state = buildState(SCREENSHOT_THREAD);
    executeProvider.mockImplementation(
      async (_provider: string, _id: string, req: { systemPrompt?: string }) =>
        req.systemPrompt?.startsWith('Entscheide, ob diese Nachricht ein ARTEFAKT')
          ? { content: 'sharepic' }
          : { content: 'keine' }
    );

    const result = await classifierNode(state);
    expect(result.intent).toBe('sharepic');
    expect(result.creationTopic ?? null).toBeNull();
  });
});

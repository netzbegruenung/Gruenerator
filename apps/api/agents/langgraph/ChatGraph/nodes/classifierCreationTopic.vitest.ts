import { describe, it, expect, vi } from 'vitest';

import { buildSharepicConfirmation } from '../../../../routes/chat/services/artifactConfirmations.js';

import { classifierNode } from './classifierNode.js';
import { validateCreationTopic } from './classifierParsing.js';

import type { ChatGraphState, SearchIntent } from '../types.js';

/**
 * A create turn has to know WHAT it is about.
 *
 * Live failure: after a Zitat-Sharepic about Klimaanlagen in Schulen, "jetzt
 * noch ein normales sharepic" produced "Jetzt handeln für morgen und
 * übermorgen" — the generator built the sharepic about the instruction, because
 * a single-pass generator only ever sees the last user message.
 *
 * The classifier is the one component that already reads the conversation on
 * exactly these turns (`isVagueFollowup` forces the LLM tier for a short
 * message in a thread), so it answers the question. These tests pin the
 * contract, not the model: the LLM tier is mocked, and what is asserted is that
 * a resolved topic survives parsing and reaches the state — plus the two ways a
 * model answer gets rejected.
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

function makeWorkerPool(response: Record<string, unknown>) {
  return {
    // Kleine Auflöser antworten getrennt — sonst entscheidet einer von ihnen den
    // Turn, bevor die grosse Stufe die geprüfte Antwort liefern kann.
    processRequest: vi.fn(async (req: { systemPrompt?: string }) =>
      req.systemPrompt?.startsWith('Entscheide, ob diese')
        ? { content: 'keine' }
        : { content: JSON.stringify(response) }
    ),
  };
}

function buildState(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  llmResponse: Record<string, unknown>
): ChatGraphState {
  return {
    messages,
    threadId: 'thread-1',
    agentConfig: STUB_AGENT_CONFIG,
    enabledTools: { search: true, web: true, image: true },
    aiWorkerPool: makeWorkerPool(llmResponse),
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

/**
 * Ein Folgeauftrag OHNE Erzeugungswort. Der Generierungs-Auflöser (Tier 3.8)
 * hängt an `GENERATION_SIGNAL`; diese Formulierung trifft es nicht, der Turn
 * erreicht also weiterhin die grosse Stufe — und nur dort entsteht
 * `creationTopic`. Ohne diesen Verlauf prüfte die Durchreiche nichts mehr.
 */
const REACHES_LLM_THREAD = [
  { role: 'user' as const, content: 'zitat sharepic für klimaanlagen in schulen für hitzeschutz' },
  { role: 'assistant' as const, content: buildSharepicConfirmation(1) },
  { role: 'user' as const, content: 'jetzt noch eins davon, bitte etwas ruhiger' },
];

describe('classifierNode — creationTopic', () => {
  it('reicht das aufgelöste Thema an den State durch', async () => {
    const result = await classifierNode(
      buildState(REACHES_LLM_THREAD, {
        intent: 'sharepic',
        searchQuery: null,
        creationTopic: 'Klimaanlagen in Schulen als Hitzeschutz',
        reasoning: 'Folgeauftrag ohne eigenes Thema — Thema aus dem Verlauf übernommen',
      })
    );
    expect(result.intent).toBe('sharepic');
    expect(result.creationTopic).toBe('Klimaanlagen in Schulen als Hitzeschutz');
  });

  it('bleibt null, wenn das Modell keins liefert', async () => {
    const result = await classifierNode(
      buildState(REACHES_LLM_THREAD, {
        intent: 'sharepic',
        searchQuery: null,
        creationTopic: null,
        reasoning: 'Kein Thema erkennbar',
      })
    );
    expect(result.creationTopic).toBeNull();
  });

  it('der Auflöser entscheidet die ART, aber liefert kein Thema', async () => {
    // Der Verlauf aus dem Fehlerbericht trägt das Wort „sharepic", erreicht den
    // Auflöser also — und wird dort entschieden, ohne die grosse Stufe. Damit
    // gibt es auf diesem Weg KEIN `creationTopic` mehr; das Thema kommt aus
    // `createTopic()` im Router, der genau für „Turns, die die LLM-Stufe nie
    // erreicht haben" auf `resolveReferentialTopic` zurückfällt.
    const state = buildState(SCREENSHOT_THREAD, {
      intent: 'sharepic',
      searchQuery: null,
      creationTopic: 'darf nicht durchkommen',
      reasoning: 'grosse Stufe',
    });
    (state.aiWorkerPool as unknown as { processRequest: unknown }).processRequest = async (req: {
      systemPrompt?: string;
    }) =>
      req.systemPrompt?.startsWith('Entscheide, ob diese Nachricht ein ARTEFAKT')
        ? { content: 'sharepic' }
        : {
            content: JSON.stringify({
              intent: 'sharepic',
              creationTopic: 'darf nicht durchkommen',
            }),
          };

    const result = await classifierNode(state);
    expect(result.intent).toBe('sharepic');
    expect(result.creationTopic ?? null).toBeNull();
  });
});

describe('validateCreationTopic', () => {
  const message = 'jetzt noch ein normales sharepic';

  it('nimmt ein aufgelöstes Thema an', () => {
    expect(validateCreationTopic('Klimaanlagen in Schulen', 'sharepic', message)).toBe(
      'Klimaanlagen in Schulen'
    );
  });

  it('verwirft das zurückgespiegelte Kommando', () => {
    // Das Modell hat nichts aufgelöst — die Anweisung als Thema IST der Bug.
    expect(validateCreationTopic(message, 'sharepic', message)).toBeNull();
    expect(
      validateCreationTopic('  Jetzt   Noch Ein Normales Sharepic ', 'sharepic', message)
    ).toBeNull();
  });

  it('verwirft ein Thema zu einem Intent, der nichts erstellt', () => {
    expect(validateCreationTopic('Klimaanlagen', 'direct', message)).toBeNull();
    expect(validateCreationTopic('Klimaanlagen', 'search', message)).toBeNull();
  });

  it('verwirft Leeres und Nicht-Strings', () => {
    expect(validateCreationTopic('   ', 'sharepic', message)).toBeNull();
    expect(validateCreationTopic(null, 'sharepic', message)).toBeNull();
    expect(validateCreationTopic(undefined, 'sharepic', message)).toBeNull();
  });

  it('kappt Prosa statt sie durchzureichen', () => {
    const prose = 'x'.repeat(500);
    expect(validateCreationTopic(prose, 'sharepic', message)).toHaveLength(300);
  });

  it('gilt für alle Einzelpass-Erstellungsintents', () => {
    for (const intent of [
      'sharepic',
      'image',
      'create_pdf',
      'create_sheet',
      'create_presentation',
      'save_as_doc',
      'modify_board',
    ]) {
      expect(validateCreationTopic('Radwegeausbau', intent, message)).toBe('Radwegeausbau');
    }
  });
});

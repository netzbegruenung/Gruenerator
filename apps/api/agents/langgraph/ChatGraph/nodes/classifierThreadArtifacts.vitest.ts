import { describe, it, expect, vi } from 'vitest';

import { classifierNode } from './classifierNode.js';

import type { ChatGraphState, SearchIntent, ThreadToolContext } from '../types.js';

/**
 * Grundwahrheit für „worauf bezieht sich dieser Folgeauftrag?".
 *
 * `chat_threads.last_tool_context` hat genau einen Platz, den jeder inhaltliche
 * Turn überschreibt. Ein Gespräch, das erst ein Dokument und dann ein Sharepic
 * erzeugt hat, weiss vom Dokument nichts mehr — „Kürze die Begründung auf die
 * Hälfte" findet keine deterministische Tür und landet beim 27k-Prompt, der in
 * seinem Prosa-Hinweis ebenfalls nur das Sharepic sieht. Dieselbe Fehlerklasse
 * eine Ebene tiefer war `getLastSharepicVariant`, das nur EINE Nachricht las.
 *
 * Der Testsatz besteht deshalb aus Threads mit MEHREREN Artefakten. Ein
 * Testsatz ohne sie meldet grün und prüft nichts: mit einem einzigen Artefakt
 * ist die Antwort trivial und der Auflöser wird gar nicht erst gefragt.
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

const SHAREPIC: ThreadToolContext = {
  kind: 'sharepic',
  ref: null,
  label: 'Windkraft jetzt ausbauen',
};
const DOCUMENT: ThreadToolContext = {
  kind: 'document',
  ref: 'doc-42',
  label: 'Antrag Straßenbäume',
};

/** Der Auflöser und die LLM-Stufe teilen sich den Worker-Pool. Unterschieden
 *  wird am Systemprompt — der des Auflösers ist der einzige, der mit „Ein
 *  Gespräch hat mehrere Artefakte erzeugt" beginnt. */
function makeAiClient(editTargetAnswer: string | (() => never)) {
  const editTargetCalls: string[] = [];
  const processRequest = vi.fn(async (req: { systemPrompt?: string }) => {
    if (req.systemPrompt?.startsWith('Ein Gespräch hat mehrere Artefakte')) {
      editTargetCalls.push(req.systemPrompt);
      if (typeof editTargetAnswer === 'function') editTargetAnswer();
      return { content: editTargetAnswer };
    }
    return {
      content: JSON.stringify({ intent: 'direct', reasoning: 'LLM-Stufe', searchQuery: null }),
    };
  });
  return { processRequest, editTargetCalls };
}

function buildState(
  overrides: Partial<ChatGraphState> & { userMessage: string; pool: { processRequest: unknown } }
): ChatGraphState {
  const { userMessage, pool, ...rest } = overrides;
  return {
    messages: [{ role: 'user' as const, content: userMessage }],
    threadId: 'thread-1',
    agentConfig: STUB_AGENT_CONFIG,
    enabledTools: { search: true, web: true, image: true, image_edit: true },
    aiClient: pool,
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
    boardIds: [],
    currentDocument: null,
    intent: 'direct' as SearchIntent,
    searchSources: [],
    searchQuery: null,
    ...rest,
  } as unknown as ChatGraphState;
}

describe('classifierNode — Folgeauftrag in einem Thread mit mehreren Artefakten', () => {
  /** Sharepic zuletzt, Dokument davor — genau die Reihenfolge, in der
   *  `last_tool_context` das Dokument vergessen hat. */
  const BOTH = [SHAREPIC, DOCUMENT];

  it('trifft das ältere Dokument, wenn der Auflöser darauf zeigt', async () => {
    const pool = makeAiClient('2');
    const result = await classifierNode(
      buildState({
        userMessage: 'Kürze die Begründung auf die Hälfte',
        lastToolContext: SHAREPIC,
        threadArtifacts: BOTH,
        pool,
      })
    );
    expect(pool.editTargetCalls).toHaveLength(1);
    expect(result.intent).toBe('modify_doc');
    expect(result.docMentionIds).toEqual(['doc-42']);
  });

  it('bleibt beim Sharepic, wenn der Auflöser auf das neueste Artefakt zeigt', async () => {
    const pool = makeAiClient('1');
    const result = await classifierNode(
      buildState({
        userMessage: 'Mach den Text größer',
        lastToolContext: SHAREPIC,
        threadArtifacts: BOTH,
        pool,
      })
    );
    expect(result.intent).toBe('sharepic');
  });

  it('fällt bei „keines" auf das heutige Verhalten zurück, nicht auf „kein Artefakt"', async () => {
    // Der Auflöser darf einen Folgeauftrag UMLENKEN, nie unterdrücken: sonst
    // verliert eine Fehlantwort des Modells dem Nutzer die Bearbeitung ganz.
    const pool = makeAiClient('0');
    const result = await classifierNode(
      buildState({
        userMessage: 'Kürze die Begründung auf die Hälfte',
        lastToolContext: DOCUMENT,
        threadArtifacts: [DOCUMENT, SHAREPIC],
        pool,
      })
    );
    expect(result.intent).toBe('modify_doc');
    expect(result.docMentionIds).toEqual(['doc-42']);
  });

  it('fällt zurück, wenn der Auflöser wegbricht', async () => {
    const pool = makeAiClient(() => {
      throw new Error('provider down');
    });
    const result = await classifierNode(
      buildState({
        userMessage: 'Kürze die Begründung auf die Hälfte',
        lastToolContext: DOCUMENT,
        threadArtifacts: [DOCUMENT, SHAREPIC],
        pool,
      })
    );
    expect(result.intent).toBe('modify_doc');
  });

  it('fragt gar nicht, wenn die Nachricht kein Bearbeitungsauftrag ist', async () => {
    // Eine neue Sachfrage in einem Thread mit Artefakten: die Antwort wäre
    // „keines" per Konstruktion, der Aufruf also reine Latenz.
    const pool = makeAiClient('1');
    await classifierNode(
      buildState({
        userMessage: 'Erklär mir den Unterschied zwischen Nationalrat und Bundesrat in Österreich',
        lastToolContext: SHAREPIC,
        threadArtifacts: BOTH,
        pool,
      })
    );
    expect(pool.editTargetCalls).toHaveLength(0);
  });

  it('fragt gar nicht, wenn der Thread nur ein Artefakt hat', async () => {
    const pool = makeAiClient('1');
    const result = await classifierNode(
      buildState({
        userMessage: 'Mach den Text größer',
        lastToolContext: SHAREPIC,
        threadArtifacts: [SHAREPIC],
        pool,
      })
    );
    expect(pool.editTargetCalls).toHaveLength(0);
    expect(result.intent).toBe('sharepic');
  });

  it('ignoriert eine Nummer ausserhalb der Liste, statt zu raten', async () => {
    // „3" bei zwei Artefakten heisst: das Modell hat nicht gewählt. Für es zu
    // raten ist der Weg, auf dem das falsche Artefakt bearbeitet wird.
    const pool = makeAiClient('3');
    const result = await classifierNode(
      buildState({
        userMessage: 'Kürze die Begründung auf die Hälfte',
        lastToolContext: DOCUMENT,
        threadArtifacts: [DOCUMENT, SHAREPIC],
        pool,
      })
    );
    expect(pool.editTargetCalls).toHaveLength(1);
    expect(result.intent).toBe('modify_doc');
    expect(result.docMentionIds).toEqual(['doc-42']);
  });

  it('liest die Nummer auch aus einem Satz', async () => {
    const pool = makeAiClient('Nummer 2.');
    const result = await classifierNode(
      buildState({
        userMessage: 'Kürze die Begründung auf die Hälfte',
        lastToolContext: SHAREPIC,
        threadArtifacts: BOTH,
        pool,
      })
    );
    expect(result.intent).toBe('modify_doc');
  });
});

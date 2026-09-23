/**
 * Shared agent preparation for background runs.
 *
 * Board tasks (@-mention, card assignment, Grünerator-Spalte) and recurring tasks
 * all run the full agentic loop headless (`runHeadlessAgenticTurn`, #3221). This
 * module owns what that entry needs from the board side: agent resolution +
 * classification (`prepareAgentState`), the document/comment mode suffixes, and
 * the result title.
 */
import { type ModelMessage } from 'ai';

import { classifierNode, initializeChatState } from '../../../agents/langgraph/ChatGraph/index.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('boardAgentGenerate');

export type UserLocale = 'de-DE' | 'de-AT';

/** Selects which agent runs a board task and on whose behalf (for user/shared agents). */
export interface AgentSelection {
  /** Identifier of a specific agent; null/empty → the default universal agent. */
  agentId?: string | null;
  /** Requesting user — required so user-created and group-shared agents resolve. */
  userId?: string;
}

// Vom headless Loop-Einstieg (#3221, `runHeadlessAgenticTurn`) an den
// Systemprompt gehängt.
export const DOCUMENT_MODE = `

## DOKUMENT-MODUS (vorrangig)
Du erstellst ein eigenständiges, vollständiges Dokument — KEINE kurze Chat-Antwort. Die Längen- und Knappheitsregeln aus den ANTWORT-REGELN gelten hier NICHT. Schreibe so ausführlich und strukturiert, wie die Aufgabe es verlangt: mit aussagekräftiger Überschrift (#), sinnvollen Zwischenüberschriften und vollständig ausformulierten Absätzen.

Du hast Recherche-Tools (gruenerator_search, web_search, research, …). Nutze sie aktiv, um Fakten und grüne Positionen zu belegen, bevor du schreibst — verlasse dich nicht nur auf vorhandenen Kontext. Gib am Ende AUSSCHLIESSLICH den Dokumentinhalt als Markdown aus — keine Meta-Kommentare, keine Rückfragen.`;

export const COMMENT_MODE = `

## KOMMENTAR-MODUS
Du antwortest direkt in einem Board-Kommentar-Thread. Antworte knapp und konkret auf die Frage. Nutze bei Faktenbedarf zuerst die Recherche-Tools. Gib NUR die Antwort aus — keine Anrede, keine Meta-Kommentare, keine Überschrift.

REINER TEXT (überschreibt die Längen- und Formatierungsvorgaben der ANTWORT-REGELN): Der Kommentar-Thread stellt KEIN Markdown dar. Schreibe ausschließlich reinen Fließtext — keine Sternchen für Hervorhebungen (**fett**, *kursiv*), keine Überschriften (#), keine Aufzählungs- oder Nummernlisten (-, *, 1.), keine Code-Backticks (\`). Gliedere höchstens durch einzelne normale Absätze. Halte dich kurz (wenige kurze Absätze). Wenn die Antwort nur mit Überschriften, Listen oder längerer Struktur sinnvoll wäre, ist das ein Zeichen dafür, dass ein Dokument statt eines Kommentars gefragt ist — fasse dich dann trotzdem knapp.`;

async function initializeBoardAgentState(
  userMessage: ModelMessage,
  userLocale: UserLocale,
  agentId: string,
  userId: string | undefined
) {
  return initializeChatState({
    messages: [userMessage],
    // Falsy agentId → ChatGraph resolves the default universal agent. A real id +
    // userId resolves the chosen agent (system → own → group-shared) with its
    // persona, default notebooks and tool restrictions.
    agentId,
    ...(userId != null && { userId }),
    enabledTools: { search: true, web: true, person: true, examples: true, research: true },
    userLocale,
  });
}

/**
 * Run the classifier so we have the intent (for the caller's unsupported-artifact
 * guard) and an intent/locale-aware system prompt. Throws on classifier error.
 *
 * `selection` optionally pins a specific agent (own / group-shared / system) on the
 * requester's behalf. A picked agent that can no longer be resolved (deleted, renamed,
 * access lost) must not fail an already-queued task — it falls back to the default
 * universal agent so the work still gets done.
 */
export async function prepareAgentState(
  instruction: string,
  userLocale: UserLocale,
  selection?: AgentSelection
) {
  const userMessage: ModelMessage = { role: 'user', content: instruction };
  const requestedAgentId = selection?.agentId || '';
  const userId = selection?.userId;

  let initialState;
  try {
    initialState = await initializeBoardAgentState(
      userMessage,
      userLocale,
      requestedAgentId,
      userId
    );
  } catch (err) {
    if (!requestedAgentId) throw err;
    log.warn(
      `Agent "${requestedAgentId}" could not be resolved; falling back to the default agent: ` +
        (err instanceof Error ? err.message : String(err))
    );
    initialState = await initializeBoardAgentState(userMessage, userLocale, '', userId);
  }

  const classification = await classifierNode(initialState);
  const finalState = { ...initialState, ...classification };
  if (finalState.error) {
    throw new Error(finalState.error);
  }
  return { finalState, userMessage };
}

export type PreparedAgentState = Awaited<ReturnType<typeof prepareAgentState>>;

/**
 * Reduce a heading to plain text. The title is stored and re-rendered
 * elsewhere, so a single `replace` is not enough (CodeQL
 * js/incomplete-multi-character-sanitization): stripping `<…>` pairs once
 * splices the halves of `<scr<a>ipt>` back into `<script>`, so it repeats until
 * the string stops changing. The final pass drops stray brackets, which is what
 * catches an unterminated `<script` — no `>`, so no pair ever matches it.
 *
 * Input is capped first: every pass shrinks the string, so the loop terminates,
 * but the bound keeps it away from quadratic behaviour. The result is cut to
 * 120 characters anyway, so the cap is unobservable.
 */
function toPlainTitleText(raw: string): string {
  let prev = raw.slice(0, 4096);
  for (;;) {
    const next = prev.replace(/<[^>]*>/g, '');
    if (next === prev) break;
    prev = next;
  }
  return prev.replace(/[<>]/g, '');
}

/**
 * Derive a document/result title: prefer a leading heading from the generated
 * content, otherwise fall back to the (mention-stripped) instruction text.
 */
export function deriveTitle(instruction: string, responseText: string): string {
  const mdHeading = responseText.match(/^\s{0,3}#{1,3}\s+(.+)$/m);
  const htmlHeading = responseText.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const heading = toPlainTitleText(mdHeading?.[1] ?? htmlHeading?.[1] ?? '').trim();
  if (heading) return heading.slice(0, 120);

  const cleaned = instruction.replace(/@\S+/g, '').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 80) || 'Neues Dokument';
}

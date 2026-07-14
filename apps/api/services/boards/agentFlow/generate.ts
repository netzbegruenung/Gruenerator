/**
 * Shared agent generation core.
 *
 * Both the legacy @-mention path (boardAgentWorker) and the AI-column flow path
 * (runFlow) produce text the same way: classify → build an intent/locale-aware
 * system prompt → generate with live search/research tools. This module owns that
 * core so neither caller duplicates it.
 */
import { generateText, stepCountIs, type ModelMessage } from 'ai';

import {
  buildSystemMessage,
  classifierNode,
  initializeChatState,
} from '../../../agents/langgraph/ChatGraph/index.js';
import { createSearchTools } from '../../../routes/chat/agents/searchTools.js';
import { resolveModel } from '../../../routes/chat/services/responseStreamingService.js';
import { createLogger } from '../../../utils/logger.js';
import { getAIService } from '../../ai/aiService.js';

const log = createLogger('boardAgentGenerate');

export type UserLocale = 'de-DE' | 'de-AT';

/** Selects which agent runs a board task and on whose behalf (for user/shared agents). */
export interface AgentSelection {
  /** Identifier of a specific agent; null/empty → the default universal agent. */
  agentId?: string | null;
  /** Requesting user — required so user-created and group-shared agents resolve. */
  userId?: string;
}

// Hard ceiling on a single generation so one hung model call can't stall the
// sequential drain loop.
const GENERATION_TIMEOUT_MS = 180_000;

// Documents can be long-form; never let a chat-tuned token budget truncate below this.
const MIN_DOCUMENT_TOKENS = 4000;

// Max model<->tool round-trips while authoring (search/research then write).
const MAX_TOOL_STEPS = 5;

const DOCUMENT_MODE = `

## DOKUMENT-MODUS (vorrangig)
Du erstellst ein eigenständiges, vollständiges Dokument — KEINE kurze Chat-Antwort. Die Längen- und Knappheitsregeln aus den ANTWORT-REGELN gelten hier NICHT. Schreibe so ausführlich und strukturiert, wie die Aufgabe es verlangt: mit aussagekräftiger Überschrift (#), sinnvollen Zwischenüberschriften und vollständig ausformulierten Absätzen.

Du hast Recherche-Tools (gruenerator_search, web_search, research, …). Nutze sie aktiv, um Fakten und grüne Positionen zu belegen, bevor du schreibst — verlasse dich nicht nur auf vorhandenen Kontext. Gib am Ende AUSSCHLIESSLICH den Dokumentinhalt als Markdown aus — keine Meta-Kommentare, keine Rückfragen.`;

const COMMENT_MODE = `

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
    aiWorkerPool: getAIService(),
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
 * Generate the result text from a prepared state. `longForm` picks document mode
 * (overrides the universal agent's short ANTWORT-REGELN) vs. concise comment mode.
 */
export async function generateFromState(
  prepared: PreparedAgentState,
  opts: {
    longForm: boolean;
    slotLabel: string;
    contextBlock?: string;
    /** Restrict the search tools to the resolved agent's own `enabledTools`. */
    restrictToAgentTools?: boolean;
  }
): Promise<string> {
  const { finalState, userMessage } = prepared;
  const baseSystemMessage = await buildSystemMessage(finalState);
  const systemMessage = `${baseSystemMessage}${opts.longForm ? DOCUMENT_MODE : COMMENT_MODE}`;

  // The card context (column, comments, attached documents) belongs in the user
  // message as material for this task — NOT in the system prompt (which is the agent's
  // standing persona/instructions). The task itself stays at the top so the model has
  // a clear instruction, with the context appended as background below it.
  const baseContent = typeof userMessage.content === 'string' ? userMessage.content : '';
  const taskMessage: ModelMessage = {
    role: 'user',
    content: opts.contextBlock
      ? `${baseContent}\n\n---\n## Kontext der Karte (Hintergrundmaterial für genau diese Aufgabe)\n${opts.contextBlock}`
      : baseContent,
  };

  const { agentConfig } = finalState;
  // Resolve via the same path as the chat controller so overflow-lane slots and
  // provider fallback are handled; release any acquired slot afterwards.
  const resolution = await resolveModel(
    {
      provider: agentConfig.provider as string,
      model: agentConfig.model,
      ...(agentConfig.defaultModel != null && { defaultModel: agentConfig.defaultModel }),
    },
    undefined,
    opts.slotLabel,
    { intent: finalState.intent }
  );

  try {
    const generated = await generateText({
      model: resolution.model,
      system: systemMessage,
      messages: [taskMessage],
      tools: createSearchTools(
        agentConfig,
        opts.restrictToAgentTools && agentConfig.enabledTools
          ? { enabledToolKeys: agentConfig.enabledTools }
          : {}
      ),
      stopWhen: stepCountIs(MAX_TOOL_STEPS),
      maxOutputTokens: opts.longForm
        ? Math.max(agentConfig.params.max_tokens, MIN_DOCUMENT_TOKENS)
        : agentConfig.params.max_tokens,
      temperature: agentConfig.params.temperature,
      abortSignal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
    });
    return generated.text.trim();
  } finally {
    if (resolution.releaseSlot) await resolution.releaseSlot();
  }
}

/**
 * Derive a document/result title: prefer a leading heading from the generated
 * content, otherwise fall back to the (mention-stripped) instruction text.
 */
export function deriveTitle(instruction: string, responseText: string): string {
  const mdHeading = responseText.match(/^\s{0,3}#{1,3}\s+(.+)$/m);
  const htmlHeading = responseText.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const heading = (mdHeading?.[1] ?? htmlHeading?.[1] ?? '').replace(/<[^>]+>/g, '').trim();
  if (heading) return heading.slice(0, 120);

  const cleaned = instruction.replace(/@\S+/g, '').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 80) || 'Neues Dokument';
}

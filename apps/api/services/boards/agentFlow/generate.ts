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
import { getAIService } from '../../ai/aiService.js';

export type UserLocale = 'de-DE' | 'de-AT';

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
Du antwortest direkt in einem Board-Kommentar-Thread. Antworte knapp und konkret auf die Frage (folge den ANTWORT-REGELN oben). Nutze bei Faktenbedarf zuerst die Recherche-Tools. Gib NUR die Antwort aus — keine Anrede, keine Meta-Kommentare, keine Überschrift.`;

/**
 * Run the classifier so we have the intent (for the caller's unsupported-artifact
 * guard) and an intent/locale-aware system prompt. Throws on classifier error.
 */
export async function prepareAgentState(instruction: string, userLocale: UserLocale) {
  const userMessage: ModelMessage = { role: 'user', content: instruction };

  const initialState = await initializeChatState({
    messages: [userMessage],
    agentId: '', // falsy → ChatGraph resolves the default universal agent
    enabledTools: { search: true, web: true, person: true, examples: true, research: true },
    aiWorkerPool: getAIService(),
    userLocale,
  });
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
  opts: { longForm: boolean; slotLabel: string }
): Promise<string> {
  const { finalState, userMessage } = prepared;
  const baseSystemMessage = await buildSystemMessage(finalState);
  const systemMessage = `${baseSystemMessage}${opts.longForm ? DOCUMENT_MODE : COMMENT_MODE}`;

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
      messages: [userMessage],
      tools: createSearchTools(agentConfig),
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

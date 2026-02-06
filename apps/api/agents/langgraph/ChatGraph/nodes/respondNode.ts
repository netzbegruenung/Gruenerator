/**
 * Respond Node
 *
 * Prepares the response context with search results and system instructions.
 * Does NOT stream directly - streaming is handled by the controller using AI SDK v6.
 *
 * This separation keeps the graph transport-agnostic and testable.
 */

import type { ChatGraphState } from '../types.js';
import { createLogger } from '../../../../utils/logger.js';

const log = createLogger('ChatGraph:Respond');

/**
 * Format search results as context for the response generation.
 */
function formatSearchContext(state: ChatGraphState): string {
  if (state.searchResults.length === 0) {
    return '';
  }

  const resultsText = state.searchResults
    .slice(0, 6) // Limit context to top 6 results
    .map((r, i) => {
      const citation = `[${i + 1}]`;
      const source = r.url ? `Quelle: ${r.url}` : '';
      return `${citation} **${r.title}**\n${r.content.slice(0, 350)}${r.content.length > 350 ? '...' : ''}\n${source}`.trim();
    })
    .join('\n\n');

  return `

## SUCHERGEBNISSE

Nutze diese Informationen für deine Antwort. Zitiere relevante Stellen mit [1], [2], etc.

${resultsText}

---
Bei der Antwort:
- Integriere Informationen aus den Quellen natürlich in deine Antwort
- Füge Zitate [1], [2] etc. ein wo du Informationen aus den Quellen nutzt
- Liste am Ende die wichtigsten Quellen als "Quellen:" wenn du mehr als eine Quelle zitierst`;
}

/**
 * Build the complete system message with agent role and search context.
 */
export function buildSystemMessage(state: ChatGraphState): string {
  const { agentConfig, intent } = state;
  const searchContext = formatSearchContext(state);

  const intentGuidance = intent === 'direct'
    ? '\nDies ist eine direkte Anfrage ohne Recherche-Bedarf. Antworte natürlich und hilfsbereit.'
    : '\nDu hast Recherche-Ergebnisse erhalten. Nutze sie um eine fundierte Antwort zu geben.';

  return `${agentConfig.systemRole}${intentGuidance}${searchContext}

## ANTWORT-REGELN
1. Beantworte NUR was gefragt wurde - keine ungebetene Zusatzinfo
2. Kurze, präzise Antworten (max 3-4 Absätze für einfache Fragen)
3. Bei Suchergebnissen: Zitiere mit [1], [2], etc. wenn du Fakten aus Quellen nutzt
4. Antworte auf Deutsch
5. Erfinde keine Fakten - nutze nur was in den Quellen steht`;
}

/**
 * Respond node implementation.
 *
 * This node prepares the context for response generation but does NOT stream.
 * The controller handles streaming using AI SDK v6's streamText + toDataStreamResponse.
 *
 * Returns:
 * - systemMessage: The complete system prompt with search context
 * - readyToStream: Flag indicating the graph has completed preparation
 */
export async function respondNode(
  state: ChatGraphState
): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  log.info(`[Respond] Preparing response context (intent: ${state.intent}, results: ${state.searchResults.length})`);

  try {
    // Build system message with search context
    const systemMessage = buildSystemMessage(state);

    const responseTimeMs = Date.now() - startTime;
    log.info(`[Respond] Context prepared in ${responseTimeMs}ms`);

    // Return the prepared context - streaming happens in controller
    return {
      responseText: systemMessage, // Store system message for controller to use
      streamingStarted: false, // Will be set true by controller when streaming starts
      responseTimeMs,
    };
  } catch (error: any) {
    log.error('[Respond] Error preparing context:', error.message);

    return {
      responseText: '',
      responseTimeMs: Date.now() - startTime,
      error: `Response preparation failed: ${error.message}`,
    };
  }
}

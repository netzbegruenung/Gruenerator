/**
 * Brief Generator Node
 *
 * Compresses conversation context + searchQuery into a focused 2-3 sentence
 * research brief for complex research queries. This prevents long conversation
 * history from diluting search intent.
 *
 * Only activates for complexity=complex AND intent=research.
 * All other queries pass through unchanged.
 */

import { createLogger } from '../../../../utils/logger.js';

import type { ChatGraphState } from '../types.js';

const log = createLogger('ChatGraph:BriefGenerator');

const BRIEF_PROMPT = `Du bist ein Forschungsassistent. Analysiere das Gespräch und erstelle einen fokussierten Recherche-Auftrag in 2-3 Sätzen.

Der Recherche-Auftrag soll:
- Zusammenfassen was der Nutzer tatsächlich wissen will (nicht nur die letzte Nachricht)
- Die Kernfrage(n) identifizieren
- Spezifische Anforderungen notieren (Format, Tiefe, Vergleichspunkte)
- Auf Deutsch sein

Antworte NUR mit dem Recherche-Auftrag, ohne Einleitung oder Erklärung.`;

const MAX_CONVERSATION_MESSAGES = 5;
const MAX_BRIEF_LENGTH = 500;

/**
 * Extract text content from a message, handling both string and parts format.
 */
function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p && typeof p === 'object' && p.type === 'text')
      .map((p) => (p as { text: string }).text)
      .join('');
  }
  return String(content || '');
}

/**
 * Brief generator node implementation.
 * Creates a compressed research brief from conversation context.
 */
export async function briefGeneratorNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();

  if (state.complexity !== 'complex' || state.intent !== 'research') {
    log.info(`[BriefGenerator] Skipping — complexity=${state.complexity}, intent=${state.intent}`);
    return {};
  }

  log.info(
    `[BriefGenerator] Generating research brief for: "${state.searchQuery?.slice(0, 50)}..."`
  );

  try {
    const { messages, searchQuery, subQueries, aiWorkerPool } = state;

    const recentMessages = messages.slice(-MAX_CONVERSATION_MESSAGES);
    const conversationSummary = recentMessages
      .map((m) => {
        const role = m.role === 'user' ? 'Nutzer' : 'Assistent';
        const text = extractMessageText(m.content).slice(0, 300);
        return `${role}: ${text}`;
      })
      .join('\n\n');

    const subQueriesText = subQueries?.length ? `\nTeilfragen: ${subQueries.join(', ')}` : '';

    const userMessage = `Gesprächsverlauf:
${conversationSummary}

Erkannte Suchquery: ${searchQuery || 'keine'}${subQueriesText}

Erstelle einen klaren, fokussierten Recherche-Auftrag.`;

    const response = await aiWorkerPool.processRequest(
      {
        type: 'chat_research_brief',
        provider: 'mistral',
        systemPrompt: BRIEF_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
        options: {
          model: 'mistral-small-latest',
          max_tokens: 200,
          temperature: 0.2,
        },
      },
      null
    );

    const brief = (response.content || '').trim().slice(0, MAX_BRIEF_LENGTH);
    const timeMs = Date.now() - startTime;

    if (!brief) {
      log.warn(`[BriefGenerator] Empty response, falling back to searchQuery`);
      return {};
    }

    log.info(`[BriefGenerator] Generated brief (${brief.length} chars) in ${timeMs}ms`);
    log.debug(`[BriefGenerator] Brief: "${brief.slice(0, 100)}..."`);

    return { researchBrief: brief };
  } catch (error: any) {
    log.error(`[BriefGenerator] Error: ${error.message}, falling back to searchQuery`);
    return {};
  }
}

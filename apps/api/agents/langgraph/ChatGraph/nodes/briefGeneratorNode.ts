/**
 * Brief Generator Node
 *
 * Compresses conversation context + searchQuery into a focused 2-3 sentence
 * research brief for complex research queries. This prevents long conversation
 * history from diluting search intent.
 *
 * Only activates for complexity=complex OR moderate, AND intent=research.
 * All other queries pass through unchanged.
 */

import { aiText } from '../../../../services/ai/generate.js';
import { createLogger } from '../../../../utils/logger.js';

import { extractMessageText } from './classifierHeuristics.js';

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
 * Brief generator node implementation.
 * Creates a compressed research brief from conversation context.
 */
export async function briefGeneratorNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();

  if (!['complex', 'moderate'].includes(state.complexity) || state.intent !== 'research') {
    log.info(`[BriefGenerator] Skipping — complexity=${state.complexity}, intent=${state.intent}`);
    return {};
  }

  log.info(
    `[BriefGenerator] Generating research brief for: "${state.searchQuery?.slice(0, 50)}..."`
  );

  try {
    const { messages, searchQuery, subQueries } = state;

    const recentMessages = messages.slice(-MAX_CONVERSATION_MESSAGES);
    const conversationSummary = recentMessages
      .map((m) => {
        const role = m.role === 'user' ? 'Nutzer' : 'Assistent';
        const text = extractMessageText(m.content).slice(0, 800);
        return `${role}: ${text}`;
      })
      .join('\n\n');

    const subQueriesText = subQueries?.length ? `\nTeilfragen: ${subQueries.join(', ')}` : '';

    const userMessage = `Gesprächsverlauf:
${conversationSummary}

Erkannte Suchquery: ${searchQuery || 'keine'}${subQueriesText}

Erstelle einen klaren, fokussierten Recherche-Auftrag.`;

    const answer = await aiText({
      lane: 'chat_research_brief',
      pinned: 'standard',
      system: BRIEF_PROMPT,
      prompt: userMessage,
      maxOutputTokens: 200,
      temperature: 0.2,
    });

    const brief = answer.slice(0, MAX_BRIEF_LENGTH);
    const timeMs = Date.now() - startTime;

    if (!brief) {
      log.error(`[BriefGenerator] Empty response, falling back to searchQuery`);
      return {
        briefGenerationFailed: true,
        searchErrors: [{ source: 'briefGenerator', message: 'empty LLM response' }],
      };
    }

    log.info(`[BriefGenerator] Generated brief (${brief.length} chars) in ${timeMs}ms`);
    log.debug(`[BriefGenerator] Brief: "${brief.slice(0, 100)}..."`);

    return { researchBrief: brief };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error(`[BriefGenerator] Error: ${errMsg}, falling back to searchQuery`);
    return {
      briefGenerationFailed: true,
      searchErrors: [{ source: 'briefGenerator', message: errMsg }],
    };
  }
}

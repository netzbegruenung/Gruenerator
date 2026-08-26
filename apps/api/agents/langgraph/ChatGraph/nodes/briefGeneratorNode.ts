/**
 * Brief Generator Node
 *
 * Compresses conversation context + searchQuery into a focused 2-3 sentence
 * research brief for complex research queries. This prevents long conversation
 * history from diluting search intent.
 *
 * Only activates for complexity=complex OR moderate, AND intent=research —
 * siehe {@link wantsResearchBrief}.
 *
 * ## Position 4 der Gleichmacher-Liste (Phase R3): die Intent-Abfrage bleibt
 *
 * Der Knoten hat KEINEN Aufrufer in der agentischen Schleife und hatte nie
 * einen — beide Aufrufstellen (`intentHandlers/searchBranch.ts`,
 * `services/resumePipeline.ts`) liegen im Einzeldurchlauf. Der Lane-Flip macht
 * ihn damit nicht tot, nur seltener: er bedient weiter jeden `research`-Turn,
 * den ein Notausschalter aus der Schleife hält.
 *
 * An die TIEFE statt an den Intent zu koppeln (`gruendlich`+) wäre keine
 * Gleichmachung, sondern eine Ausweitung: `resolveSearchTier` liefert
 * `gruendlich` genau für `research` ODER für ein ausdrückliches
 * „recherchiere gründlich" — der Brief käme also zu Turns hinzu, die ihn heute
 * nicht bekommen, und kostet je einen stillen Modellaufruf (~1–3 s).
 *
 * Löschen wäre die andere Richtung, und dafür fehlt die Messung: was der Brief
 * beiträgt, entscheidet sich im Rerank (`rerankNode` hängt ihn an die
 * Rerank-Anfrage) und im Wiederholungs-Urteil (`qualityGateNode` gibt ihn als
 * Recherche-Kontext mit). Beides ist Ende-zu-Ende nur gegen eine Lauf-zu-Lauf-
 * Streuung messbar, die in der R2-Abnahme 14 von 19 Fehlschlägen erklärt hat.
 * Bedingung für eine Löschung ist deshalb eine Retrieval-Messung
 * (`evals/retrieval/`) mit und ohne Brief — nicht ein Chat-Lauf.
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
 * Ob dieser Turn einen Recherche-Auftrag bekommt.
 *
 * Exportiert, weil die Bedingung in DREI Fassungen stand: hier, in
 * `searchBranch` (`willGenerateBrief`, das die Fortschrittszeile vorher
 * braucht) und in `resumePipeline` — und die dritte war enger als die beiden
 * anderen (`complex` statt `complex|moderate`), also blieb ein
 * wiederaufgenommener `moderate`-Recherche-Turn ohne Brief, den derselbe Turn
 * beim ersten Anlauf bekommen hätte. Eine Bedingung, ein Ort.
 */
export function wantsResearchBrief(state: ChatGraphState): boolean {
  return (
    (state.complexity === 'complex' || state.complexity === 'moderate') &&
    state.intent === 'research'
  );
}

/**
 * Brief generator node implementation.
 * Creates a compressed research brief from conversation context.
 */
export async function briefGeneratorNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();

  if (!wantsResearchBrief(state)) {
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

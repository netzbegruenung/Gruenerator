/**
 * Query Planner Node
 *
 * Decomposes the user's query into an optimal search strategy:
 * - Generates 2-3 subqueries via LLM (even in web mode, not just deep)
 * - Detects temporal expressions for freshness-aware reranking
 * - Classifies query type (definitional, comparative, news, person, etc.)
 * - Deep mode: generates 4-5 research questions for multi-angle coverage
 *
 * Replaces the simpler queryOptimizerNode.
 */

import { expandQuery } from '../../../../services/search/QueryExpansionService.js';
import { analyzeTemporality } from '../../../../services/search/TemporalAnalyzer.js';
import { createLogger } from '../../../../utils/logger.js';
import { generateResearchQuestions } from '../../WebSearchGraph/utilities/queryOptimizer.js';

import type { SearchGraphState, QueryType } from '../types.js';

const log = createLogger('SearchGraph:QueryPlanner');

/**
 * Strip German task prefixes to extract the core search topic.
 */
const TASK_PREFIX_PATTERN =
  /^(suche|such|finde?|recherchiere?|erkläre?|erklär|zeig(?:e|t)?|erzähl(?:e|t)?|beschreibe?|nenne?|liste?|gib|was (?:ist|sind|war|waren)|wie (?:ist|sind|funktioniert)|welche?[rns]?)\s+(?:mir\s+)?(?:(?:nach|zu|über|zum|zur|für|von|die|der|das|den|dem|des|ein(?:e[mnrs]?)?|alle[ns]?)\s+)*/i;

function extractSearchTopic(query: string): string {
  const stripped = query.replace(TASK_PREFIX_PATTERN, '').trim();
  return stripped.length > 2 ? stripped : query;
}

/**
 * Classify query type using heuristics (fast, no LLM).
 */
function classifyQueryType(query: string): QueryType {
  const q = query.toLowerCase();

  // Person queries
  if (/^wer (ist|sind|war)|person|politiker|abgeordnete/i.test(q)) return 'person';

  // Comparative
  if (/vergleich|versus|vs\.?|unterschied|gegenüber/i.test(q)) return 'comparative';

  // How-to
  if (/^wie (kann|könnte|macht|geht|funktioniert)|anleitung|schritt/i.test(q)) return 'how-to';

  // News / temporal
  if (/aktuell|neueste|heute|gestern|diese woche|kürzlich|entwicklung/i.test(q)) return 'news';

  // Definitional
  if (/^was (ist|sind|bedeutet)|definition|erklär/i.test(q)) return 'definitional';

  return 'general';
}

/**
 * Format prior messages as conversation context for follow-up reformulation.
 */
function formatConversationContext(
  messages: Array<{ role: string; content: string }>
): string | null {
  if (messages.length <= 1) return null;
  const prior = messages.slice(0, -1).slice(-4);
  if (prior.length === 0) return null;
  return prior
    .map(
      (m) =>
        `${m.role === 'user' ? 'Nutzer' : 'Assistent'}: ${typeof m.content === 'string' ? m.content.substring(0, 200) : ''}`
    )
    .join('\n');
}

/**
 * Reformulate a vague follow-up query using conversation context.
 */
async function reformulateFollowUp(
  rawQuery: string,
  context: string,
  aiWorkerPool: any
): Promise<string> {
  try {
    const result = await aiWorkerPool.processRequest(
      {
        type: 'text_adjustment',
        systemPrompt: `Schreibe die aktuelle Suchanfrage so um, dass sie eigenständig verständlich ist.
Beziehe den Gesprächskontext ein. Antworte NUR mit der reformulierten Anfrage, nichts anderes.

Gesprächsverlauf:
${context}`,
        messages: [{ role: 'user', content: `Aktuelle Anfrage: "${rawQuery}"` }],
        options: {
          provider: 'litellm',
          model: 'mistral-small',
          max_tokens: 80,
          temperature: 0.0,
        },
      },
      null
    );
    if (result.success && result.content) {
      const reformulated = result.content.replace(/^["']|["']$/g, '').trim();
      if (reformulated.length > 3) return reformulated;
    }
  } catch (err: unknown) {
    log.warn(
      `[QueryPlanner] Follow-up reformulation failed: ${err instanceof Error ? err.message : err}`
    );
  }
  return rawQuery;
}

export async function queryPlannerNode(
  state: SearchGraphState
): Promise<Partial<SearchGraphState>> {
  const start = Date.now();
  const lastMessage = state.messages[state.messages.length - 1];
  const rawQuery =
    typeof lastMessage?.content === 'string' ? lastMessage.content : state.searchQuery || '';

  log.info(`[QueryPlanner] Raw query: "${rawQuery.substring(0, 100)}"`);

  // Context-aware follow-up reformulation
  const conversationContext = formatConversationContext(state.messages as any);
  const isVagueFollowUp = conversationContext && rawQuery.split(/\s+/).length <= 10;

  let effectiveQuery = rawQuery;
  if (isVagueFollowUp) {
    effectiveQuery = await reformulateFollowUp(rawQuery, conversationContext, state.aiWorkerPool);
    log.info(`[QueryPlanner] Reformulated follow-up: "${rawQuery}" → "${effectiveQuery}"`);
  }

  const searchTopic = extractSearchTopic(effectiveQuery);
  const temporalAnalysis = analyzeTemporality(rawQuery);
  const hasTemporal = temporalAnalysis.urgency !== 'none';
  const queryType = classifyQueryType(rawQuery);

  log.info(`[QueryPlanner] Type: ${queryType}, temporal: ${hasTemporal}`);

  if (state.searchMode === 'deep') {
    // Deep mode: generate 4-5 research questions for multi-angle coverage
    let subQueries: string[] = [];
    try {
      subQueries = await generateResearchQuestions(rawQuery, state.aiWorkerPool, null);
      log.info(`[QueryPlanner] Deep mode: generated ${subQueries.length} research questions`);
    } catch (err: unknown) {
      log.warn(
        `[QueryPlanner] Research question generation failed: ${err instanceof Error ? err.message : err}`
      );
    }

    // Fallback: use query expansion
    if (subQueries.length === 0) {
      try {
        const expanded = await expandQuery(searchTopic, state.aiWorkerPool);
        subQueries = [searchTopic, ...expanded.alternatives];
      } catch {
        subQueries = [searchTopic];
      }
    }

    return {
      searchQuery: searchTopic,
      subQueries,
      hasTemporal,
      queryType,
      complexity: 'complex',
      queryOptimizeTimeMs: Date.now() - start,
    };
  }

  // Web mode: always generate 2-3 subqueries for multi-angle search
  let subQueries: string[] = [searchTopic];
  try {
    const expanded = await expandQuery(searchTopic, state.aiWorkerPool);
    if (expanded.alternatives.length > 0) {
      subQueries = [searchTopic, ...expanded.alternatives];
      log.info(`[QueryPlanner] Web mode: expanded to ${subQueries.length} queries`);
    }
  } catch (err: unknown) {
    log.warn(`[QueryPlanner] Query expansion failed: ${err instanceof Error ? err.message : err}`);
  }

  return {
    searchQuery: searchTopic,
    subQueries: subQueries.length > 1 ? subQueries : null,
    hasTemporal,
    queryType,
    complexity: hasTemporal ? 'moderate' : 'simple',
    queryOptimizeTimeMs: Date.now() - start,
  };
}

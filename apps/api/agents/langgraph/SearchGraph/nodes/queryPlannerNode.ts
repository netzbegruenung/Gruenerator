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

export async function queryPlannerNode(
  state: SearchGraphState
): Promise<Partial<SearchGraphState>> {
  const start = Date.now();
  const lastMessage = state.messages[state.messages.length - 1];
  const rawQuery =
    typeof lastMessage?.content === 'string' ? lastMessage.content : state.searchQuery || '';

  log.info(`[QueryPlanner] Raw query: "${rawQuery.substring(0, 100)}"`);

  const searchTopic = extractSearchTopic(rawQuery);
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

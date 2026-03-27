/**
 * Query Optimizer Node
 *
 * Rewrites the user's raw query for optimal search:
 * - Strips German task prefixes ("Suche nach", "Finde heraus")
 * - Expands synonyms for richer recall
 * - Detects temporal expressions for freshness-aware reranking
 * - Generates research sub-questions for deep mode
 */

import { analyzeTemporality } from '../../../../services/search/TemporalAnalyzer.js';
import { createLogger } from '../../../../utils/logger.js';
import {
  optimizeSearchQuery,
  generateResearchQuestions,
} from '../../WebSearchGraph/utilities/queryOptimizer.js';

import type { SearchGraphState } from '../types.js';

const log = createLogger('SearchGraph:QueryOptimizer');

const TASK_PREFIX_PATTERN =
  /^(suche|such|finde?|recherchiere?|erkläre?|erklär|zeig(?:e|t)?|erzähl(?:e|t)?|beschreibe?|nenne?|liste?|gib|was (?:ist|sind|war|waren)|wie (?:ist|sind|funktioniert)|welche?[rns]?)\s+(?:mir\s+)?(?:(?:nach|zu|über|zum|zur|für|von|die|der|das|den|dem|des|ein(?:e[mnrs]?)?|alle[ns]?)\s+)*/i;

/**
 * Strip German task prefixes to extract the search topic.
 */
function extractSearchTopic(query: string): string {
  const stripped = query.replace(TASK_PREFIX_PATTERN, '').trim();
  return stripped.length > 2 ? stripped : query;
}

export async function queryOptimizerNode(
  state: SearchGraphState
): Promise<Partial<SearchGraphState>> {
  const start = Date.now();
  const lastMessage = state.messages[state.messages.length - 1];
  const rawQuery =
    typeof lastMessage?.content === 'string' ? lastMessage.content : state.searchQuery || '';

  log.info(`[QueryOptimizer] Raw query: "${rawQuery.substring(0, 100)}"`);

  // Extract core search topic
  const searchTopic = extractSearchTopic(rawQuery);

  // Detect temporal expressions
  const temporalAnalysis = analyzeTemporality(rawQuery);
  const hasTemporal = temporalAnalysis.urgency !== 'none';

  if (state.searchMode === 'deep') {
    // Deep mode: generate research sub-questions
    let subQueries: string[] = [];
    try {
      subQueries = await generateResearchQuestions(rawQuery, state.aiWorkerPool, null);
      log.info(`[QueryOptimizer] Deep mode: generated ${subQueries.length} research questions`);
    } catch (err: unknown) {
      log.warn(
        `[QueryOptimizer] Research question generation failed: ${err instanceof Error ? err.message : err}`
      );
    }

    // If generation failed, fall back to synonym expansion
    if (subQueries.length === 0) {
      const optimized = optimizeSearchQuery(searchTopic);
      subQueries = [optimized];
    }

    return {
      searchQuery: searchTopic,
      subQueries,
      hasTemporal,
      complexity: 'complex',
      queryOptimizeTimeMs: Date.now() - start,
    };
  }

  // Web mode: synonym expansion + split multi-topic queries
  const optimized = optimizeSearchQuery(searchTopic);
  log.info(`[QueryOptimizer] Web mode: "${searchTopic}" → "${optimized.substring(0, 100)}"`);

  return {
    searchQuery: searchTopic,
    subQueries: optimized !== searchTopic ? [searchTopic, optimized] : null,
    hasTemporal,
    complexity: hasTemporal ? 'moderate' : 'simple',
    queryOptimizeTimeMs: Date.now() - start,
  };
}

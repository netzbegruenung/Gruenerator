/**
 * Query Expansion Service
 *
 * Uses a fast LLM call (Mistral-small) to generate 2 alternative search queries
 * that explore different angles of the user's question. This helps catch relevant
 * results that the original query might miss.
 *
 * Features:
 * - Generates 2 alternative queries per input
 * - Results are cached in memory (same query = same expansion)
 * - Graceful degradation: returns just the original query on failure
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('QueryExpansion');

export interface ExpandedQuery {
  primary: string;
  alternatives: string[];
}

// In-memory LRU-style cache (simple Map with size limit)
const expansionCache = new Map<string, ExpandedQuery>();
const MAX_CACHE_SIZE = 200;

const EXPANSION_PROMPT = `Du generierst alternative Suchanfragen auf Deutsch.
Gegeben eine Suchanfrage, erstelle 2 alternative Formulierungen, die:
- Verschiedene Aspekte oder Blickwinkel des Themas abdecken
- Synonyme oder verwandte Begriffe verwenden
- Die gleiche Sprache (Deutsch) verwenden

Antworte NUR mit JSON:
{ "alternatives": ["alternative 1", "alternative 2"] }`;

/**
 * Expand a search query into multiple alternative formulations.
 * Uses the AI worker pool for a fast Mistral-small call.
 */
export async function expandQuery(
  query: string,
  aiWorkerPool: any,
): Promise<ExpandedQuery> {
  // Check cache first
  const cacheKey = query.toLowerCase().trim();
  const cached = expansionCache.get(cacheKey);
  if (cached) {
    log.debug(`[Expand] Cache hit for: "${query.slice(0, 50)}"`);
    return cached;
  }

  try {
    const response = await aiWorkerPool.processRequest(
      {
        type: 'chat_query_expansion',
        provider: 'mistral',
        systemPrompt: EXPANSION_PROMPT,
        messages: [{ role: 'user', content: `Suchanfrage: "${query}"` }],
        options: {
          model: 'mistral-small-latest',
          max_tokens: 100,
          temperature: 0.3,
          response_format: { type: 'json_object' },
        },
      },
      null
    );

    const parsed = parseExpansionResponse(response.content || '');
    const result: ExpandedQuery = {
      primary: query,
      alternatives: parsed,
    };

    // Cache the result (evict oldest if full)
    if (expansionCache.size >= MAX_CACHE_SIZE) {
      const firstKey = expansionCache.keys().next().value;
      if (firstKey) expansionCache.delete(firstKey);
    }
    expansionCache.set(cacheKey, result);

    log.info(`[Expand] Generated ${parsed.length} alternatives for: "${query.slice(0, 50)}"`);
    return result;
  } catch (error: any) {
    log.warn(`[Expand] Failed for "${query.slice(0, 50)}": ${error.message}`);
    return { primary: query, alternatives: [] };
  }
}

/**
 * Parse the LLM expansion response.
 * Returns an array of alternative queries, or empty array on failure.
 */
function parseExpansionResponse(content: string): string[] {
  try {
    const parsed = JSON.parse(content);
    if (parsed.alternatives && Array.isArray(parsed.alternatives)) {
      return parsed.alternatives
        .filter((a: any) => typeof a === 'string' && a.trim().length > 3)
        .slice(0, 2);
    }
  } catch {
    // Try extracting JSON from text
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.alternatives && Array.isArray(parsed.alternatives)) {
          return parsed.alternatives
            .filter((a: any) => typeof a === 'string' && a.trim().length > 3)
            .slice(0, 2);
        }
      } catch {
        // Fall through
      }
    }
  }
  return [];
}

/**
 * Rerank Node
 *
 * Uses Mistral-small to rerank search results by semantic relevance.
 * Sits between the search and respond nodes in the graph pipeline.
 *
 * Takes the top results from search, asks the LLM to score relevance,
 * and returns only the best matches. This improves precision significantly
 * when combined with cross-collection search (which increases candidate volume).
 */

import { applyMMR } from '../../../../services/search/DiversityReranker.js';
import { createLogger } from '../../../../utils/logger.js';

import type { ChatGraphState, SearchResult } from '../types.js';

const log = createLogger('ChatGraph:Rerank');

const RERANK_INPUT_LIMIT = 12;
const RERANK_OUTPUT_LIMIT = 8;

const RERANK_PROMPT = `Du bewertest die Relevanz von Suchergebnissen für eine Benutzeranfrage.

Für jedes Ergebnis vergib einen Relevanz-Score von 1-5:
5 = Direkt relevant, beantwortet die Frage
4 = Sehr relevant, enthält wichtige Informationen
3 = Teilweise relevant, enthält Hintergrundinformationen
2 = Wenig relevant, nur am Rande verwandt
1 = Nicht relevant

Antworte NUR mit JSON:
{ "scores": [{"index": 0, "score": 5}, {"index": 1, "score": 3}, ...] }`;

const RERANK_PROMPT_TEMPORAL = `Du bewertest die Relevanz von Suchergebnissen für eine Benutzeranfrage.
Bevorzuge aktuelle Ergebnisse — neuere Quellen mit aktuellen Informationen sollten höher bewertet werden.

Für jedes Ergebnis vergib einen Relevanz-Score von 1-5:
5 = Direkt relevant, beantwortet die Frage, aktuell
4 = Sehr relevant, enthält wichtige aktuelle Informationen
3 = Teilweise relevant, enthält Hintergrundinformationen
2 = Wenig relevant, nur am Rande verwandt oder veraltet
1 = Nicht relevant oder stark veraltet

Antworte NUR mit JSON:
{ "scores": [{"index": 0, "score": 5}, {"index": 1, "score": 3}, ...] }`;

/**
 * Rerank search results using Mistral-small.
 * Batches all passages into a single LLM call for efficiency.
 */
export async function rerankNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  const { searchResults, searchQuery, aiWorkerPool, hasTemporal } = state;

  // Skip reranking if too few results
  if (searchResults.length <= 3) {
    log.info(`[Rerank] Skipping — only ${searchResults.length} results`);
    return { rerankTimeMs: Date.now() - startTime };
  }

  const candidates = searchResults.slice(0, RERANK_INPUT_LIMIT);

  log.info(
    `[Rerank] Reranking ${candidates.length} results for query: "${searchQuery?.slice(0, 50)}..."`
  );

  try {
    // Build the passage list for the LLM
    const passageList = candidates
      .map((r, i) => `[${i}] ${r.title}\n${r.content.slice(0, 300)}`)
      .join('\n\n');

    const userMessage = `Suchanfrage: "${searchQuery}"

Ergebnisse:
${passageList}`;

    const response = await aiWorkerPool.processRequest(
      {
        type: 'chat_rerank',
        provider: 'mistral',
        systemPrompt: hasTemporal ? RERANK_PROMPT_TEMPORAL : RERANK_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
        options: {
          model: 'mistral-small-latest',
          max_tokens: 200,
          temperature: 0.0,
          top_p: 1.0,
          response_format: { type: 'json_object' },
        },
      },
      null
    );

    // Parse scores
    const parsed = parseRerankResponse(response.content || '', candidates.length);
    const rerankTimeMs = Date.now() - startTime;

    if (!parsed) {
      log.warn('[Rerank] Failed to parse response, keeping original order');
      return { rerankTimeMs };
    }

    // Apply scores and re-sort
    const scoredResults: SearchResult[] = candidates.map((r, i) => ({
      ...r,
      relevance: parsed[i] !== undefined ? parsed[i] / 5 : r.relevance || 0.5,
    }));

    scoredResults.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));

    // Filter out low-relevance results (score 1 = not relevant)
    const filtered = scoredResults.filter((r) => (r.relevance || 0) > 0.2);

    // B3: Apply MMR diversity reranking as second pass
    // Keep top 2 results unchanged, apply diversity for positions 3+
    const diverse = filtered.length > 3 ? applyMMR(filtered, 0.7, 2) : filtered;
    const reranked = diverse.slice(0, RERANK_OUTPUT_LIMIT);

    log.info(
      `[Rerank] Complete: ${candidates.length} → ${reranked.length} results (diversity applied) in ${rerankTimeMs}ms`
    );

    return {
      searchResults: reranked,
      rerankTimeMs,
    };
  } catch (error: any) {
    log.error('[Rerank] Error:', error.message);
    return { rerankTimeMs: Date.now() - startTime };
  }
}

/**
 * Parse the rerank LLM response into a score map.
 * Returns index→score mapping, or null if parsing fails.
 */
function parseRerankResponse(
  content: string,
  candidateCount: number
): Record<number, number> | null {
  try {
    const parsed = JSON.parse(content);
    const scores: Record<number, number> = {};

    if (parsed.scores && Array.isArray(parsed.scores)) {
      for (const entry of parsed.scores) {
        const idx = Number(entry.index);
        const score = Number(entry.score);
        if (idx >= 0 && idx < candidateCount && score >= 1 && score <= 5) {
          scores[idx] = score;
        }
      }
    }

    if (Object.keys(scores).length === 0) return null;
    return scores;
  } catch {
    // Try extracting JSON from text
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return parseRerankResponse(jsonMatch[0], candidateCount);
      } catch {
        return null;
      }
    }
    return null;
  }
}

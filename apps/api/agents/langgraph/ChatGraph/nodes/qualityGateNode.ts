/**
 * Quality Gate Node
 *
 * Lightweight LLM check after reranking to assess whether search results
 * sufficiently cover the user's query. If coverage is insufficient and
 * we haven't exceeded maxSearches, routes back to search with a refined query.
 *
 * This enables iterative search: the graph can loop search → rerank → qualityGate → search
 * for up to maxSearches iterations before falling through to respond.
 */

import { createLogger } from '../../../../utils/logger.js';
import { INTERMEDIATE_MODEL } from '../llmConfig.js';

import type { ChatGraphState } from '../types.js';

const log = createLogger('ChatGraph:QualityGate');

const QUALITY_PROMPT = `Du bewertest ob Suchergebnisse eine Benutzeranfrage ausreichend beantworten können.

Bewerte die Abdeckung auf einer Skala von 1-5:
5 = Vollständig, alle Aspekte der Frage werden abgedeckt
4 = Gut, die wichtigsten Informationen sind vorhanden
3 = Ausreichend, Grundinformationen vorhanden aber lückenhaft
2 = Unzureichend, nur am Rande relevant
1 = Keine Abdeckung, Ergebnisse passen nicht zur Frage

Wenn die Bewertung < 3 ist, schlage eine bessere Suchanfrage vor.
Optional: Wenn die Anfrage mehrere Aspekte hat, nenne die schwach abgedeckten.

Antworte NUR mit JSON:
{ "score": 4, "sufficient": true }
oder
{ "score": 2, "sufficient": false, "refinedQuery": "bessere Suchanfrage hier", "weakAspects": ["Aspekt1"] }`;

/**
 * Quality gate node implementation.
 * Checks if search results adequately cover the query.
 */
export async function qualityGateNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  const { searchResults, searchQuery, searchCount, maxSearches, aiWorkerPool, researchBrief } =
    state;

  // Skip quality check if we've already used max searches or have few results
  if (searchCount >= maxSearches) {
    log.info(`[QualityGate] Skipping — already at max searches (${searchCount}/${maxSearches})`);
    return { qualityAssessmentTimeMs: Date.now() - startTime };
  }

  if (searchResults.length <= 1) {
    log.info('[QualityGate] Skipping — too few results to assess');
    return { qualityAssessmentTimeMs: Date.now() - startTime };
  }

  log.info(
    `[QualityGate] Assessing ${searchResults.length} results for: "${searchQuery?.slice(0, 50)}..."`
  );

  try {
    // Build a compact summary of results for the LLM
    const resultsSummary = searchResults
      .slice(0, 6)
      .map((r, i) => `[${i + 1}] ${r.title}: ${r.content.slice(0, 150)}`)
      .join('\n');

    const response = await aiWorkerPool.processRequest(
      {
        type: 'chat_quality_gate',
        provider: INTERMEDIATE_MODEL.provider,
        systemPrompt: QUALITY_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Suchanfrage: "${searchQuery}"${researchBrief ? `\nRecherche-Kontext: ${researchBrief}` : ''}\n\nErgebnisse:\n${resultsSummary}`,
          },
        ],
        options: {
          model: INTERMEDIATE_MODEL.model,
          max_tokens: 80,
          temperature: 0.0,
          response_format: { type: 'json_object' },
        },
      },
      null
    );

    const parsed = parseQualityResponse(response.content || '');
    const qualityAssessmentTimeMs = Date.now() - startTime;

    if (parsed) {
      log.info(
        `[QualityGate] Score: ${parsed.score}/5, sufficient: ${parsed.sufficient} (${qualityAssessmentTimeMs}ms)`
      );

      if (!parsed.sufficient && parsed.refinedQuery) {
        const weakInfo = parsed.weakAspects?.length
          ? ` (weak: ${parsed.weakAspects.join(', ')})`
          : '';
        log.info(`[QualityGate] Refined query: "${parsed.refinedQuery}"${weakInfo}`);
        return {
          qualityScore: parsed.score,
          qualityAssessmentTimeMs,
          searchQuery: parsed.refinedQuery,
        };
      }

      return {
        qualityScore: parsed.score,
        qualityAssessmentTimeMs,
      };
    }

    // If parsing fails, assume results are sufficient
    log.warn('[QualityGate] Failed to parse response, assuming sufficient');
    return { qualityScore: 3, qualityAssessmentTimeMs };
  } catch (error: unknown) {
    log.error('[QualityGate] Error:', error instanceof Error ? error.message : String(error));
    return {
      qualityScore: 3,
      qualityAssessmentTimeMs: Date.now() - startTime,
    };
  }
}

interface QualityResult {
  score: number;
  sufficient: boolean;
  refinedQuery?: string;
  weakAspects?: string[];
}

interface ParsedQualityResponse {
  score?: unknown;
  sufficient?: unknown;
  refinedQuery?: unknown;
  weakAspects?: unknown;
}

function parseQualityResponse(content: string): QualityResult | null {
  try {
    const parsed = JSON.parse(content) as ParsedQualityResponse;
    if (typeof parsed.score === 'number' && typeof parsed.sufficient === 'boolean') {
      return {
        score: Math.max(1, Math.min(5, parsed.score)),
        sufficient: parsed.sufficient,
        ...(typeof parsed.refinedQuery === 'string' ? { refinedQuery: parsed.refinedQuery } : {}),
        ...(Array.isArray(parsed.weakAspects)
          ? { weakAspects: parsed.weakAspects as string[] }
          : {}),
      };
    }
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return parseQualityResponse(jsonMatch[0]);
      } catch {
        // Fall through
      }
    }
  }
  return null;
}

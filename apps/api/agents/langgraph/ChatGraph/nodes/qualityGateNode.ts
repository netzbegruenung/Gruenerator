/**
 * Quality Gate Node
 *
 * Lightweight LLM check after reranking to assess whether search results
 * sufficiently cover the user's query. On insufficient coverage it reports a
 * score and a `refinedQuery`; acting on that is the caller's job.
 *
 * The only caller is `searchGraphContractRouter`, and it retries search → rerank
 * exactly ONCE — a single `if`, not a loop. The gate itself never runs a second
 * time, so `maxSearches` bounds nothing beyond that one comparison (the executor
 * nodes set `searchCount` to 1 rather than incrementing it).
 */

import { aiText } from '../../../../services/ai/generate.js';
import { createLogger } from '../../../../utils/logger.js';

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
  const { searchResults, searchQuery, searchCount, maxSearches, researchBrief } = state;

  // Skip quality check if we've already used max searches or have few results
  if (searchCount >= maxSearches) {
    log.info(`[QualityGate] Skipping — already at max searches (${searchCount}/${maxSearches})`);
    return { qualityAssessmentTimeMs: Date.now() - startTime };
  }

  if (searchResults.length <= 1) {
    log.info('[QualityGate] Skipping — too few results to assess');
    return { qualityAssessmentTimeMs: Date.now() - startTime };
  }

  // Short-circuit: when the cross-encoder is highly confident in the top
  // result AND we have ≥3 hits, the LLM coverage check is almost always
  // going to say "sufficient" — skipping it saves ~150–300ms per turn.
  // Loop still triggers for weak results (low top score OR few results).
  // If rerank failed, topRerankScore is null and we fall through to the
  // existing LLM path (safety net preserved).
  const STRONG_RERANK_THRESHOLD = 0.7;
  if (
    state.topRerankScore != null &&
    state.topRerankScore >= STRONG_RERANK_THRESHOLD &&
    searchResults.length >= 3
  ) {
    log.info(
      `[QualityGate] Skipping — strong rerank (top=${state.topRerankScore.toFixed(2)}, n=${searchResults.length})`
    );
    return {
      qualityScore: 4,
      qualityAssessmentTimeMs: Date.now() - startTime,
    };
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

    const content = await aiText({
      lane: 'chat_quality_gate',
      pinned: 'standard',
      system: QUALITY_PROMPT,
      prompt: `Suchanfrage: "${searchQuery}"${researchBrief ? `\nRecherche-Kontext: ${researchBrief}` : ''}\n\nErgebnisse:\n${resultsSummary}`,
      maxOutputTokens: 80,
      temperature: 0.0,
      json: true,
    });

    const parsed = parseQualityResponse(content);
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

    // Parse failure: route to respond (qualityScore=0 < 3 but no refinedQuery means no loop)
    // and record the failure so respond / telemetry can see the gate was bypassed.
    const parseFailMsg = 'qualityGate response could not be parsed';
    log.error(`[QualityGate] ${parseFailMsg} — bypassing gate`);
    return {
      qualityScore: 0,
      qualityAssessmentTimeMs,
      searchErrors: [{ source: 'qualityGate', message: parseFailMsg }],
    };
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error('[QualityGate] Error:', errMsg);
    return {
      qualityScore: 0,
      qualityAssessmentTimeMs: Date.now() - startTime,
      searchErrors: [{ source: 'qualityGate', message: errMsg }],
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

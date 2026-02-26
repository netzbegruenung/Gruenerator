/**
 * Rerank utility for notebook search results.
 *
 * Uses mistral-small to score search results by relevance, then filters
 * and returns the top N. Adapted from ChatGraph's rerankNode but operates
 * on ExpandedChunkResult[] + referencesMap (notebook types).
 */

import { createLogger } from '../../utils/logger.js';

import type { ExpandedChunkResult } from '../search/types.js';

const log = createLogger('NotebookRerank');

const RERANK_PROMPT = `Du bewertest die Relevanz von Suchergebnissen für eine Benutzeranfrage.

Für jedes Ergebnis vergib einen Relevanz-Score von 1-5:
5 = Direkt relevant, beantwortet die Frage
4 = Sehr relevant, enthält wichtige Informationen
3 = Teilweise relevant, enthält Hintergrundinformationen
2 = Wenig relevant, nur am Rande verwandt
1 = Nicht relevant

Antworte NUR mit JSON:
{ "scores": [{"index": 0, "score": 5}, {"index": 1, "score": 3}, ...] }`;

export interface RerankOptions {
  results: ExpandedChunkResult[];
  referencesMap: Record<string, any>;
  question: string;
  aiWorkerPool: any;
  limit?: number;
  inputLimit?: number;
}

export interface RerankResult {
  results: ExpandedChunkResult[];
  referencesMap: Record<string, any>;
  contextSummary: string;
  rerankTimeMs: number;
}

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

export async function rerankNotebookResults({
  results,
  referencesMap,
  question,
  aiWorkerPool,
  limit = 10,
  inputLimit = 20,
}: RerankOptions): Promise<RerankResult> {
  const startTime = Date.now();

  if (results.length <= 3) {
    log.info(`[Rerank] Skipping — only ${results.length} results`);
    return {
      results,
      referencesMap,
      contextSummary: buildContextSummary(referencesMap),
      rerankTimeMs: Date.now() - startTime,
    };
  }

  const candidates = results.slice(0, inputLimit);

  try {
    const passageList = candidates
      .map((r, i) => `[${i}] ${r.title}\n${r.snippet.slice(0, 300)}`)
      .join('\n\n');

    const userMessage = `Suchanfrage: "${question}"\n\nErgebnisse:\n${passageList}`;

    const response = await aiWorkerPool.processRequest(
      {
        type: 'notebook_rerank',
        provider: 'mistral',
        systemPrompt: RERANK_PROMPT,
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

    const parsed = parseRerankResponse(response.content || '', candidates.length);
    const rerankTimeMs = Date.now() - startTime;

    if (!parsed) {
      log.warn('[Rerank] Failed to parse response, keeping original order');
      return {
        results,
        referencesMap,
        contextSummary: buildContextSummary(referencesMap),
        rerankTimeMs,
      };
    }

    // Score and sort candidates
    const scored = candidates.map((r, i) => ({
      result: r,
      originalIndex: i,
      score: parsed[i] ?? 2.5,
    }));
    scored.sort((a, b) => b.score - a.score);

    // Filter out low-relevance (score 1) and take top N
    const filtered = scored.filter((s) => s.score > 1).slice(0, limit);
    const rerankedResults = filtered.map((s) => s.result);

    // Build a set of kept document_ids to filter the referencesMap
    const keptDocIds = new Set(rerankedResults.map((r) => r.document_id));
    const filteredReferencesMap: Record<string, any> = {};
    for (const [key, ref] of Object.entries(referencesMap)) {
      if (keptDocIds.has(ref.document_id)) {
        filteredReferencesMap[key] = ref;
      }
    }

    // Renumber references 1..N sequentially
    const renumberedMap: Record<string, any> = {};
    let newIndex = 1;
    for (const ref of Object.values(filteredReferencesMap)) {
      renumberedMap[String(newIndex)] = ref;
      newIndex++;
    }

    log.info(
      `[Rerank] ${candidates.length} → ${rerankedResults.length} results in ${rerankTimeMs}ms`
    );

    return {
      results: rerankedResults,
      referencesMap: renumberedMap,
      contextSummary: buildContextSummary(renumberedMap),
      rerankTimeMs,
    };
  } catch (error: any) {
    log.error('[Rerank] Error:', error.message);
    return {
      results,
      referencesMap,
      contextSummary: buildContextSummary(referencesMap),
      rerankTimeMs: Date.now() - startTime,
    };
  }
}

function buildContextSummary(referencesMap: Record<string, any>): string {
  return Object.keys(referencesMap)
    .map((id) => {
      const ref = referencesMap[id];
      const snippet = ref.snippets[0]?.[0] || '';
      const short = snippet.slice(0, 150).replace(/\s+/g, ' ').trim();
      const collectionTag = ref.collection_name ? `[${ref.collection_name}] ` : '';
      return `${id}. ${collectionTag}${ref.title} — "${short}"`;
    })
    .join('\n');
}

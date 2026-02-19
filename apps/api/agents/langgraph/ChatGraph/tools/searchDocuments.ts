/**
 * Search Documents Tool
 *
 * Searches Grüne party documents across multiple Qdrant collections.
 * Wraps executeDirectSearch() with cross-collection search, deduplication,
 * and integrated reranking (Mistral-small scoring + MMR diversity).
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

import { executeDirectSearch } from '../../../../routes/chat/agents/directSearch.js';
import { getQdrantDocumentService } from '../../../../services/document-services/DocumentSearchService/index.js';
import { applyMMR } from '../../../../services/search/DiversityReranker.js';
import { createLogger } from '../../../../utils/logger.js';
import {
  getDefaultCollectionsForLocale,
  getSupplementaryCollectionsForLocale,
} from '../nodes/searchNode.js';

import type { ToolDependencies } from './registry.js';

const log = createLogger('Tool:SearchDocuments');

const RERANK_PROMPT = `Du bewertest die Relevanz von Suchergebnissen für eine Benutzeranfrage.

Für jedes Ergebnis vergib einen Relevanz-Score von 1-5:
5 = Direkt relevant, beantwortet die Frage
4 = Sehr relevant, enthält wichtige Informationen
3 = Teilweise relevant, enthält Hintergrundinformationen
2 = Wenig relevant, nur am Rande verwandt
1 = Nicht relevant

Antworte NUR mit JSON:
{ "scores": [{"index": 0, "score": 5}, {"index": 1, "score": 3}, ...] }`;

interface ScoredResult {
  source: string;
  title: string;
  content: string;
  url?: string;
  relevance: number;
}

async function rerankResults(
  results: ScoredResult[],
  query: string,
  aiWorkerPool: any
): Promise<ScoredResult[]> {
  if (results.length <= 3) return results;

  const candidates = results.slice(0, 12);
  const passageList = candidates
    .map((r, i) => `[${i}] ${r.title}\n${r.content.slice(0, 300)}`)
    .join('\n\n');

  try {
    const response = await aiWorkerPool.processRequest(
      {
        type: 'chat_rerank',
        provider: 'mistral',
        systemPrompt: RERANK_PROMPT,
        messages: [
          { role: 'user', content: `Suchanfrage: "${query}"\n\nErgebnisse:\n${passageList}` },
        ],
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

    const rawContent = (response.content || '{}').trim();
    const cleanedContent = rawContent
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    const parsed = JSON.parse(cleanedContent);
    if (parsed.scores && Array.isArray(parsed.scores)) {
      for (const entry of parsed.scores) {
        const idx = Number(entry.index);
        const score = Number(entry.score);
        if (idx >= 0 && idx < candidates.length && score >= 1 && score <= 5) {
          candidates[idx].relevance = score / 5;
        }
      }
    }
  } catch (err: any) {
    log.warn(`[SearchDocuments] Rerank failed, keeping original order: ${err.message}`);
    return results;
  }

  candidates.sort((a, b) => b.relevance - a.relevance);
  const filtered = candidates.filter((r) => r.relevance > 0.2);
  const diverse = filtered.length > 3 ? applyMMR(filtered, 0.7, 2) : filtered;
  return diverse.slice(0, 8);
}

export function createSearchDocumentsTool(deps: ToolDependencies): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'search_documents',
    description:
      'Durchsuche Grüne Parteidokumente, Positionen, Programme und Beschlüsse. ' +
      'Nutze dieses Tool bei Fragen zu Partei-Positionen, Wahlprogrammen, Grundsatzprogramm, ' +
      'oder internen Dokumenten der Grünen.',
    schema: z.object({
      query: z
        .string()
        .describe('Die Suchanfrage — nur das faktische Thema, ohne Aufgabenanweisungen'),
      collections: z
        .array(z.string())
        .optional()
        .describe(
          'Optionale Qdrant-Collections (z.B. "deutschland", "bundestagsfraktion", "gruene-de", "kommunalwiki"). Standard: alle'
        ),
      document_ids: z
        .array(z.string())
        .optional()
        .describe('Optionale Dokument-IDs zur Einschränkung der Suche auf bestimmte Dokumente'),
      topK: z.number().optional().describe('Maximale Ergebnisanzahl pro Collection (Standard: 3)'),
    }),
    func: async ({ query, collections, document_ids, topK }) => {
      // Document-scoped search: filter by specific document IDs
      if (document_ids?.length) {
        const userId = (deps.agentConfig as any).userId;
        log.info(
          `[SearchDocuments] Document-scoped search: query="${query.slice(0, 60)}" docs=${document_ids.length}`
        );

        try {
          const documentSearchService = getQdrantDocumentService();
          const response = await documentSearchService.search({
            query,
            userId,
            options: {
              limit: topK || 8,
              mode: 'hybrid',
              threshold: 0.2,
            },
            filters: {
              documentIds: document_ids,
            },
          });

          const results: ScoredResult[] = (response.results || []).map((r: any) => ({
            source: `document:${r.document_id || 'unknown'}`,
            title: r.title || r.source || 'Dokument',
            content: r.chunk_text || r.excerpt || '',
            url: r.source_url || undefined,
            relevance: r.score ?? 0.5,
          }));

          const reranked = await rerankResults(results, query, deps.aiWorkerPool);

          if (reranked.length === 0) {
            return 'Keine relevanten Inhalte in den referenzierten Dokumenten gefunden.';
          }

          const formatted = reranked
            .map((r, i) => {
              const urlTag = r.url ? ` (${r.url})` : '';
              return `[${i + 1}] ${r.title}${urlTag}\n${r.content.slice(0, 600)}`;
            })
            .join('\n\n');

          return `${reranked.length} Ergebnisse aus referenzierten Dokumenten:\n\n${formatted}`;
        } catch (err: any) {
          log.warn(`[SearchDocuments] Document-scoped search failed: ${err.message}`);
          return 'Fehler bei der Dokumentensuche. Bitte versuche es erneut.';
        }
      }

      let defaultCollections: string[];
      if (deps.agentConfig.toolRestrictions?.allowedCollections?.length) {
        defaultCollections = deps.agentConfig.toolRestrictions.allowedCollections;
      } else if (deps.agentConfig.toolRestrictions?.defaultCollection) {
        const dc = deps.agentConfig.toolRestrictions.defaultCollection;
        defaultCollections = [dc, ...getSupplementaryCollectionsForLocale(deps.userLocale)];
      } else if (deps.defaultNotebookCollectionIds?.length) {
        defaultCollections = deps.defaultNotebookCollectionIds;
      } else {
        defaultCollections = getDefaultCollectionsForLocale(deps.userLocale);
      }
      const collectionsToSearch = collections?.length ? collections : defaultCollections;
      const uniqueCollections = [...new Set<string>(collectionsToSearch)];
      const limit = topK || 3;

      log.info(
        `[SearchDocuments] query="${query.slice(0, 60)}" collections=${uniqueCollections.join(',')}`
      );

      const searchPromises = uniqueCollections.map((collection) =>
        executeDirectSearch({ query, collection, limit }).catch((err: any) => {
          log.warn(`[SearchDocuments] Collection ${collection} failed: ${err.message}`);
          return null;
        })
      );

      const searchResults = await Promise.all(searchPromises);

      const allResults: ScoredResult[] = [];
      const seenUrls = new Set<string>();

      for (const result of searchResults) {
        if (!result?.results) continue;
        for (const r of result.results) {
          if (r.url && seenUrls.has(r.url)) continue;
          if (r.url) seenUrls.add(r.url);

          allResults.push({
            source: `gruenerator:${result.collection}`,
            title: r.source || result.collection,
            content: r.excerpt || '',
            url: r.url || undefined,
            relevance: r.relevance === 'Sehr hoch' ? 0.9 : r.relevance === 'Hoch' ? 0.7 : 0.5,
          });
        }
      }

      allResults.sort((a, b) => b.relevance - a.relevance);

      // Integrated reranking
      const reranked = await rerankResults(allResults, query, deps.aiWorkerPool);

      if (reranked.length === 0) {
        return 'Keine relevanten Dokumente gefunden.';
      }

      // Format as text with citation markers
      const formatted = reranked
        .map((r, i) => {
          const urlTag = r.url ? ` (${r.url})` : '';
          return `[${i + 1}] ${r.title}${urlTag}\n${r.content.slice(0, 600)}`;
        })
        .join('\n\n');

      return `${reranked.length} Dokumente gefunden:\n\n${formatted}`;
    },
  });
}

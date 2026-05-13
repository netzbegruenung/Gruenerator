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
import { regoloRerankService } from '../../../../services/search/RegoloRerankService.js';
import { createLogger } from '../../../../utils/logger.js';
import {
  getDefaultCollectionsForLocale,
  getSupplementaryCollectionsForLocale,
} from '../nodes/searchNode.js';

import type { ToolDependencies } from './registry.js';
import type { DocumentResult } from '../../../../services/BaseSearchService/types.js';

const log = createLogger('Tool:SearchDocuments');

interface ScoredResult {
  source: string;
  title: string;
  content: string;
  url?: string;
  relevance: number;
  [key: string]: unknown;
}

async function rerankResults(results: ScoredResult[], query: string): Promise<ScoredResult[]> {
  if (results.length <= 3) return results;

  const candidates = results.slice(0, 12);

  try {
    const documents = candidates.map((r) => `${r.title}\n${r.content.slice(0, 300)}`);
    const rerankResults = await regoloRerankService.rerank({
      query,
      documents,
      topN: 12,
    });

    const scoreMap = new Map<number, number>();
    for (const r of rerankResults) {
      scoreMap.set(r.originalIndex, r.relevanceScore);
    }

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (candidate) {
        candidate.relevance = scoreMap.get(i) ?? candidate.relevance;
      }
    }
  } catch (err: unknown) {
    log.warn(
      `[SearchDocuments] Rerank failed, keeping original order: ${err instanceof Error ? err.message : String(err)}`
    );
    return results;
  }

  candidates.sort((a, b) => b.relevance - a.relevance);
  const filtered = candidates.filter((r) => r.relevance > 0.2);
  const diverse = filtered.length > 3 ? applyMMR(filtered, 0.7, 2) : filtered;
  return diverse.slice(0, 8);
}

export function createSearchDocumentsTool(deps: ToolDependencies): DynamicStructuredTool {
  // @ts-expect-error - Zod schema type compatibility with LangChain ToolInputSchemaBase
  return new DynamicStructuredTool({
    name: 'search_documents',
    description:
      'Durchsuche Grüne Parteidokumente, Positionen, Programme und Beschlüsse. ' +
      'Nutze dieses Tool bei Fragen zu Partei-Positionen, Wahlprogrammen, Grundsatzprogramm, ' +
      'oder internen Dokumenten der Grünen.',
    schema: z
      .object({
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
        topK: z
          .number()
          .optional()
          .describe('Maximale Ergebnisanzahl pro Collection (Standard: 3)'),
      })
      .describe('Dokumentensuche'),
    func: async (input: {
      query: string;
      collections?: string[];
      document_ids?: string[];
      topK?: number;
    }) => {
      const { query, collections, document_ids, topK } = input;
      // Document-scoped search: filter by specific document IDs
      if (document_ids?.length) {
        const userId = deps.agentConfig.userId;
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

          const results: ScoredResult[] = (response.results || []).map((r: DocumentResult) => ({
            source: `document:${r.document_id || 'unknown'}`,
            title: r.title || r.document_id || 'Dokument',
            content: r.relevant_content || '',
            ...(r.source_url != null && { url: r.source_url }),
            relevance: r.similarity_score ?? 0.5,
          }));

          const reranked = await rerankResults(results, query);

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
        } catch (err: unknown) {
          log.warn(
            `[SearchDocuments] Document-scoped search failed: ${err instanceof Error ? err.message : String(err)}`
          );
          return 'Fehler bei der Dokumentensuche. Bitte versuche es erneut.';
        }
      }

      let defaultCollections: string[];
      if (deps.agentConfig.toolRestrictions?.allowedCollections?.length) {
        defaultCollections = [...deps.agentConfig.toolRestrictions.allowedCollections];
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

      const agentLv = deps.agentConfig.defaultFilter?.landesverband;
      const searchPromises = uniqueCollections.map((collection) =>
        executeDirectSearch({
          query,
          collection,
          limit,
          ...(agentLv != null ? { agentLandesverband: agentLv } : {}),
        }).catch((err: unknown) => {
          log.warn(
            `[SearchDocuments] Collection ${collection} failed: ${err instanceof Error ? err.message : String(err)}`
          );
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

          const scored: ScoredResult = {
            source: `gruenerator:${result.collection}`,
            title: r.source || result.collection,
            content: r.excerpt || '',
            relevance: r.relevance === 'Sehr hoch' ? 0.9 : r.relevance === 'Hoch' ? 0.7 : 0.5,
            ...(r.url != null && { url: r.url }),
          };
          allResults.push(scored);
        }
      }

      allResults.sort((a, b) => b.relevance - a.relevance);

      // Integrated reranking
      const reranked = await rerankResults(allResults, query);

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

/**
 * ts-rest contract router for /api/research/* (system-collection manual
 * research). Replaces the legacy express routes that used to live in
 * researchController.ts — that file now holds only shared helpers
 * (snippet formatting, filter cache, warmFilterCache).
 *
 * Auth is enforced via the `requireAuth` prefix middleware on `/api/research`
 * in routes.ts (registered before this router is mounted), not per-handler.
 */
import { researchContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  type SubcategoryFilters,
  SYSTEM_COLLECTIONS,
  getSearchableSystemCollectionIds,
  isAgentOnlyCollectionId,
  getSearchParams,
  getSystemCollectionConfig,
  applyDefaultFilter,
  buildSubcategoryFilter,
} from '../../config/systemCollectionsConfig.js';
import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import { scrollDocuments } from '../../database/services/QdrantService/operations/batchOperations.js';
import { getQdrantDocumentService } from '../../services/document-services/index.js';
import { rerankPipeline } from '../../services/search/rerankPipeline.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import {
  CHUNK_PREVIEW_MAX_CHARS,
  computeMergedFilters,
  getCachedFilters,
  highlightSnippet,
  setCachedFilters,
  truncateSnippet,
} from './researchController.js';

import type { DocumentResult, TopChunk } from '../../services/BaseSearchService/types.js';
import type { Application } from 'express';

const log = createLogger('researchContractRouter');

interface TaggedDocumentResult extends DocumentResult {
  collection_id: string;
  collection_name: string;
}

const s = initServer();

export const researchContractRouter = s.router(researchContract, {
  collections: async () => {
    const collections = Object.values(SYSTEM_COLLECTIONS).map((config) => ({
      id: config.id,
      name: config.name,
      description: config.description,
      filterableFields: config.filterableFields.map((f) => f.field),
    }));

    return { status: 200 as const, body: collections };
  },

  filters: async (args) => {
    try {
      const collectionIdsParam = args.query.collectionIds;
      const requestedIds =
        typeof collectionIdsParam === 'string' && collectionIdsParam.length > 0
          ? collectionIdsParam
              .split(',')
              .filter((id) => id in SYSTEM_COLLECTIONS && !isAgentOnlyCollectionId(id))
          : getSearchableSystemCollectionIds();

      if (requestedIds.length === 0) {
        return { status: 400 as const, body: { error: 'No valid collection IDs provided.' } };
      }

      const cacheKey = [...requestedIds].sort().join(',');
      const cached = getCachedFilters(cacheKey);
      if (cached) {
        return { status: 200 as const, body: cached };
      }

      const response = await computeMergedFilters(requestedIds);
      setCachedFilters(cacheKey, response);
      return { status: 200 as const, body: response };
    } catch (error) {
      log.error(
        `Research filters failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return { status: 500 as const, body: { error: 'Failed to get filters.' } };
    }
  },

  search: async (args) => {
    const startTime = Date.now();
    const { query, collectionIds, limit, filters, mode, sortBy } = args.body;

    const trimmedQuery = (query || '').trim();
    if (trimmedQuery.length < 2) {
      return { status: 400 as const, body: { error: 'Query must be at least 2 characters.' } };
    }

    const effectiveMode = mode ?? 'hybrid';
    const effectiveSort = sortBy ?? 'relevance';
    const effectiveLimit = Math.min(Math.max(limit ?? 30, 1), 100);

    const requestedIds = collectionIds?.length
      ? collectionIds.filter((id) => id in SYSTEM_COLLECTIONS && !isAgentOnlyCollectionId(id))
      : getSearchableSystemCollectionIds();

    if (requestedIds.length === 0) {
      return { status: 400 as const, body: { error: 'No valid collection IDs provided.' } };
    }

    // Resolve search weights from mode
    let vectorWeight = 0.7;
    let textWeight = 0.3;
    if (effectiveMode === 'vector') {
      vectorWeight = 1.0;
      textWeight = 0.0;
    } else if (effectiveMode === 'text') {
      vectorWeight = 0.0;
      textWeight = 1.0;
    }

    // Build user filter from subcategory filters
    const userFilter = buildSubcategoryFilter(filters as SubcategoryFilters | null | undefined);

    try {
      const documentSearchService = getQdrantDocumentService();

      const searchPromises = requestedIds.map(
        async (collectionId): Promise<TaggedDocumentResult[]> => {
          const config = SYSTEM_COLLECTIONS[collectionId];
          if (!config) return [];

          const searchParams = getSearchParams(collectionId);

          // Merge: defaultFilter (landesverband scoping) + userFilter (selected facets)
          const additionalFilter = applyDefaultFilter(collectionId, userFilter);

          try {
            const resp = await documentSearchService.search({
              query: trimmedQuery,
              userId: undefined,
              options: {
                limit: searchParams.limit,
                mode: effectiveMode === 'text' ? 'text' : 'hybrid',
                vectorWeight,
                textWeight,
                threshold: searchParams.threshold,
                searchCollection: config.qdrantCollection,
                recallLimit: searchParams.recallLimit,
                qualityMin: searchParams.qualityMin,
                additionalFilter,
              },
            });

            return (resp.results || []).map((doc) => ({
              ...doc,
              collection_id: collectionId,
              collection_name: config.name,
              published_at: doc.published_at ?? null,
            }));
          } catch (error: unknown) {
            log.error(
              `Search error for ${collectionId}: ${error instanceof Error ? error.message : String(error)}`
            );
            return [];
          }
        }
      );

      const allResults = (await Promise.all(searchPromises)).flat();

      // Deduplicate by source_url (or document_id), keeping highest similarity_score
      const dedupMap = new Map<string, TaggedDocumentResult>();
      for (const result of allResults) {
        const key = result.source_url || result.document_id;
        const existing = dedupMap.get(key);
        if (!existing || result.similarity_score > existing.similarity_score) {
          dedupMap.set(key, result);
        }
      }

      let deduped = Array.from(dedupMap.values()).filter((r) => r.similarity_score >= 0.35);

      // Cross-encoder rerank for relevance mode. Bi-encoder embeddings can't tell
      // "Artenschutz" from "Datenschutz" (both project to "Schutz" topics);
      // a cross-encoder reads query+document together and scores the actual match.
      if (effectiveSort === 'relevance' && deduped.length > 3) {
        const rerankInputLimit = 30;
        const candidates = deduped.slice(0, rerankInputLimit);
        const items = candidates.map((r) => ({
          title: r.title ?? '',
          content: (r.relevant_content ?? '').slice(0, 500),
          relevance: r.similarity_score,
        }));
        const { rankedIndices, scores } = await rerankPipeline({
          query: trimmedQuery,
          items,
          inputLimit: rerankInputLimit,
          outputLimit: effectiveLimit,
          minRelevance: 0.05,
          minKeep: Math.min(5, candidates.length),
          applyDiversity: true,
        });
        deduped = rankedIndices.flatMap((i) => {
          const c = candidates[i];
          if (!c) return [];
          return [{ ...c, similarity_score: scores.get(i) ?? c.similarity_score }];
        });
      } else if (effectiveSort === 'date_desc') {
        deduped.sort((a, b) => {
          const dateA = a.published_at || '';
          const dateB = b.published_at || '';
          if (dateB !== dateA) return dateB.localeCompare(dateA);
          return b.similarity_score - a.similarity_score;
        });
      } else if (effectiveSort === 'date_asc') {
        deduped.sort((a, b) => {
          const dateA = a.published_at || '';
          const dateB = b.published_at || '';
          if (dateA !== dateB) return dateA.localeCompare(dateB);
          return b.similarity_score - a.similarity_score;
        });
      } else {
        deduped.sort((a, b) => b.similarity_score - a.similarity_score);
      }

      deduped = deduped.slice(0, effectiveLimit);

      // Extract best snippets with query-term highlighting. Map explicitly to
      // the contract result shape (normalise optional → null).
      const truncated = deduped.map((r) => ({
        document_id: r.document_id,
        title: r.title ?? 'Unbekanntes Dokument',
        source_url: r.source_url ?? null,
        relevant_content: highlightSnippet(r.relevant_content, trimmedQuery),
        similarity_score: r.similarity_score,
        chunk_count: r.chunk_count,
        top_chunks: r.top_chunks.map((chunk: TopChunk) => ({
          preview: truncateSnippet(chunk.preview, CHUNK_PREVIEW_MAX_CHARS),
          chunk_index: chunk.chunk_index,
          page_number: chunk.page_number ?? null,
        })),
        collection_id: r.collection_id,
        collection_name: r.collection_name,
        published_at: r.published_at ?? null,
      }));

      const collectionsFound = [...new Set(deduped.map((r) => r.collection_id))];

      return {
        status: 200 as const,
        body: {
          results: truncated,
          metadata: {
            totalResults: deduped.length,
            collections: collectionsFound,
            timeMs: Date.now() - startTime,
          },
        },
      };
    } catch (error: unknown) {
      log.error(
        `Research search failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return { status: 500 as const, body: { error: 'Search failed. Please try again.' } };
    }
  },

  similar: async (args) => {
    const startTime = Date.now();
    const { sourceUrl, collectionId, limit } = args.body;

    const systemConfig = getSystemCollectionConfig(collectionId);
    if (!systemConfig) {
      return { status: 400 as const, body: { error: 'Invalid collectionId.' } };
    }

    const effectiveLimit = Math.min(Math.max(limit ?? 5, 1), 20);

    try {
      const qdrant = getQdrantInstance();
      await qdrant.init();

      if (!qdrant.client) {
        return { status: 500 as const, body: { error: 'Qdrant client not available.' } };
      }

      const qdrantCollection = systemConfig.qdrantCollection;

      // Find the source document's chunks by source_url
      const sourcePoints = await scrollDocuments(
        qdrant.client,
        qdrantCollection,
        {
          must: [{ key: 'source_url', match: { value: sourceUrl } }],
        },
        { limit: 20, withPayload: true, withVector: false }
      );

      if (sourcePoints.length === 0) {
        return {
          status: 200 as const,
          body: {
            results: [],
            metadata: { totalResults: 0, collections: [], timeMs: Date.now() - startTime },
          },
        };
      }

      // Use point IDs as positive examples for recommend
      const positiveIds = sourcePoints.map((p) => p.id);

      const recommendResult = await qdrant.client.recommend(qdrantCollection, {
        positive: positiveIds,
        limit: effectiveLimit * 3, // Over-fetch to account for dedup
        filter: {
          must_not: [{ key: 'source_url', match: { value: sourceUrl } }],
        },
        with_payload: true,
      });

      // Deduplicate by source_url, keeping highest score
      const dedupMap = new Map<
        string,
        { score: number; payload: Record<string, unknown>; id: string | number }
      >();

      for (const point of recommendResult) {
        const payload = (point.payload as Record<string, unknown>) || {};
        const url = (payload.source_url as string) || String(point.id);
        const score = point.score ?? 0;
        const existing = dedupMap.get(url);
        if (!existing || score > existing.score) {
          dedupMap.set(url, { score, payload, id: point.id });
        }
      }

      const deduped = Array.from(dedupMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, effectiveLimit);

      // Format results to match the search endpoint format
      const results = deduped.map((item) => {
        const payload = item.payload;
        return {
          document_id: String(payload.document_id || item.id),
          title: String(payload.title || 'Unbekanntes Dokument'),
          source_url: (payload.source_url as string) || null,
          relevant_content: truncateSnippet(
            String(payload.relevant_content || payload.content || payload.text || '')
          ),
          similarity_score: item.score,
          chunk_count: 1,
          top_chunks: [],
          collection_id: collectionId,
          collection_name: systemConfig.name,
          published_at: (payload.published_at as string) ?? null,
        };
      });

      const collectionsFound = [...new Set(results.map((r) => r.collection_id))];

      return {
        status: 200 as const,
        body: {
          results,
          metadata: {
            totalResults: results.length,
            collections: collectionsFound,
            timeMs: Date.now() - startTime,
          },
        },
      };
    } catch (error: unknown) {
      log.error(
        `Research similar failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return { status: 500 as const, body: { error: 'Similar search failed. Please try again.' } };
    }
  },
});

export function mountResearchContractRouter(app: Application): void {
  createExpressEndpoints(researchContract, researchContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'researchContract'),
  });
}

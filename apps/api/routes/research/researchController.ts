import express, { type Request, type Response, type Router } from 'express';
import { z } from 'zod';

import {
  type SubcategoryFilters,
  SYSTEM_COLLECTIONS,
  getAllSystemCollectionIds,
  getSearchParams,
  getSystemCollectionConfig,
  getCollectionFilterableFields,
  getCollectionDefaultFilter,
  applyDefaultFilter,
  buildSubcategoryFilter,
} from '../../config/systemCollectionsConfig.js';
import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import { scrollDocuments } from '../../database/services/QdrantService/operations/batchOperations.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { getQdrantDocumentService } from '../../services/document-services/index.js';
import { createLogger } from '../../utils/logger.js';

import type { DocumentResult, TopChunk } from '../../services/BaseSearchService/types.js';

const log = createLogger('ResearchController');
const router: Router = express.Router();

const SNIPPET_MAX_CHARS = 400;
const CHUNK_PREVIEW_MAX_CHARS = 200;

function truncateSnippet(text: string, limit: number = SNIPPET_MAX_CHARS): string {
  if (!text || text.length <= limit) return text;

  const truncated = text.slice(0, limit);
  const lastSentence = truncated.search(/[.!?]\s[^.!?]*$/);
  if (lastSentence > limit * 0.4) {
    return truncated.slice(0, lastSentence + 1);
  }

  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > limit * 0.6) {
    return truncated.slice(0, lastSpace) + ' …';
  }

  return truncated + ' …';
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Extract the best snippet from text based on query terms, with <mark> highlighting.
 * Falls back to plain truncation if no query terms match.
 */
function highlightSnippet(text: string, query: string, limit: number = SNIPPET_MAX_CHARS): string {
  if (!text || !query) return truncateSnippet(text, limit);

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  if (terms.length === 0) return truncateSnippet(text, limit);

  const textLower = text.toLowerCase();

  // Find the best window: slide through text, score by term matches
  let bestStart = 0;
  let bestScore = 0;

  const step = 40;
  for (let start = 0; start < text.length - limit / 2; start += step) {
    const end = Math.min(start + limit, text.length);
    const window = textLower.slice(start, end);
    let score = 0;
    for (const term of terms) {
      let idx = 0;
      while ((idx = window.indexOf(term, idx)) !== -1) {
        score++;
        idx += term.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }

  if (bestScore === 0) return truncateSnippet(text, limit);

  // Extract window, align to word boundaries
  let start = bestStart;
  let end = Math.min(start + limit, text.length);

  if (start > 0) {
    const spaceAfter = text.indexOf(' ', start);
    if (spaceAfter !== -1 && spaceAfter < start + 20) start = spaceAfter + 1;
  }
  if (end < text.length) {
    const spaceBefore = text.lastIndexOf(' ', end);
    if (spaceBefore > end - 20) end = spaceBefore;
  }

  const snippet = text.slice(start, end);
  const prefix = start > 0 ? '… ' : '';
  const suffix = end < text.length ? ' …' : '';

  // Highlight terms with <mark> tags
  const escaped = escapeHtml(snippet);
  const termPattern = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const highlighted = escaped.replace(new RegExp(`(${termPattern})`, 'gi'), '<mark>$1</mark>');

  return prefix + highlighted + suffix;
}

// =============================================================================
// Types
// =============================================================================

interface TaggedDocumentResult extends DocumentResult {
  collection_id: string;
  collection_name: string;
}

const researchSearchSchema = z.object({
  query: z.string().min(2),
  collectionIds: z.array(z.string()).nullish(),
  limit: z.number().nullish(),
  filters: z.record(z.unknown()).nullish(),
  mode: z.enum(['hybrid', 'vector', 'text']).nullish(),
  sortBy: z.enum(['relevance', 'date_desc', 'date_asc']).nullish(),
});

type ResearchSearchBody = z.infer<typeof researchSearchSchema>;

// =============================================================================
// Filter Cache (5-minute TTL)
// =============================================================================

const FILTER_CACHE_TTL_MS = 30 * 60 * 1000;
const filterCache = new Map<string, { data: unknown; timestamp: number }>();

function getCachedFilters(key: string): unknown | null {
  const entry = filterCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > FILTER_CACHE_TTL_MS) {
    filterCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedFilters(key: string, data: unknown): void {
  filterCache.set(key, { data, timestamp: Date.now() });
}

// =============================================================================
// GET /research/collections
// =============================================================================

router.get('/collections', (_req: Request, res: Response): void => {
  const collections = Object.values(SYSTEM_COLLECTIONS).map((config) => ({
    id: config.id,
    name: config.name,
    description: config.description,
    filterableFields: config.filterableFields.map((f) => f.field),
  }));

  res.json(collections);
});

// =============================================================================
// GET /research/filters?collectionIds=grundsatz-system,kommunalwiki-system
// =============================================================================

router.get('/filters', async (req: Request, res: Response): Promise<void> => {
  try {
    const collectionIdsParam = req.query.collectionIds;
    const requestedIds =
      typeof collectionIdsParam === 'string' && collectionIdsParam.length > 0
        ? collectionIdsParam.split(',').filter((id) => id in SYSTEM_COLLECTIONS)
        : getAllSystemCollectionIds();

    if (requestedIds.length === 0) {
      res.status(400).json({ error: 'No valid collection IDs provided.' });
      return;
    }

    const cacheKey = [...requestedIds].sort().join(',');
    const cached = getCachedFilters(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const qdrant = getQdrantInstance();
    await qdrant.init();

    type FilterEntry = {
      label: string;
      type: 'keyword' | 'date_range';
      values?: Array<{ value: string; count: number }>;
      min?: string;
      max?: string;
    };

    // Build all field-fetch promises across all collections in parallel
    const fieldPromises = requestedIds.flatMap((collectionId) => {
      const systemConfig = getSystemCollectionConfig(collectionId);
      if (!systemConfig) return [];

      const filterableFields = getCollectionFilterableFields(collectionId);
      const defaultFilter = getCollectionDefaultFilter(collectionId);
      const baseFilter = defaultFilter
        ? {
            must: [
              {
                key: defaultFilter.field,
                match: Array.isArray(defaultFilter.value)
                  ? { any: defaultFilter.value }
                  : { value: defaultFilter.value },
              },
            ],
          }
        : null;

      return filterableFields.map(async (field) => {
        try {
          if (field.type === 'date_range') {
            const { min, max } = await qdrant.getDateRange(
              systemConfig.qdrantCollection,
              field.field,
              baseFilter
            );
            return {
              field: field.field,
              label: field.label,
              type: field.type as 'keyword' | 'date_range',
              min,
              max,
            };
          } else {
            const values = await qdrant.getFieldValueCounts(
              systemConfig.qdrantCollection,
              field.field,
              50,
              baseFilter
            );
            return {
              field: field.field,
              label: field.label,
              type: field.type as 'keyword' | 'date_range',
              values,
            };
          }
        } catch (fieldError) {
          const err = fieldError as Error;
          log.warn(
            `Failed to get filter values for ${field.field} in ${collectionId}: ${err.message}`
          );
          return {
            field: field.field,
            label: field.label,
            type: field.type as 'keyword' | 'date_range',
            error: true,
          };
        }
      });
    });

    const results = await Promise.all(fieldPromises);

    // Merge results by field name
    const mergedFilters: Record<string, FilterEntry> = {};

    for (const result of results) {
      if (result.type === 'date_range') {
        if (mergedFilters[result.field]) {
          const existing = mergedFilters[result.field];
          if (result.min && (!existing.min || result.min < existing.min)) existing.min = result.min;
          if (result.max && (!existing.max || result.max > existing.max)) existing.max = result.max;
        } else if (result.min || result.max) {
          mergedFilters[result.field] = {
            label: result.label,
            type: 'date_range',
            ...(result.min != null && { min: result.min }),
            ...(result.max != null && { max: result.max }),
          };
        }
      } else {
        const values = 'values' in result ? (result.values ?? []) : [];
        if (mergedFilters[result.field]) {
          const existing = mergedFilters[result.field];
          const countMap = new Map<string, number>();
          for (const v of existing.values || []) {
            countMap.set(v.value, v.count);
          }
          for (const v of values) {
            countMap.set(v.value, (countMap.get(v.value) || 0) + v.count);
          }
          existing.values = Array.from(countMap.entries())
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => b.count - a.count);
        } else {
          mergedFilters[result.field] = {
            label: result.label,
            type: 'keyword',
            values,
          };
        }
      }
    }

    const response = { filters: mergedFilters };
    setCachedFilters(cacheKey, response);
    res.json(response);
  } catch (error: unknown) {
    log.error(`Research filters failed: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ error: 'Failed to get filters.' });
  }
});

// =============================================================================
// POST /research/search
// =============================================================================

router.post(
  '/search',
  validateBody(researchSearchSchema),
  async (req: TypedRequest<ResearchSearchBody>, res: Response): Promise<void> => {
    const startTime = Date.now();
    const {
      query,
      collectionIds,
      limit = 30,
      filters,
      mode = 'hybrid',
      sortBy = 'relevance',
    } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      res.status(400).json({ error: 'Query must be at least 2 characters.' });
      return;
    }

    const trimmedQuery = query.trim();
    const effectiveLimit = Math.min(Math.max(limit ?? 30, 1), 100);

    const requestedIds = collectionIds?.length
      ? collectionIds.filter((id) => id in SYSTEM_COLLECTIONS)
      : getAllSystemCollectionIds();

    if (requestedIds.length === 0) {
      res.status(400).json({ error: 'No valid collection IDs provided.' });
      return;
    }

    // Resolve search weights from mode
    let vectorWeight = 0.7;
    let textWeight = 0.3;
    if (mode === 'vector') {
      vectorWeight = 1.0;
      textWeight = 0.0;
    } else if (mode === 'text') {
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
                mode: mode === 'text' ? 'text' : 'hybrid',
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

      // Sort
      if (sortBy === 'date_desc') {
        deduped.sort((a, b) => {
          const dateA = a.published_at || '';
          const dateB = b.published_at || '';
          if (dateB !== dateA) return dateB.localeCompare(dateA);
          return b.similarity_score - a.similarity_score;
        });
      } else if (sortBy === 'date_asc') {
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

      // Extract best snippets with query-term highlighting
      const truncated = deduped.map((r) => ({
        ...r,
        relevant_content: highlightSnippet(r.relevant_content, trimmedQuery),
        top_chunks: r.top_chunks.map((chunk: TopChunk) => ({
          preview: truncateSnippet(chunk.preview, CHUNK_PREVIEW_MAX_CHARS),
          chunk_index: chunk.chunk_index,
          page_number: chunk.page_number ?? null,
        })),
      }));

      const collectionsFound = [...new Set(deduped.map((r) => r.collection_id))];

      res.json({
        results: truncated,
        metadata: {
          totalResults: deduped.length,
          collections: collectionsFound,
          timeMs: Date.now() - startTime,
        },
      });
    } catch (error: unknown) {
      log.error(
        `Research search failed: ${error instanceof Error ? error.message : String(error)}`
      );
      res.status(500).json({ error: 'Search failed. Please try again.' });
    }
  }
);

// =============================================================================
// POST /research/similar
// =============================================================================

const researchSimilarSchema = z.object({
  sourceUrl: z.string().url(),
  collectionId: z.string(),
  limit: z.number().nullish(),
});

type ResearchSimilarBody = z.infer<typeof researchSimilarSchema>;

router.post(
  '/similar',
  validateBody(researchSimilarSchema),
  async (req: TypedRequest<ResearchSimilarBody>, res: Response): Promise<void> => {
    const startTime = Date.now();
    const { sourceUrl, collectionId, limit = 5 } = req.body;

    if (!sourceUrl || typeof sourceUrl !== 'string') {
      res.status(400).json({ error: 'sourceUrl is required.' });
      return;
    }

    if (!collectionId || typeof collectionId !== 'string') {
      res.status(400).json({ error: 'collectionId is required.' });
      return;
    }

    const systemConfig = getSystemCollectionConfig(collectionId);
    if (!systemConfig) {
      res.status(400).json({ error: 'Invalid collectionId.' });
      return;
    }

    const effectiveLimit = Math.min(Math.max(limit ?? 5, 1), 20);

    try {
      const qdrant = getQdrantInstance();
      await qdrant.init();

      if (!qdrant.client) {
        res.status(500).json({ error: 'Qdrant client not available.' });
        return;
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
        res.json({
          results: [],
          metadata: { totalResults: 0, collections: [], timeMs: Date.now() - startTime },
        });
        return;
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

      res.json({
        results,
        metadata: {
          totalResults: results.length,
          collections: collectionsFound,
          timeMs: Date.now() - startTime,
        },
      });
    } catch (error: unknown) {
      log.error(
        `Research similar failed: ${error instanceof Error ? error.message : String(error)}`
      );
      res.status(500).json({ error: 'Similar search failed. Please try again.' });
    }
  }
);

/**
 * Pre-populate the filter cache for "all collections" (the most common request).
 * Call after Qdrant is initialized during server startup.
 */
export async function warmFilterCache(): Promise<void> {
  try {
    const allIds = getAllSystemCollectionIds();
    const cacheKey = [...allIds].sort().join(',');

    // Skip if already cached
    if (getCachedFilters(cacheKey)) return;

    const qdrant = getQdrantInstance();
    await qdrant.init();

    type FilterEntry = {
      label: string;
      type: 'keyword' | 'date_range';
      values?: Array<{ value: string; count: number }>;
      min?: string;
      max?: string;
    };

    const fieldPromises = allIds.flatMap((collectionId) => {
      const systemConfig = getSystemCollectionConfig(collectionId);
      if (!systemConfig) return [];

      const filterableFields = getCollectionFilterableFields(collectionId);
      const defaultFilter = getCollectionDefaultFilter(collectionId);
      const baseFilter = defaultFilter
        ? {
            must: [
              {
                key: defaultFilter.field,
                match: Array.isArray(defaultFilter.value)
                  ? { any: defaultFilter.value }
                  : { value: defaultFilter.value },
              },
            ],
          }
        : null;

      return filterableFields.map(async (field) => {
        try {
          if (field.type === 'date_range') {
            const { min, max } = await qdrant.getDateRange(
              systemConfig.qdrantCollection,
              field.field,
              baseFilter
            );
            return {
              field: field.field,
              label: field.label,
              type: field.type as 'keyword' | 'date_range',
              min,
              max,
            };
          } else {
            const values = await qdrant.getFieldValueCounts(
              systemConfig.qdrantCollection,
              field.field,
              50,
              baseFilter
            );
            return {
              field: field.field,
              label: field.label,
              type: field.type as 'keyword' | 'date_range',
              values,
            };
          }
        } catch {
          return {
            field: field.field,
            label: field.label,
            type: field.type as 'keyword' | 'date_range',
            error: true,
          };
        }
      });
    });

    const results = await Promise.all(fieldPromises);
    const mergedFilters: Record<string, FilterEntry> = {};

    for (const result of results) {
      if (result.type === 'date_range') {
        if (mergedFilters[result.field]) {
          const existing = mergedFilters[result.field];
          if (result.min && (!existing.min || result.min < existing.min)) existing.min = result.min;
          if (result.max && (!existing.max || result.max > existing.max)) existing.max = result.max;
        } else if (result.min || result.max) {
          mergedFilters[result.field] = {
            label: result.label,
            type: 'date_range',
            ...(result.min != null && { min: result.min }),
            ...(result.max != null && { max: result.max }),
          };
        }
      } else {
        const values = 'values' in result ? (result.values ?? []) : [];
        if (mergedFilters[result.field]) {
          const existing = mergedFilters[result.field];
          const countMap = new Map<string, number>();
          for (const v of existing.values || []) countMap.set(v.value, v.count);
          for (const v of values) countMap.set(v.value, (countMap.get(v.value) || 0) + v.count);
          existing.values = Array.from(countMap.entries())
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => b.count - a.count);
        } else {
          mergedFilters[result.field] = { label: result.label, type: 'keyword', values };
        }
      }
    }

    setCachedFilters(cacheKey, { filters: mergedFilters });
    log.info(`Filter cache warmed for ${allIds.length} collections`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(`Filter cache warming failed (non-fatal): ${message}`);
  }
}

export default router;

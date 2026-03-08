import express, { type Request, type Response, type Router } from 'express';

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

// =============================================================================
// Types
// =============================================================================

interface TaggedDocumentResult extends DocumentResult {
  collection_id: string;
  collection_name: string;
  published_at?: string | null;
}

type SearchMode = 'hybrid' | 'vector' | 'text';
type SortOption = 'relevance' | 'date_desc' | 'date_asc';

interface ResearchSearchBody {
  query: string;
  collectionIds?: string[];
  limit?: number;
  filters?: SubcategoryFilters;
  mode?: SearchMode;
  sortBy?: SortOption;
}

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
            min: result.min ?? undefined,
            max: result.max ?? undefined,
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
  } catch (error: any) {
    log.error(`Research filters failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to get filters.' });
  }
});

// =============================================================================
// POST /research/search
// =============================================================================

router.post('/search', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const {
    query,
    collectionIds,
    limit = 30,
    filters,
    mode = 'hybrid',
    sortBy = 'relevance',
  } = req.body as ResearchSearchBody;

  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    res.status(400).json({ error: 'Query must be at least 2 characters.' });
    return;
  }

  const trimmedQuery = query.trim();
  const effectiveLimit = Math.min(Math.max(limit, 1), 100);

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
  const userFilter = buildSubcategoryFilter(filters);

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
            published_at:
              ((doc as unknown as Record<string, unknown>).published_at as string) ?? null,
          }));
        } catch (error: any) {
          log.error(`Search error for ${collectionId}: ${error.message}`);
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

    // Truncate text fields for the response
    const truncated = deduped.map((r) => ({
      ...r,
      relevant_content: truncateSnippet(r.relevant_content),
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
  } catch (error: any) {
    log.error(`Research search failed: ${error.message}`);
    res.status(500).json({ error: 'Search failed. Please try again.' });
  }
});

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
            min: result.min ?? undefined,
            max: result.max ?? undefined,
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

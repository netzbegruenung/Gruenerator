/**
 * Shared helpers for the /api/research/* surface.
 *
 * The HTTP routes themselves live in researchContractRouter.ts (ts-rest).
 * This module keeps the cross-cutting pieces that more than one consumer
 * needs:
 *   - snippet formatting (truncateSnippet / highlightSnippet) — also used by
 *     notebookContractRouter.ts
 *   - the in-memory filter-facet cache + warmFilterCache() — called at server
 *     startup (server.ts) and by the contract router's `filters` handler
 *   - computeMergedFilters() — the actual facet aggregation, shared by the
 *     route handler and the cache warmer so the logic exists once.
 */
import {
  getSearchableSystemCollectionIds,
  getSystemCollectionConfig,
  getCollectionFilterableFields,
  getCollectionDefaultFilter,
} from '../../config/systemCollectionsConfig.js';
import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ResearchController');

const SNIPPET_MAX_CHARS = 400;
export const CHUNK_PREVIEW_MAX_CHARS = 200;

export function truncateSnippet(text: string, limit: number = SNIPPET_MAX_CHARS): string {
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
export function highlightSnippet(
  text: string,
  query: string,
  limit: number = SNIPPET_MAX_CHARS
): string {
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
// Filter facet aggregation + cache (30-minute TTL)
// =============================================================================

export interface FilterEntry {
  label: string;
  type: 'keyword' | 'date_range';
  values?: Array<{ value: string; count: number }>;
  /** Maps raw facet values to display labels (e.g. theme code → German name). */
  valueLabels?: Record<string, string>;
  min?: string;
  max?: string;
}

export interface MergedFilters {
  filters: Record<string, FilterEntry>;
}

const FILTER_CACHE_TTL_MS = 30 * 60 * 1000;
const filterCache = new Map<string, { data: MergedFilters; timestamp: number }>();

export function getCachedFilters(key: string): MergedFilters | null {
  const entry = filterCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > FILTER_CACHE_TTL_MS) {
    filterCache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCachedFilters(key: string, data: MergedFilters): void {
  filterCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Aggregate filterable facet values across the requested system collections.
 * Fetches keyword value-counts and date ranges per field in parallel, then
 * merges fields that appear in multiple collections.
 */
export async function computeMergedFilters(requestedIds: string[]): Promise<MergedFilters> {
  const qdrant = getQdrantInstance();
  await qdrant.init();

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
            valueLabels: field.valueLabels,
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
      } else {
        mergedFilters[result.field] = {
          label: result.label,
          type: 'date_range',
          ...(result.min != null && { min: result.min }),
          ...(result.max != null && { max: result.max }),
        };
      }
    } else {
      const values = 'values' in result ? (result.values ?? []) : [];
      const valueLabels = 'valueLabels' in result ? result.valueLabels : undefined;
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
        if (valueLabels) existing.valueLabels = { ...existing.valueLabels, ...valueLabels };
      } else {
        mergedFilters[result.field] = {
          label: result.label,
          type: 'keyword',
          values,
          ...(valueLabels && { valueLabels }),
        };
      }
    }
  }

  return { filters: mergedFilters };
}

/**
 * Pre-populate the filter cache for "all collections" (the most common request).
 * Call after Qdrant is initialized during server startup.
 */
export async function warmFilterCache(): Promise<void> {
  try {
    const allIds = getSearchableSystemCollectionIds();
    const cacheKey = [...allIds].sort().join(',');

    // Skip if already cached
    if (getCachedFilters(cacheKey)) return;

    const response = await computeMergedFilters(allIds);
    setCachedFilters(cacheKey, response);
    log.info(`Filter cache warmed for ${allIds.length} collections`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(`Filter cache warming failed (non-fatal): ${message}`);
  }
}

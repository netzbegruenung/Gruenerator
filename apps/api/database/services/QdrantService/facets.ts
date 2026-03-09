/**
 * QdrantService Faceted Search Utilities
 * Extracted faceted search functions for filtering and aggregation
 */

import { type QdrantClient } from '@qdrant/js-client-rest';

import { createLogger } from '../../../utils/logger.js';

const log = createLogger('QdrantFacets');

// Types
export interface FieldValueCount {
  value: string;
  count: number;
}

export interface DateRange {
  min: string | null;
  max: string | null;
}

export interface UrlRecord {
  source_url: string;
  content_hash: string | null;
}

export interface DeleteResult {
  success: boolean;
}

export interface QdrantFilter {
  must?: Array<{
    key: string;
    match?: { value: unknown; any?: unknown[] };
    range?: { gte?: number; lte?: number };
  }>;
  must_not?: Array<{ key: string; match?: { value: unknown } }>;
  should?: Array<{ key: string; match?: { value: unknown } }>;
}

/**
 * Get unique values for a field in a collection
 * @param client - Qdrant client instance
 * @param collectionName - Name of the collection
 * @param fieldName - Field to extract unique values from
 * @param maxValues - Maximum number of unique values to return (default: 50)
 * @returns Array of unique values
 */
export async function getUniqueFieldValues(
  client: QdrantClient,
  collectionName: string,
  fieldName: string,
  maxValues: number = 50
): Promise<string[]> {
  try {
    const uniqueValues = new Set<string>();
    let offset: string | number | null = null;
    let iterations = 0;
    const maxIterations = 50;

    while (iterations < maxIterations && uniqueValues.size < maxValues) {
      const scrollResult = await client.scroll(collectionName, {
        limit: 100,
        offset: offset ?? undefined,
        with_payload: [fieldName],
        with_vector: false,
      });

      if (!scrollResult.points || scrollResult.points.length === 0) {
        break;
      }

      for (const point of scrollResult.points) {
        const payload = point.payload as Record<string, unknown> | null;
        const value = payload?.[fieldName];
        if (value !== undefined && value !== null && value !== '') {
          if (Array.isArray(value)) {
            for (const v of value) {
              if (v && uniqueValues.size < maxValues) {
                uniqueValues.add(String(v));
              }
            }
          } else {
            uniqueValues.add(String(value));
          }
        }
        if (uniqueValues.size >= maxValues) break;
      }

      const nextOffset = scrollResult.next_page_offset;
      offset = typeof nextOffset === 'string' || typeof nextOffset === 'number' ? nextOffset : null;
      if (!offset) break;
      iterations++;
    }

    return Array.from(uniqueValues).sort();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("doesn't exist")) {
      return [];
    }
    log.error(`Failed to get unique values for ${fieldName} in ${collectionName}: ${message}`);
    throw error;
  }
}

/**
 * Get unique field values with document counts for faceted search
 * @param client - Qdrant client instance
 * @param collectionName - The collection to query
 * @param fieldName - The field to get values for
 * @param maxValues - Maximum number of values to return (default: 50)
 * @param baseFilter - Optional base filter to apply
 * @returns Array of values with counts, sorted by count descending
 */
export async function getFieldValueCounts(
  client: QdrantClient,
  collectionName: string,
  fieldName: string,
  maxValues: number = 50,
  baseFilter: QdrantFilter | null = null
): Promise<FieldValueCount[]> {
  try {
    const result = await client.facet(collectionName, {
      key: fieldName,
      limit: maxValues,
      filter: baseFilter ?? undefined,
      exact: false,
    });
    return result.hits.map((hit) => ({
      value: String(hit.value),
      count: hit.count,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("doesn't exist") ||
      message.includes('not found') ||
      message.includes('Bad Request')
    ) {
      return [];
    }
    log.error(`Failed to get field value counts for ${fieldName} in ${collectionName}: ${message}`);
    throw error;
  }
}

/**
 * Get date range (min/max) for a date field
 * @param client - Qdrant client instance
 * @param collectionName - The collection to query
 * @param fieldName - The date field to analyze
 * @returns Min and max date values
 */
export async function getDateRange(
  client: QdrantClient,
  collectionName: string,
  fieldName: string,
  baseFilter: QdrantFilter | null = null
): Promise<DateRange> {
  try {
    const scrollOptions = {
      limit: 1,
      with_payload: [fieldName] as string[],
      with_vector: false,
      filter: baseFilter ?? undefined,
    };

    // Fetch min and max in parallel using order_by
    const [minResult, maxResult] = await Promise.all([
      client.scroll(collectionName, {
        ...scrollOptions,
        order_by: { key: fieldName, direction: 'asc' as const },
      }),
      client.scroll(collectionName, {
        ...scrollOptions,
        order_by: { key: fieldName, direction: 'desc' as const },
      }),
    ]);

    const extractDate = (result: typeof minResult): string | null => {
      const point = result.points?.[0];
      if (!point) return null;
      const payload = point.payload as Record<string, unknown> | null;
      const value = payload?.[fieldName];
      return value ? String(value) : null;
    };

    return { min: extractDate(minResult), max: extractDate(maxResult) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("doesn't exist") ||
      message.includes('not found') ||
      message.includes('Bad Request')
    ) {
      return { min: null, max: null };
    }
    log.error(`Failed to get date range for ${fieldName} in ${collectionName}: ${message}`);
    throw error;
  }
}

/**
 * Get all indexed URLs for a collection (generic URL getter for bundestag, gruene.de, gruene.at)
 * @param client - Qdrant client instance
 * @param collectionName - Name of the collection
 * @param payloadFields - Array of field names to fetch (e.g., ['source_url', 'content_hash', 'chunk_index'])
 * @returns Array of URL records with source_url and content_hash
 */
export async function getAllUrls(
  client: QdrantClient,
  collectionName: string,
  payloadFields: string[] = ['source_url', 'content_hash', 'chunk_index']
): Promise<UrlRecord[]> {
  try {
    const urlMap = new Map<string, UrlRecord>();
    let offset: string | number | null = null;

    while (true) {
      const scrollResult = await client.scroll(collectionName, {
        limit: 100,
        offset: offset ?? undefined,
        with_payload: payloadFields,
        with_vector: false,
      });

      if (!scrollResult.points || scrollResult.points.length === 0) {
        break;
      }

      for (const point of scrollResult.points) {
        const payload = point.payload as Record<string, unknown> | null;
        // Only include first chunks (chunk_index === 0) to avoid duplicates
        if (payload?.chunk_index === 0) {
          const url = (payload.source_url || payload.url) as string | undefined;
          if (url) {
            urlMap.set(url, {
              source_url: url,
              content_hash: (payload.content_hash as string | undefined) || null,
            });
          }
        }
      }

      const nextOffset = scrollResult.next_page_offset;
      offset = typeof nextOffset === 'string' || typeof nextOffset === 'number' ? nextOffset : null;
      if (!offset) break;
    }

    return Array.from(urlMap.values());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("doesn't exist")) {
      return [];
    }
    log.error(`Failed to get URLs from ${collectionName}: ${message}`);
    throw error;
  }
}

/**
 * Delete content by URL (generic URL deletion for bundestag, gruene.de, gruene.at)
 * @param client - Qdrant client instance
 * @param collectionName - Name of the collection
 * @param url - URL to delete
 * @param urlFieldName - Name of the URL field in the payload (default: 'source_url')
 * @returns Delete result
 */
export async function deleteByUrl(
  client: QdrantClient,
  collectionName: string,
  url: string,
  urlFieldName: string = 'source_url'
): Promise<DeleteResult> {
  try {
    await client.delete(collectionName, {
      filter: {
        must: [{ key: urlFieldName, match: { value: url } }],
      },
    });

    log.debug(`Deleted content for URL ${url} from ${collectionName}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Failed to delete content by URL from ${collectionName}: ${message}`);
    throw new Error(`URL deletion failed: ${message}`);
  }
}

/**
 * QdrantService Random Sampling Functions
 * Provides random sampling capabilities for content and social media examples
 */

import { QdrantClient } from '@qdrant/js-client-rest';

import { createLogger } from '../../../utils/logger.js';

import { extractMultiFieldContent } from './search.js';

import type { Logger } from 'winston';

const logger = createLogger('QdrantService:random');

interface ScrollParams {
  filter?: QdrantFilter;
  limit: number;
  offset?: number | string | null;
  with_payload: boolean | string[];
  with_vector: boolean;
}

interface CountParams {
  filter?: QdrantFilter;
  exact: boolean;
}

interface QdrantFilter {
  must?: FilterCondition[];
  must_not?: FilterCondition[];
  should?: FilterCondition[];
}

interface FilterCondition {
  key: string;
  match?: { value?: string | number; any?: (string | number)[]; text?: string };
  range?: { gte?: number; lte?: number; gt?: number; lt?: number };
}

interface ScrollResult {
  points: Array<{
    id: string | number;
    payload: Record<string, unknown>;
  }>;
  next_page_offset?: string | number | null;
}

interface CountResult {
  count: number;
}

// Result interfaces
interface ContentExampleResult {
  id: string;
  score: number;
  title?: string;
  content?: string;
  type?: string;
  categories?: string[];
  tags?: string[];
  description?: string;
  content_data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

interface SocialMediaResult {
  id: string | number;
  score: number;
  content?: string;
  platform?: string;
  country?: string | null;
  source_account?: string | null;
  created_at?: string;
  _debug_payload?: Record<string, unknown>;
}

// Options interfaces
interface RandomContentExampleOptions {
  limit?: number;
  contentType?: string;
  categories?: string[];
  tags?: string[];
}

interface RandomSocialMediaOptions {
  limit?: number;
  platform?: 'facebook' | 'instagram';
  country?: 'DE' | 'AT';
}

// Filter builder types
type ContentExampleFilterBuilder = (
  options: RandomContentExampleOptions
) => QdrantFilter | undefined;
type SocialMediaFilterBuilder = (options: RandomSocialMediaOptions) => QdrantFilter | undefined;

/**
 * Calculate a random offset for scrolling through points
 * @param totalPoints - Total number of points in the collection/filter
 * @param limit - Number of points to retrieve
 * @returns Random offset value (0 if totalPoints <= limit)
 */
export function calculateRandomOffset(totalPoints: number, limit: number): number {
  if (totalPoints <= limit || totalPoints <= 0 || limit <= 0) {
    return 0;
  }

  // Calculate maximum valid offset to ensure we can get 'limit' results
  const maxOffset = Math.max(0, totalPoints - limit);

  // Generate random offset within valid range
  return Math.floor(Math.random() * (maxOffset + 1));
}

/**
 * Shuffle an array using Fisher-Yates algorithm and limit to specified count
 * @param points - Array of points to shuffle
 * @param limit - Maximum number of points to return
 * @returns Shuffled and limited array
 */
export function shuffleAndLimit<T>(points: T[], limit: number): T[] {
  if (!points || points.length === 0) {
    return [];
  }

  // Create a copy to avoid mutating the original array
  const shuffled = [...points];

  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Return limited results
  return shuffled.slice(0, Math.max(0, limit));
}

/**
 * Get random content examples with optional filters
 * @param client - Qdrant client instance
 * @param collection - Collection name to search in
 * @param options - Random sampling options including filters
 * @param buildContentExampleFilter - Filter builder function for content examples
 * @param log - Optional logger instance
 * @returns Array of random content examples
 */
export async function getRandomContentExamples(
  client: QdrantClient,
  collection: string,
  options: RandomContentExampleOptions = {},
  buildContentExampleFilter: ContentExampleFilterBuilder,
  log: Logger = logger
): Promise<ContentExampleResult[]> {
  try {
    const { limit = 5 } = options;
    const filter = buildContentExampleFilter(options);

    // Get total count to calculate random offset
    const countResult = await client.count(collection, {
      filter: filter,
      exact: true,
    });

    const totalPoints = countResult.count;
    log.debug(`Random content examples: ${totalPoints} total points in collection`);

    if (totalPoints === 0) {
      log.debug('No content examples found matching filter criteria');
      return [];
    }

    // Calculate random offset
    // Fetch more than needed to allow for shuffling variety
    const fetchLimit = Math.min(totalPoints, limit * 3);
    const randomOffset = calculateRandomOffset(totalPoints, fetchLimit);

    log.debug(`Fetching ${fetchLimit} content examples from offset ${randomOffset}`);

    // Scroll with random offset
    const scrollResult = await client.scroll(collection, {
      filter: filter,
      limit: fetchLimit,
      offset: randomOffset > 0 ? randomOffset : undefined,
      with_payload: true,
      with_vector: false,
    });

    const points = scrollResult.points || [];

    if (points.length === 0) {
      log.debug('Scroll returned no points');
      return [];
    }

    // Shuffle and limit results for randomness
    const shuffledPoints = shuffleAndLimit(points, limit);

    // Transform to result format
    const results: ContentExampleResult[] = shuffledPoints.map((point) => {
      const payload = point.payload ?? {};
      return {
        id: (payload.example_id as string) || String(point.id),
        score: 1.0, // Random sampling has no score
        title: payload.title as string | undefined,
        content: payload.content as string | undefined,
        type: payload.type as string | undefined,
        categories: payload.categories as string[] | undefined,
        tags: payload.tags as string[] | undefined,
        description: payload.description as string | undefined,
        content_data: payload.content_data as Record<string, unknown> | undefined,
        metadata: payload.metadata as Record<string, unknown> | undefined,
        created_at: payload.created_at as string | undefined,
      };
    });

    log.debug(`Returning ${results.length} random content examples`);
    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Random content examples failed: ${errorMessage}`);
    throw new Error(`Random content examples failed: ${errorMessage}`);
  }
}

/**
 * Get random social media examples with platform and country filtering
 * @param client - Qdrant client instance
 * @param collection - Collection name to search in
 * @param options - Random sampling options including platform and country filters
 * @param buildSocialMediaFilter - Filter builder function for social media examples
 * @param log - Optional logger instance
 * @returns Array of random social media examples
 */
export async function getRandomSocialMediaExamples(
  client: QdrantClient,
  collection: string,
  options: RandomSocialMediaOptions = {},
  buildSocialMediaFilter: SocialMediaFilterBuilder,
  log: Logger = logger
): Promise<SocialMediaResult[]> {
  try {
    const { limit = 5 } = options;
    const filter = buildSocialMediaFilter(options);

    // Get total count to calculate random offset
    const countResult = await client.count(collection, {
      filter: filter,
      exact: true,
    });

    const totalPoints = countResult.count;
    log.debug(`Random social media examples: ${totalPoints} total points in collection`);

    if (totalPoints === 0) {
      log.debug('No social media examples found matching filter criteria');
      return [];
    }

    // Calculate random offset
    // Fetch more than needed to allow for shuffling variety
    const fetchLimit = Math.min(totalPoints, limit * 3);
    const randomOffset = calculateRandomOffset(totalPoints, fetchLimit);

    log.debug(`Fetching ${fetchLimit} social media examples from offset ${randomOffset}`);

    // Scroll with random offset
    const scrollResult = await client.scroll(collection, {
      filter: filter,
      limit: fetchLimit,
      offset: randomOffset > 0 ? randomOffset : undefined,
      with_payload: true,
      with_vector: false,
    });

    const points = scrollResult.points || [];

    if (points.length === 0) {
      log.debug('Scroll returned no points');
      return [];
    }

    // Shuffle and limit results for randomness
    const shuffledPoints = shuffleAndLimit(points, limit);

    // Transform to result format
    const results: SocialMediaResult[] = shuffledPoints.map((point) => {
      const payload = point.payload ?? {};
      return {
        id: (payload.example_id as string | number) || point.id,
        score: 1.0, // Random sampling has no score
        content: extractMultiFieldContent(payload as Record<string, unknown>),
        platform: payload.platform as string | undefined,
        country: (payload.country as string) || null,
        source_account: (payload.source_account as string) || null,
        created_at: payload.created_at as string | undefined,
        _debug_payload: payload as Record<string, unknown>,
      };
    });

    log.debug(`Returning ${results.length} random social media examples`);
    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Random social media examples failed: ${errorMessage}`);
    throw new Error(`Random social media examples failed: ${errorMessage}`);
  }
}

// Export types for consumers
export type {
  QdrantFilter,
  FilterCondition,
  ScrollResult,
  CountResult,
  ContentExampleResult,
  SocialMediaResult,
  RandomContentExampleOptions,
  RandomSocialMediaOptions,
  ContentExampleFilterBuilder,
  SocialMediaFilterBuilder,
};

// Re-export QdrantClient for convenience
export { QdrantClient };

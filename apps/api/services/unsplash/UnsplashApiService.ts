/**
 * Unsplash API Service
 *
 * Provides a wrapper around the Unsplash API with proper error handling,
 * caching, rate limiting, and response transformation.
 *
 * Unsplash API Documentation: https://unsplash.com/documentation
 */

import { env } from '../../config/env.js';
import { addUnsplashUTM } from '../../utils/unsplashUtils.js';

import type { UnsplashAttribution } from '../image/types.js';

// ============================================================================
// Types - Unsplash API Response Structures
// ============================================================================

interface UnsplashUser {
  id: string;
  username: string;
  name: string;
  instagram_username: string | null;
  links: {
    html: string;
  };
}

interface UnsplashPhotoUrls {
  raw: string;
  full: string;
  regular: string;
  small: string;
  thumb: string;
}

interface UnsplashPhotoLinks {
  html: string;
  download_location: string;
}

interface UnsplashPhoto {
  id: string;
  created_at: string;
  width: number;
  height: number;
  color: string | null;
  description: string | null;
  alt_description: string | null;
  urls: UnsplashPhotoUrls;
  links: UnsplashPhotoLinks;
  user: UnsplashUser;
}

interface UnsplashSearchResponse {
  total: number;
  total_pages: number;
  results: UnsplashPhoto[];
}

// ============================================================================
// Types - Internal Service Types
// ============================================================================

export interface StockImage {
  filename: string;
  url: string;
  alt_text: string;
  attribution: UnsplashAttribution;
  category?: string;
}

export interface SearchResult {
  results: StockImage[];
  total: number;
  total_pages: number;
  /** Unsplash's `X-Ratelimit-Remaining` for this hour; absent on cache hits. */
  rateLimitRemaining?: number;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

// ============================================================================
// Configuration
// ============================================================================

const UNSPLASH_API_BASE = 'https://api.unsplash.com';
// Matches the hourly quota window: a repeated query costs nothing for an hour.
const CACHE_TTL_MS = 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds

// ============================================================================
// In-Memory Cache
// ============================================================================

class SimpleCache<T> {
  private cache = new Map<string, CacheEntry<T>>();

  set(key: string, data: T, ttl: number = CACHE_TTL_MS): void {
    const now = Date.now();
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + ttl,
    });
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

const searchCache = new SimpleCache<SearchResult>();

// One key serves every user. Once Unsplash refuses, further searches would only
// burn requests on the same refusal, so they are answered locally until the window ends.
let rateLimitedUntil = 0;

// ============================================================================
// Error Classes
// ============================================================================

export class UnsplashApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'UnsplashApiError';
  }
}

export class UnsplashRateLimitError extends UnsplashApiError {
  constructor(
    message: string = 'Unsplash API rate limit exceeded',
    /** Seconds until searches are expected to work again. */
    public retryAfter: number = RATE_LIMIT_WINDOW_MS / 1000
  ) {
    super(message, 403);
    this.name = 'UnsplashRateLimitError';
  }
}

function secondsUntil(timestamp: number): number {
  return Math.max(1, Math.ceil((timestamp - Date.now()) / 1000));
}

/** Unsplash answers an exhausted quota with 403 "Rate Limit Exceeded" (and remaining 0). */
function isRateLimitResponse(response: Response, body: string): boolean {
  if (response.status === 429) return true;
  if (response.status !== 403) return false;
  return response.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(body);
}

function rateLimitRemaining(response: Response): number | null {
  const value = Number.parseInt(response.headers.get('x-ratelimit-remaining') ?? '', 10);
  return Number.isNaN(value) ? null : value;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format photographer name from username slug
 * Converts "john-doe" → "John Doe"
 */
function formatPhotographerName(username: string): string {
  return username
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Create filename from Unsplash photo data
 * Format: {photographer-slug}-{photo-id}-unsplash.jpg
 */
function createFilename(photo: UnsplashPhoto): string {
  return `${photo.user.username}-${photo.id}-unsplash.jpg`;
}

/**
 * Transform Unsplash API photo response to StockImage format
 */
function transformPhotoToStockImage(photo: UnsplashPhoto): StockImage {
  const photographerName = photo.user.name.trim() || formatPhotographerName(photo.user.username);
  const instagramUsername = photo.user.instagram_username?.trim().replace(/^@/, '');

  return {
    filename: createFilename(photo),
    url: photo.urls.regular,
    alt_text: photo.alt_description || photo.description || 'Unsplash photo',
    attribution: {
      photographer: photographerName,
      photographerSlug: photo.user.username,
      photoId: photo.id,
      profileUrl: addUnsplashUTM(photo.user.links.html),
      photoUrl: addUnsplashUTM(photo.links.html),
      downloadLocation: photo.links.download_location,
      license: 'Unsplash License',
      ...(instagramUsername && { instagramUsername }),
    },
  };
}

/**
 * Make HTTP request with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new UnsplashApiError('Request timeout', 408);
    }
    throw error;
  }
}

export function parseDownloadLocation(downloadLocation: string): URL | null {
  let url: URL;
  try {
    url = new URL(downloadLocation);
  } catch {
    return null;
  }
  if (url.origin !== UNSPLASH_API_BASE || url.username || url.password) return null;
  return /^\/photos\/[\w-]+\/download$/.test(url.pathname) ? url : null;
}

// ============================================================================
// Main Service Class
// ============================================================================

export class UnsplashApiService {
  private accessKey: string;

  constructor(accessKey: string) {
    if (!accessKey) {
      throw new Error('Unsplash Access Key is required');
    }
    this.accessKey = accessKey;
  }

  /**
   * Get authorization headers for Unsplash API
   */
  private getHeaders(): HeadersInit {
    return {
      Authorization: `Client-ID ${this.accessKey}`,
      'Accept-Version': 'v1',
    };
  }

  /**
   * Handle Unsplash API errors
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage = `Unsplash API error: ${response.status}`;

      try {
        const errorJson = JSON.parse(errorBody) as { errors?: string[] };
        errorMessage = errorJson.errors?.[0] ?? errorMessage;
      } catch {
        // If parsing fails, use default message
      }

      if (isRateLimitResponse(response, errorBody)) {
        rateLimitedUntil = Date.now() + RATE_LIMIT_WINDOW_MS;
        // One line per hit, so the logs tell how often the 50/h quota runs out.
        console.warn(
          `[UnsplashAPI] Rate limit reached (HTTP ${response.status}), searches blocked until ${new Date(rateLimitedUntil).toISOString()}`
        );
        throw new UnsplashRateLimitError(errorMessage, secondsUntil(rateLimitedUntil));
      }

      throw new UnsplashApiError(errorMessage, response.status, errorBody);
    }

    const data: T = (await response.json()) as T;
    return data;
  }

  /**
   * Search photos on Unsplash
   *
   * @param query - Search query (e.g., "nature", "green", "politics")
   * @param page - Page number (1-indexed)
   * @param perPage - Results per page (max 30)
   * @returns Search results with transformed photos
   */
  async searchPhotos(query: string, page: number = 1, perPage: number = 20): Promise<SearchResult> {
    if (!query || query.trim().length === 0) {
      return { results: [], total: 0, total_pages: 0 };
    }

    // Check cache first
    const cacheKey = `search:${query}:${page}:${perPage}`;
    const cached = searchCache.get(cacheKey);
    if (cached) {
      console.log(`[UnsplashAPI] Cache hit for: ${cacheKey}`);
      return cached;
    }

    if (Date.now() < rateLimitedUntil) {
      throw new UnsplashRateLimitError(undefined, secondsUntil(rateLimitedUntil));
    }

    // Build URL with query parameters
    const url = new URL(`${UNSPLASH_API_BASE}/search/photos`);
    url.searchParams.set('query', query.trim());
    url.searchParams.set('page', page.toString());
    url.searchParams.set('per_page', Math.min(perPage, 30).toString());
    url.searchParams.set('orientation', 'landscape'); // Prefer landscape for backgrounds

    console.log(`[UnsplashAPI] Searching: ${query} (page ${page})`);

    try {
      const response = await fetchWithTimeout(url.toString(), {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const data = await this.handleResponse<UnsplashSearchResponse>(response);

      // Transform results to StockImage format
      const result: SearchResult = {
        results: data.results.map(transformPhotoToStockImage),
        total: data.total,
        total_pages: data.total_pages,
      };

      // Cache the results
      searchCache.set(cacheKey, result);

      const remaining = rateLimitRemaining(response);

      console.log(`[UnsplashAPI] Found ${result.results.length} results (${data.total} total)`);

      return remaining === null ? result : { ...result, rateLimitRemaining: remaining };
    } catch (error) {
      if (error instanceof UnsplashApiError) {
        console.error(`[UnsplashAPI] API Error:`, error.message);
        throw error;
      }

      console.error(`[UnsplashAPI] Unexpected error:`, error);
      throw new UnsplashApiError('Failed to search Unsplash photos');
    }
  }

  /**
   * Get photo details by ID
   *
   * @param photoId - Unsplash photo ID
   * @returns Photo details as StockImage
   */
  async getPhoto(photoId: string): Promise<StockImage> {
    const url = `${UNSPLASH_API_BASE}/photos/${photoId}`;

    console.log(`[UnsplashAPI] Fetching photo: ${photoId}`);

    try {
      const response = await fetchWithTimeout(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      const photo = await this.handleResponse<UnsplashPhoto>(response);
      return transformPhotoToStockImage(photo);
    } catch (error) {
      if (error instanceof UnsplashApiError) {
        console.error(`[UnsplashAPI] API Error:`, error.message);
        throw error;
      }

      console.error(`[UnsplashAPI] Unexpected error:`, error);
      throw new UnsplashApiError('Failed to fetch photo details');
    }
  }

  /**
   * Track photo download (required by Unsplash API guidelines)
   *
   * This must be called whenever a user "downloads" or applies an image.
   * The download_location URL is provided in the photo response.
   *
   * @param downloadLocation - The download_location URL from photo.links
   */
  async trackDownload(downloadLocation: string): Promise<void> {
    if (!downloadLocation) {
      console.warn('[UnsplashAPI] No download location provided for tracking');
      return;
    }

    // The URL comes from the client and is fetched with our Client-ID header,
    // so anything but Unsplash's own download endpoint would leak the key (#4654).
    const url = parseDownloadLocation(downloadLocation);
    if (!url) {
      throw new UnsplashApiError('Invalid Unsplash download location', 400);
    }

    console.log(`[UnsplashAPI] Tracking download`);

    try {
      const response = await fetchWithTimeout(url.href, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        console.warn(`[UnsplashAPI] Download tracking failed: ${response.status}`);
      } else {
        console.log(`[UnsplashAPI] Download tracked successfully`);
      }
    } catch (error) {
      // Don't throw - download tracking should be non-blocking
      console.warn(`[UnsplashAPI] Download tracking error:`, error);
    }
  }

  /**
   * Clear search cache and lift a remembered rate-limit block
   */
  clearCache(): void {
    searchCache.clear();
    rateLimitedUntil = 0;
    console.log('[UnsplashAPI] Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number } {
    return {
      size: searchCache.size(),
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let serviceInstance: UnsplashApiService | null = null;

/**
 * Get or create Unsplash API service instance
 */
export function getUnsplashService(accessKey?: string): UnsplashApiService {
  if (!serviceInstance) {
    const key = accessKey ?? env.UNSPLASH_ACCESS_KEY;
    if (!key) {
      throw new Error('UNSPLASH_ACCESS_KEY environment variable is not set');
    }
    serviceInstance = new UnsplashApiService(key);
  }
  return serviceInstance;
}

/**
 * Reset service instance (useful for testing)
 */
export function resetUnsplashService(): void {
  serviceInstance = null;
}

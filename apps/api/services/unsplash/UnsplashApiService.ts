/**
 * Unsplash API Service
 *
 * Provides a wrapper around the Unsplash API with proper error handling,
 * caching, rate limiting, and response transformation.
 *
 * Unsplash API Documentation: https://unsplash.com/documentation
 */

import { addUnsplashUTM } from '../../utils/unsplashUtils.js';
import type { UnsplashAttribution } from '../image/types.js';

// ============================================================================
// Types - Unsplash API Response Structures
// ============================================================================

interface UnsplashUser {
  id: string;
  username: string;
  name: string;
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
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
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

// ============================================================================
// Error Classes
// ============================================================================

export class UnsplashApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'UnsplashApiError';
  }
}

export class UnsplashRateLimitError extends UnsplashApiError {
  constructor(message: string = 'Unsplash API rate limit exceeded') {
    super(message, 403);
    this.name = 'UnsplashRateLimitError';
  }
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
  const photographerName = formatPhotographerName(photo.user.username);

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
        const errorJson = JSON.parse(errorBody);
        errorMessage = errorJson.errors?.[0] || errorMessage;
      } catch {
        // If parsing fails, use default message
      }

      if (response.status === 403) {
        throw new UnsplashRateLimitError(errorMessage);
      }

      throw new UnsplashApiError(errorMessage, response.status, errorBody);
    }

    return response.json();
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

      console.log(`[UnsplashAPI] Found ${result.results.length} results (${data.total} total)`);

      return result;
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

    console.log(`[UnsplashAPI] Tracking download`);

    try {
      const response = await fetchWithTimeout(downloadLocation, {
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
   * Clear search cache
   */
  clearCache(): void {
    searchCache.clear();
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
    const key = accessKey || process.env.UNSPLASH_ACCESS_KEY;
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

/**
 * BaseScraper - Abstract base class for all web scrapers
 * Provides common functionality: Qdrant storage, embedding generation, chunking, deduplication
 */

import { generateContentHash } from '../../../utils/validation/index.js';

import type { ScraperConfig, ScraperResult, ScrapedDocument } from '../types.js';

/**
 * Abstract base class for all scrapers
 * Subclasses must implement the scrape() method
 */
export abstract class BaseScraper {
  protected config: ScraperConfig;
  protected visitedUrls: Set<string>;
  protected startTime: number;
  protected stats: {
    documentsProcessed: number;
    chunksCreated: number;
    vectorsStored: number;
    errors: string[];
  };

  constructor(config: ScraperConfig) {
    this.config = {
      maxConcurrent: 5,
      delayMs: 1000,
      verbose: false,
      ...config,
    };
    this.visitedUrls = new Set();
    this.startTime = 0;
    this.stats = {
      documentsProcessed: 0,
      chunksCreated: 0,
      vectorsStored: 0,
      errors: [],
    };
  }

  /**
   * Main scraping method - must be implemented by subclasses
   */
  abstract scrape(): Promise<ScraperResult>;

  /**
   * Generate content hash for deduplication
   * Uses canonical hashUtils implementation
   */
  protected generateHash(content: string): string {
    return generateContentHash(content);
  }

  /**
   * Rate limiting delay
   */
  protected async delay(ms: number = this.config.delayMs || 1000): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if URL has been visited
   */
  protected isVisited(url: string): boolean {
    return this.visitedUrls.has(url);
  }

  /**
   * Mark URL as visited
   */
  protected markVisited(url: string): void {
    this.visitedUrls.add(url);
  }

  /**
   * Log message if verbose mode is enabled
   */
  protected log(message: string, ...args: unknown[]): void {
    if (this.config.verbose) {
      console.log(`[${this.constructor.name}]`, message, ...args);
    }
  }

  /**
   * Log error
   */
  protected logError(message: string, error?: unknown): void {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const fullMessage = `${message}: ${errorMsg}`;
    console.error(`[${this.constructor.name}] ERROR:`, fullMessage);
    this.stats.errors.push(fullMessage);
  }

  /**
   * Build final scraper result
   */
  protected buildResult(): ScraperResult {
    return {
      documentsProcessed: this.stats.documentsProcessed,
      chunksCreated: this.stats.chunksCreated,
      vectorsStored: this.stats.vectorsStored,
      errors: this.stats.errors,
      duration: Date.now() - this.startTime,
    };
  }

  /**
   * Initialize scraping session
   */
  protected initializeSession(): void {
    this.startTime = Date.now();
    this.stats = {
      documentsProcessed: 0,
      chunksCreated: 0,
      vectorsStored: 0,
      errors: [],
    };
    this.visitedUrls.clear();
    this.log('Scraping session initialized');
  }

  /**
   * Normalize URL for comparison
   */
  protected normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove trailing slash, hash, and sort query parameters
      urlObj.hash = '';
      if (urlObj.pathname.endsWith('/') && urlObj.pathname.length > 1) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }
      // Sort query parameters
      urlObj.searchParams.sort();
      return urlObj.toString();
    } catch (e) {
      return url;
    }
  }

  /**
   * Validate URL format
   */
  protected isValidUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  /**
   * Extract domain from URL
   */
  protected extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      return '';
    }
  }

  /**
   * Sleep for a random duration (for rate limiting variance)
   */
  protected async randomDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return this.delay(delay);
  }

  /**
   * Fetch URL with retry logic and timeout
   * Consolidated implementation shared by all scrapers
   */
  protected async fetchWithRetry(
    url: string,
    options: {
      timeout?: number;
      maxRetries?: number;
      userAgent?: string;
      headers?: Record<string, string>;
    } = {}
  ): Promise<Response> {
    const {
      timeout = 30000,
      maxRetries = 3,
      userAgent = 'Gruenerator-Bot/1.0',
      headers = {},
    } = options;

    const fetchAttempt = async (retries: number): Promise<Response> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': userAgent,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'de-DE,de;q=0.9',
            ...headers,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        if (retries < maxRetries) {
          await this.delay(1000 * (retries + 1));
          return fetchAttempt(retries + 1);
        }
        throw error;
      }
    };

    return fetchAttempt(0);
  }
}

/**
 * SearXNG Web Search Service
 * Integrates with self-hosted SearXNG instance and provides AI-powered summaries
 */

import crypto from 'crypto';
import type {
  SearxngSearchOptions,
  SearchResult,
  ContentStats,
  FormattedSearchResults,
  FormattedSearchResultsWithSummary,
  SearxngSummary,
  CacheEntry,
  ServiceStatus
} from './types.js';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const isDebug = LOG_LEVEL === 'debug';
const isVerbose = ['debug', 'verbose'].includes(LOG_LEVEL);

interface RawSearxngResult {
  title?: string;
  url: string;
  content?: string;
  publishedDate?: string;
  engine?: string;
  score?: number;
  category?: string;
}

interface RawSearxngResponse {
  results: RawSearxngResult[];
  number_of_results?: number;
  suggestions?: string[];
  infoboxes?: any[];
  answers?: any[];
}

interface AIWorkerPool {
  processRequest(request: any, req?: any): Promise<any>;
}

class SearxngService {
  private baseUrl: string;
  private defaultOptions: Required<SearxngSearchOptions>;
  private redisClient: any;
  private cache: Map<string, CacheEntry<FormattedSearchResults>>;
  private cacheTimeout: number;
  private newsCache: number;

  constructor() {
    this.baseUrl = 'https://searxng-b4o4swssok8scoos488c4wgk.services.moritz-waechter.de';
    this.defaultOptions = {
      timeout: 15000,
      maxResults: 10,
      language: 'de-DE',
      safesearch: 0,
      format: 'json',
      categories: 'general',
      time_range: '',
      page: 1
    };

    this.redisClient = null;
    this.cache = new Map();
    this.cacheTimeout = 60 * 60; // 1 hour in seconds
    this.newsCache = 15 * 60; // 15 minutes for news in seconds

    this.initializeRedis();
  }

  /**
   * Initialize Redis client for caching
   */
  private async initializeRedis(): Promise<void> {
    try {
      const { default: redisClient } = await import('../../utils/redisClient.js');

      await redisClient.ping();
      this.redisClient = redisClient;
      if (isVerbose) console.log('[SearXNG] Redis caching enabled');

      this.cache.clear();
    } catch (error: any) {
      if (isVerbose) console.warn('[SearXNG] Redis unavailable, using in-memory cache:', error.message);
      this.redisClient = null;
    }
  }

  /**
   * Perform web search using SearXNG
   */
  async performWebSearch(query: string, options: SearxngSearchOptions = {}): Promise<FormattedSearchResults> {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Valid search query is required');
    }

    const searchOptions = {
      ...this.defaultOptions,
      ...options
    };

    const cacheKey = this.generateCacheKey(query, searchOptions);

    const cachedResult = await this.getCachedResult(cacheKey, searchOptions);
    if (cachedResult) {
      if (isVerbose) {
        const age = Math.round((Date.now() - new Date(cachedResult.timestamp).getTime()) / 1000);
        console.log(`💾 [SearXNG] Cache hit (${age}s old)`);
      }
      return cachedResult;
    }

    if (isVerbose) {
      const displayQuery = query.length > 50 ? query.substring(0, 50) + '...' : query;
      console.log(`🔍 [SearXNG] Searching: "${displayQuery}"`);
    }

    try {
      const searchResults = await this.querySearXNG(query, searchOptions);

      const formattedResults = this.formatSearchResults(searchResults, query, searchOptions);

      await this.setCachedResult(cacheKey, formattedResults, searchOptions);

      console.log(`🔍 [SearXNG] ${formattedResults.resultCount} results (${formattedResults.contentStats.resultsWithContent} with content)`);

      return formattedResults;

    } catch (error: any) {
      console.error(`[SearXNG] Search failed:`, error.message);
      throw new Error(`Web search failed: ${error.message}`);
    }
  }

  /**
   * Query SearXNG API directly
   */
  private async querySearXNG(query: string, options: Required<SearxngSearchOptions>): Promise<RawSearxngResponse> {
    const searchParams = new URLSearchParams({
      q: query,
      format: options.format || 'json',
      categories: options.categories || 'general',
      language: options.language || 'de-DE',
      safesearch: String(options.safesearch || 0),
      pageno: String(options.page || 1)
    });

    if (options.time_range) {
      searchParams.append('time_range', options.time_range);
    }

    const searchUrl = `${this.baseUrl}/search?${searchParams.toString()}`;

    if (isDebug) console.log(`[SearXNG] Querying: ${this.baseUrl}/search`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || this.defaultOptions.timeout);

    try {
      const response = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Gruenerator-Search/1.0'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`SearXNG API responded with ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Invalid response format from SearXNG');
      }

      const data = await response.json() as RawSearxngResponse;

      if (!data || !Array.isArray(data.results)) {
        throw new Error('Invalid response structure from SearXNG');
      }

      return data;

    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(`SearXNG request timeout after ${options.timeout || this.defaultOptions.timeout}ms`);
      }

      throw error;
    }
  }

  /**
   * Format raw SearXNG results into standardized structure
   */
  private formatSearchResults(
    rawResults: RawSearxngResponse,
    originalQuery: string,
    searchOptions: Required<SearxngSearchOptions>
  ): FormattedSearchResults {
    const results = rawResults.results || [];
    const maxResults = Math.min(searchOptions.maxResults || this.defaultOptions.maxResults, results.length);

    const formattedResults: SearchResult[] = results.slice(0, maxResults).map((result, index) => ({
      rank: index + 1,
      title: result.title || 'Untitled',
      url: result.url,
      content: result.content || '',
      snippet: this.extractSnippet(result.content || result.title || '', 200),
      publishedDate: result.publishedDate || null,
      engine: result.engine || 'unknown',
      score: result.score || 0,
      category: result.category || 'general',
      domain: this.extractDomainFromUrl(result.url),
      metadata: {
        length: result.content?.length || 0,
        hasContent: !!(result.content && result.content.trim())
      }
    }));

    const contentStats = this.calculateContentStats(formattedResults);

    return {
      success: true,
      query: originalQuery,
      results: formattedResults,
      resultCount: formattedResults.length,
      totalResults: rawResults.number_of_results || formattedResults.length,
      searchEngine: 'searxng',
      timestamp: new Date().toISOString(),
      searchOptions: {
        categories: searchOptions.categories || 'general',
        language: searchOptions.language || 'de-DE',
        maxResults: maxResults
      },
      contentStats,
      suggestions: rawResults.suggestions || [],
      infoboxes: rawResults.infoboxes || [],
      answers: rawResults.answers || []
    };
  }

  /**
   * Generate AI summary of search results using privacy mode providers
   */
  async generateAISummary(
    searchResults: FormattedSearchResults,
    originalQuery: string,
    aiWorkerPool: AIWorkerPool,
    summaryOptions: any = {},
    req: any = null
  ): Promise<FormattedSearchResultsWithSummary> {
    if (!searchResults.results || searchResults.results.length === 0) {
      return {
        ...searchResults,
        summary: {
          text: 'Keine Suchergebnisse zum Zusammenfassen verfügbar.',
          generated: false,
          error: 'No results to summarize'
        }
      };
    }

    if (!aiWorkerPool) {
      if (isVerbose) console.warn('[SearXNG] No AI worker pool for summary');
      return {
        ...searchResults,
        summary: {
          text: 'AI-Zusammenfassung nicht verfügbar.',
          generated: false,
          error: 'No AI worker pool available'
        }
      };
    }

    try {
      const contentForSummary = this.prepareContentForSummary(searchResults.results, originalQuery);

      const summaryRequest = {
        type: 'web_search_summary',
        messages: [{
          role: 'user',
          content: `Du bist ein hilfreicher Assistent, der basierend auf Webinhalten fundierte Antworten gibt. Beantworte die folgende Frage oder das Anliegen des Nutzers direkt und umfassend, basierend auf den bereitgestellten Informationen. Die Quellen dienen als Hintergrundinformationen - du sollst eine echte, durchdachte Antwort geben, keine bloße Zusammenfassung.

Frage/Anliegen: "${originalQuery}"

Verfügbare Informationen:
${contentForSummary}

Gib eine direkte, hilfreiche Antwort auf die Frage des Nutzers. Nutze die Informationen, um fundierte Erkenntnisse zu liefern, erkläre Zusammenhänge und gib praktische Hinweise wo sinnvoll.`
        }],
        options: {
          max_tokens: 1000,
          temperature: 0.3
        }
      };

      if (isVerbose) console.log(`[SearXNG] Generating AI summary`);

      const aiResponse = await aiWorkerPool.processRequest(summaryRequest, req);

      if (aiResponse.success && aiResponse.content) {
        return {
          ...searchResults,
          summary: {
            text: aiResponse.content.trim(),
            generated: true,
            model: 'claude-3-haiku',
            timestamp: new Date().toISOString(),
            wordCount: aiResponse.content.trim().split(/\s+/).length,
            basedOnResults: searchResults.results.length
          }
        };
      } else {
        if (isVerbose) console.warn('[SearXNG] Summary generation failed:', aiResponse.error);
        return {
          ...searchResults,
          summary: {
            text: 'Zusammenfassung konnte nicht generiert werden.',
            generated: false,
            error: aiResponse.error || 'Unknown error'
          }
        };
      }

    } catch (error: any) {
      console.error('[SearXNG] Error generating summary:', error.message || error);
      return {
        ...searchResults,
        summary: {
          text: 'Fehler beim Generieren der Zusammenfassung.',
          generated: false,
          error: error.message
        }
      };
    }
  }

  /**
   * Prepare search results content for AI summarization
   */
  private prepareContentForSummary(results: SearchResult[], query: string): string {
    const relevantResults = results.slice(0, 8);

    return relevantResults.map((result, index) => {
      const content = result.content || result.snippet || '';
      const truncatedContent = content.length > 300
        ? content.substring(0, 300) + '...'
        : content;

      return `${index + 1}. **${result.title}** (${result.domain})
Inhalt: ${truncatedContent}
URL: ${result.url}
`;
    }).join('\n');
  }

  /**
   * Calculate content statistics from search results
   */
  private calculateContentStats(results: SearchResult[]): ContentStats {
    const withContent = results.filter(r => r.metadata.hasContent);
    const totalContentLength = results.reduce((sum, r) => sum + r.metadata.length, 0);
    const domains = [...new Set(results.map(r => r.domain))];

    return {
      totalResults: results.length,
      resultsWithContent: withContent.length,
      averageContentLength: Math.round(totalContentLength / Math.max(results.length, 1)),
      uniqueDomains: domains.length,
      topDomains: domains.slice(0, 5)
    };
  }

  /**
   * Extract domain from URL
   */
  private extractDomainFromUrl(url: string): string {
    try {
      const urlObject = new URL(url);
      return urlObject.hostname.replace('www.', '');
    } catch (error) {
      return url || 'unknown';
    }
  }

  /**
   * Extract snippet from content
   */
  private extractSnippet(content: string, maxLength: number = 200): string {
    if (!content || content.length <= maxLength) {
      return content || '';
    }

    const snippet = content.substring(0, maxLength);
    const lastSpace = snippet.lastIndexOf(' ');

    if (lastSpace > maxLength * 0.8) {
      return snippet.substring(0, lastSpace) + '...';
    }

    return snippet + '...';
  }

  /**
   * Generate cache key for search query and options
   */
  private generateCacheKey(query: string, options: SearxngSearchOptions): string {
    const keyData = {
      query: query.toLowerCase().trim(),
      categories: options.categories || 'general',
      language: options.language || 'de-DE',
      maxResults: options.maxResults || this.defaultOptions.maxResults,
      time_range: options.time_range || ''
    };

    const keyString = JSON.stringify(keyData);
    return `searxng:${crypto.createHash('md5').update(keyString).digest('hex')}`;
  }

  /**
   * Get cached search result
   */
  private async getCachedResult(cacheKey: string, searchOptions: SearxngSearchOptions): Promise<FormattedSearchResults | null> {
    try {
      if (this.redisClient) {
        const cachedData = await this.redisClient.get(cacheKey);
        if (cachedData) {
          if (isDebug) console.log(`[SearXNG] Redis cache hit: ${cacheKey.substring(0, 20)}...`);
          return JSON.parse(cachedData);
        }
      } else {
        const cached = this.cache.get(cacheKey);
        const timeout = searchOptions.categories === 'news'
          ? this.newsCache * 1000
          : this.cacheTimeout * 1000;

        if (cached && Date.now() - cached.timestamp < timeout) {
          if (isDebug) console.log(`[SearXNG] Memory cache hit: ${cacheKey.substring(0, 20)}...`);
          return cached.data;
        }

        if (cached) {
          this.cache.delete(cacheKey);
        }
      }
    } catch (error: any) {
      if (isVerbose) console.warn('[SearXNG] Cache read error:', error.message);
    }

    return null;
  }

  /**
   * Set cached search result
   */
  private async setCachedResult(cacheKey: string, data: FormattedSearchResults, searchOptions: SearxngSearchOptions): Promise<void> {
    try {
      if (this.redisClient) {
        const ttl = searchOptions.categories === 'news' ? this.newsCache : this.cacheTimeout;
        await this.redisClient.setEx(cacheKey, ttl, JSON.stringify(data));
        if (isVerbose) console.log(`[SearXNG] Cached in Redis (${ttl}s)`);
      } else {
        if (this.cache.size > 1000) {
          const firstKey = this.cache.keys().next().value;
          if (firstKey) this.cache.delete(firstKey);
        }

        this.cache.set(cacheKey, {
          data,
          timestamp: Date.now()
        });
        if (isVerbose) console.log(`[SearXNG] Cached in memory`);
      }
    } catch (error: any) {
      if (isVerbose) console.warn('[SearXNG] Cache write error:', error.message);
    }
  }

  /**
   * Clear cache
   */
  async clearCache(): Promise<void> {
    try {
      if (this.redisClient) {
        const keys = await this.redisClient.keys('searxng:*');
        if (keys.length > 0) {
          await this.redisClient.del(keys);
          if (isVerbose) console.log(`[SearXNG] Cleared ${keys.length} Redis cache entries`);
        } else {
          if (isVerbose) console.log('[SearXNG] No Redis cache entries to clear');
        }
      } else {
        this.cache.clear();
        if (isVerbose) console.log('[SearXNG] In-memory cache cleared');
      }
    } catch (error: any) {
      if (isVerbose) console.error('[SearXNG] Error clearing cache:', error.message);
      this.cache.clear();
    }
  }

  /**
   * Get service status and statistics
   */
  async getServiceStatus(): Promise<ServiceStatus> {
    let cacheInfo: ServiceStatus['cache'] = {
      type: 'memory',
      size: this.cache.size,
      connected: true
    };

    if (this.redisClient) {
      try {
        await this.redisClient.ping();
        const keys = await this.redisClient.keys('searxng:*');
        cacheInfo = {
          type: 'redis',
          size: keys.length,
          connected: true
        };
      } catch (error: any) {
        cacheInfo = {
          type: 'redis',
          size: 0,
          connected: false,
          error: error.message
        };
      }
    }

    return {
      baseUrl: this.baseUrl,
      cache: cacheInfo,
      cacheTimeout: this.cacheTimeout,
      newsCache: this.newsCache,
      defaultOptions: this.defaultOptions,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }
}

// Export singleton instance
export const searxngService = new SearxngService();
export default searxngService;

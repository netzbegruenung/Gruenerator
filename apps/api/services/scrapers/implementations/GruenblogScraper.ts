/**
 * Grünblog Scraper
 * Scrapes gruenblog.com — the online magazine of the German Green Party
 * Categories: Wissen, Meinen, Machen
 */

import * as cheerio from 'cheerio';

import { getQdrantInstance } from '../../../database/services/QdrantService/index.js';
import {
  scrollDocuments,
  batchUpsert,
  batchDelete,
  getCollectionStats,
} from '../../../database/services/QdrantService/operations/batchOperations.js';
import { BRAND } from '../../../utils/domainUtils.js';
import { generatePointId } from '../../../utils/validation/index.js';
import { smartChunkDocument } from '../../document-services/index.js';
import { mistralEmbeddingService } from '../../mistral/index.js';
import { BaseScraper } from '../base/BaseScraper.js';
import { removeUnwantedElements } from '../utils/htmlCleaner.js';

import type { ScraperResult } from '../types.js';

/**
 * Extracted content from a Grünblog article
 */
interface ExtractedContent {
  title: string;
  description: string;
  text: string;
  publishedAt: string | null;
  authors: string[];
  primaryCategory: string | null;
  subcategories: string[];
}

/**
 * Process result for an article
 */
interface ProcessResult {
  stored: boolean;
  reason?: string;
  chunks?: number;
  vectors?: number;
  updated?: boolean;
}

/**
 * Existing article check result
 */
interface ExistingArticle {
  content_hash: string;
  indexed_at: string;
}

/**
 * Skip reason tracking
 */
interface SkipReason {
  count: number;
  examples: string[];
}

/**
 * Full crawl result
 */
export interface GruenblogCrawlResult {
  totalUrls: number;
  stored: number;
  updated: number;
  skipped: number;
  errors: number;
  totalVectors: number;
  duration: number;
  skipReasons: {
    too_short: SkipReason;
    no_chunks: SkipReason;
    unchanged: SkipReason;
    fetch_error: SkipReason;
  };
}

/**
 * Crawl options
 */
export interface GruenblogCrawlOptions {
  forceUpdate?: boolean;
  maxArticles?: number | null;
}

/**
 * Grünblog website scraper
 */
export class GruenblogScraper extends BaseScraper {
  private baseUrl: string;
  private crawlDelay: number;
  private timeout: number;
  private maxRetries: number;
  private userAgent: string;
  private qdrant: any;

  constructor() {
    super({
      collectionName: 'gruenblog_documents',
      verbose: true,
    });

    this.baseUrl = 'https://gruenblog.com';
    this.crawlDelay = 500;
    this.timeout = 30000;
    this.maxRetries = 3;
    this.userAgent = BRAND?.botUserAgent || 'Gruenerator-Bot/1.0';
    this.qdrant = null;
  }

  /**
   * Initialize services
   */
  async init(): Promise<void> {
    this.qdrant = getQdrantInstance();
    await this.qdrant.init();
    await mistralEmbeddingService.init();
    this.log('Service initialized');
  }

  /**
   * Main scraping method (implements abstract method from BaseScraper)
   */
  async scrape(): Promise<ScraperResult> {
    const result = await this.fullCrawl();
    return {
      documentsProcessed: result.stored + result.updated,
      chunksCreated: result.totalVectors,
      vectorsStored: result.totalVectors,
      errors: result.skipReasons.fetch_error.examples,
      duration: result.duration * 1000,
    };
  }

  /**
   * Fetch page with retry logic
   */
  async #fetchPage(url: string): Promise<string | null> {
    const response = await this.fetchWithRetry(url, {
      timeout: this.timeout,
      maxRetries: this.maxRetries,
      userAgent: this.userAgent,
    });

    const contentType = response.headers.get('content-type') || '';
    if (
      !contentType.includes('text/html') &&
      !contentType.includes('text/xml') &&
      !contentType.includes('application/xml')
    ) {
      return null;
    }

    return await response.text();
  }

  /**
   * Discover article URLs from the sitemap
   */
  async discoverFromSitemap(): Promise<string[]> {
    const sitemapUrl = `${this.baseUrl}/post-sitemap.xml`;
    this.log(`Fetching sitemap: ${sitemapUrl}`);

    try {
      const xml = await this.#fetchPage(sitemapUrl);
      if (!xml) {
        this.log('Failed to fetch sitemap');
        return [];
      }

      const $ = cheerio.load(xml, { xmlMode: true });
      const urls: string[] = [];

      $('url > loc').each((_, el) => {
        const loc = $(el).text().trim();
        if (loc) urls.push(loc);
      });

      this.log(`Discovered ${urls.length} URLs from sitemap`);
      return urls;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Gruenblog] Failed to fetch sitemap: ${errorMessage}`);
      return [];
    }
  }

  /**
   * Extract content from HTML using Rank Math JSON-LD and .entry-content
   */
  #extractContent(html: string, url: string): ExtractedContent {
    const $ = cheerio.load(html);

    // Parse JSON-LD metadata (Rank Math uses @graph array)
    let jsonLdData: any = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || '');
        if (data['@graph']) {
          // Rank Math pattern: find the Article node in @graph
          jsonLdData = data['@graph'].find(
            (node: any) =>
              node['@type'] === 'Article' ||
              node['@type'] === 'BlogPosting' ||
              node['@type'] === 'NewsArticle'
          );
        } else if (data['@type'] === 'Article' || data['@type'] === 'BlogPosting') {
          jsonLdData = data;
        }
      } catch {
        // Ignore parse errors
      }
    });

    // Extract title
    const title =
      jsonLdData?.headline ||
      $('h1.entry-title').text().trim() ||
      $('h1').first().text().trim() ||
      $('title').text().trim() ||
      '';

    // Extract description
    const description =
      jsonLdData?.description ||
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';

    // Extract published date
    const publishedAt =
      jsonLdData?.datePublished ||
      $('meta[property="article:published_time"]').attr('content') ||
      $('time[datetime]').first().attr('datetime') ||
      null;

    // Extract authors
    const authors: string[] = [];
    if (jsonLdData?.author) {
      const authorData = Array.isArray(jsonLdData.author) ? jsonLdData.author : [jsonLdData.author];
      for (const a of authorData) {
        const name = typeof a === 'string' ? a : a?.name;
        if (name && name.length > 1) authors.push(name);
      }
    }
    if (authors.length === 0) {
      $('.author-name, .entry-author a, .author a').each((_, el) => {
        const name = $(el).text().trim();
        if (name && name.length > 1 && !authors.includes(name)) {
          authors.push(name);
        }
      });
    }

    // Extract categories
    const categories: string[] = [];
    $('a[rel="category tag"], .cat-links a, .entry-categories a').each((_, el) => {
      const cat = $(el).text().trim();
      if (cat && !categories.includes(cat)) categories.push(cat);
    });
    const primaryCategory = categories[0] || null;
    const subcategories = categories.slice(1);

    // Remove unwanted elements before extracting text
    removeUnwantedElements($, [
      'script',
      'style',
      'noscript',
      'iframe',
      'nav',
      'header',
      'footer',
      '.navigation',
      '.sidebar',
      '.cookie-banner',
      '.cookie-notice',
      '.popup',
      '.modal',
      '[role="navigation"]',
      '[role="banner"]',
      '[role="contentinfo"]',
      '.breadcrumb',
      '.social-share',
      '.share-buttons',
      '.related-content',
      '.author-info',
      '.author-bio',
      '.elementor-widget-container .elementor-icon-list',
      '.elementor-menu-toggle',
      '.wp-block-separator',
      '.post-navigation',
      '.comments-area',
    ]);

    // Extract article body from .entry-content
    const contentEl = $('.entry-content');
    const text =
      contentEl.length > 0
        ? contentEl.text().replace(/\s+/g, ' ').trim()
        : $('article').text().replace(/\s+/g, ' ').trim();

    return {
      title: title.substring(0, 500),
      description: (description || '').substring(0, 1000),
      text,
      publishedAt,
      authors: authors.slice(0, 5),
      primaryCategory,
      subcategories,
    };
  }

  /**
   * Check if article exists in Qdrant
   */
  async #articleExists(url: string): Promise<ExistingArticle | null> {
    try {
      const points = await scrollDocuments(
        this.qdrant.client,
        this.config.collectionName,
        {
          must: [{ key: 'source_url', match: { value: url } }],
        },
        {
          limit: 1,
          withPayload: true,
          withVector: false,
        }
      );

      if (points.length > 0) {
        const payload = points[0].payload;
        return {
          content_hash: payload.content_hash as string,
          indexed_at: payload.indexed_at as string,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Delete article from Qdrant
   */
  async #deleteArticle(url: string): Promise<void> {
    await batchDelete(this.qdrant.client, this.config.collectionName, {
      must: [{ key: 'source_url', match: { value: url } }],
    });
  }

  /**
   * Process and store article
   */
  async #processAndStoreArticle(url: string, content: ExtractedContent): Promise<ProcessResult> {
    if (!content.text || content.text.length < 100) {
      return { stored: false, reason: 'too_short' };
    }

    const contentHash = this.generateHash(content.text);

    const existing = await this.#articleExists(url);
    if (existing && existing.content_hash === contentHash) {
      return { stored: false, reason: 'unchanged' };
    }

    if (existing) {
      await this.#deleteArticle(url);
    }

    const chunks = await smartChunkDocument(content.text, {
      baseMetadata: {
        title: content.title,
        source: 'gruenblog',
        source_url: url,
      },
    });

    if (chunks.length === 0) {
      return { stored: false, reason: 'no_chunks' };
    }

    const chunkTexts = chunks.map((c: any) => c.text || c.chunk_text);
    const embeddings = await mistralEmbeddingService.generateBatchEmbeddings(chunkTexts);

    const points = chunks.map((chunk, index) => ({
      id: generatePointId('gruenblog', url, index),
      vector: embeddings[index],
      payload: {
        article_id: `gruenblog_${contentHash}`,
        source_url: url,
        content_hash: contentHash,
        chunk_index: index,
        chunk_text: chunkTexts[index],
        content_type: 'artikel',
        primary_category: content.primaryCategory,
        subcategories: content.subcategories,
        title: content.title,
        description: content.description,
        authors: content.authors,
        published_at: content.publishedAt,
        source: 'gruenblog',
        indexed_at: new Date().toISOString(),
        ...(index === 0 ? { full_text: content.text } : {}),
      },
    }));

    for (let i = 0; i < points.length; i += 10) {
      const batch = points.slice(i, i + 10);
      await batchUpsert(this.qdrant.client, this.config.collectionName, batch);
    }

    return { stored: true, chunks: chunks.length, vectors: points.length, updated: !!existing };
  }

  /**
   * Full crawl of all articles
   */
  async fullCrawl(options: GruenblogCrawlOptions = {}): Promise<GruenblogCrawlResult> {
    const { forceUpdate = false, maxArticles = null } = options;
    const startTime = Date.now();

    this.log('\n===================================');
    this.log('Starting Gruenblog full crawl');
    this.log(`Force update: ${forceUpdate}`);
    if (maxArticles) this.log(`Max articles: ${maxArticles}`);
    this.log('===================================\n');

    const result: GruenblogCrawlResult = {
      totalUrls: 0,
      stored: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      totalVectors: 0,
      duration: 0,
      skipReasons: {
        too_short: { count: 0, examples: [] },
        no_chunks: { count: 0, examples: [] },
        unchanged: { count: 0, examples: [] },
        fetch_error: { count: 0, examples: [] },
      },
    };

    try {
      const urls = await this.discoverFromSitemap();
      result.totalUrls = urls.length;

      const urlsToProcess = maxArticles ? urls.slice(0, maxArticles) : urls;

      for (let i = 0; i < urlsToProcess.length; i++) {
        const url = urlsToProcess[i];

        if (this.visitedUrls.has(url)) continue;
        this.visitedUrls.add(url);

        try {
          const html = await this.#fetchPage(url);
          if (!html) {
            result.skipped++;
            continue;
          }

          const content = this.#extractContent(html, url);

          if (!forceUpdate) {
            const existing = await this.#articleExists(url);
            if (existing) {
              const contentHash = this.generateHash(content.text || '');
              if (existing.content_hash === contentHash) {
                result.skipped++;
                result.skipReasons.unchanged.count++;
                if (result.skipReasons.unchanged.examples.length < 5) {
                  result.skipReasons.unchanged.examples.push(url);
                }
                continue;
              }
            }
          }

          const processResult = await this.#processAndStoreArticle(url, content);

          if (processResult.stored) {
            if (processResult.updated) {
              result.updated++;
            } else {
              result.stored++;
            }
            result.totalVectors += processResult.vectors || 0;
            this.log(
              `[${i + 1}/${urlsToProcess.length}] "${content.title?.substring(0, 50)}" (${processResult.chunks} chunks)`
            );
          } else {
            result.skipped++;
            const reason = processResult.reason;
            if (reason && result.skipReasons[reason as keyof typeof result.skipReasons]) {
              const skipReason = result.skipReasons[reason as keyof typeof result.skipReasons];
              skipReason.count++;
              if (skipReason.examples.length < 5) {
                skipReason.examples.push(url);
              }
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[Gruenblog] Error ${url}: ${errorMessage}`);
          result.errors++;
          result.skipReasons.fetch_error.count++;
          if (result.skipReasons.fetch_error.examples.length < 5) {
            result.skipReasons.fetch_error.examples.push(url);
          }
        }

        await this.delay(this.crawlDelay);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Gruenblog] Crawl failed:', errorMessage);
      throw error;
    }

    result.duration = Math.round((Date.now() - startTime) / 1000);

    this.log('\n===================================');
    this.log(
      `COMPLETED: ${result.stored} new, ${result.updated} updated (${result.totalVectors} vectors)`
    );
    this.log(`Skipped: ${result.skipped}, Errors: ${result.errors}`);
    this.log(`Duration: ${result.duration}s`);

    if (result.skipped > 0) {
      this.log('\nSkip Breakdown:');
      const sr = result.skipReasons;
      if (sr.unchanged.count > 0) this.log(`  Unchanged: ${sr.unchanged.count}`);
      if (sr.too_short.count > 0) this.log(`  Too short: ${sr.too_short.count}`);
      if (sr.no_chunks.count > 0) this.log(`  No chunks: ${sr.no_chunks.count}`);
      if (sr.fetch_error.count > 0) this.log(`  Fetch errors: ${sr.fetch_error.count}`);
    }

    this.log('===================================');

    return result;
  }

  /**
   * Incremental update (only new/changed content)
   */
  async incrementalUpdate(): Promise<GruenblogCrawlResult> {
    return this.fullCrawl({ forceUpdate: false });
  }

  /**
   * Get collection statistics
   */
  async getStats(): Promise<{
    collection: string;
    vectors_count?: number;
    points_count?: number;
    status?: string;
    error?: string;
  }> {
    try {
      const stats = await getCollectionStats(this.qdrant.client, this.config.collectionName);
      return {
        collection: this.config.collectionName,
        vectors_count: stats.vectors_count,
        points_count: stats.points_count,
        status: stats.status,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { collection: this.config.collectionName, error: errorMessage };
    }
  }
}

export const gruenblogScraperService = new GruenblogScraper();
export default gruenblogScraperService;

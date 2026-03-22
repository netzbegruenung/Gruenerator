/**
 * Grüne Österreich (gruene.at) Scraper
 *
 * Scrapes gruene.at — the Austrian Green Party website.
 * Discovers content via Yoast SEO sitemaps (news, topics, pages).
 * Stores in gruene_at_documents collection.
 *
 * Content types:
 *   - /news/*          → News articles (party achievements, positions)
 *   - /themen/*        → Policy position pages
 *   - /nrwprogramm24/* → Election program 2024
 *   - /wahlprogramm-*  → Other election programs
 *   - /organisation/*  → Party structure, transparency, history
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
import { batchProcess } from '../utils/batchFetch.js';
import { removeUnwantedElements } from '../utils/htmlCleaner.js';

import type { ScraperResult } from '../types.js';

interface ExtractedContent {
  title: string;
  description: string;
  text: string;
  publishedAt: string | null;
  primaryCategory: string | null;
  subcategories: string[];
  contentType: string;
}

interface ProcessResult {
  stored: boolean;
  reason?: string;
  chunks?: number;
  vectors?: number;
  updated?: boolean;
}

interface ExistingArticle {
  content_hash: string;
}

interface SkipReason {
  count: number;
  examples: string[];
}

export interface GrueneAtCrawlResult {
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
    filtered: SkipReason;
  };
}

export interface GrueneAtCrawlOptions {
  forceUpdate?: boolean;
  maxArticles?: number | null;
}

/**
 * Sitemaps to fetch and URL prefixes to include from each.
 * URLs not matching any include prefix are skipped.
 */
const SITEMAP_SOURCES = [
  {
    url: 'https://gruene.at/news-sitemap.xml',
    contentType: 'news',
  },
  {
    url: 'https://gruene.at/topics-sitemap.xml',
    contentType: 'thema',
  },
  {
    url: 'https://gruene.at/page-sitemap.xml',
    contentType: 'page',
  },
] as const;

/**
 * URL path prefixes to include from the page sitemap.
 * Everything else (event registrations, form confirmations, etc.) is skipped.
 */
const PAGE_INCLUDE_PREFIXES = [
  '/nrwprogramm24',
  '/wahlprogramm',
  '/organisation/',
  '/gegen-rechts/',
  '/klima',
  '/boden-retten/',
  '/sauberes-wasser/',
  '/stopp-pfas/',
  '/gerechte-arbeit/',
  '/kinderbetreuung/',
  '/rechte-aller-frauen/',
  '/superreichebesteuern',
];

/**
 * URL path prefixes to always exclude.
 */
const EXCLUDE_PREFIXES = [
  '/anmeldebestaetigung',
  '/nur-noch-ein-schritt',
  '/danke',
  '/doi',
  '/datenschutz',
  '/impressum',
  '/netiquette',
  '/barrierefreiheit',
  '/kontakt',
  '/newsletter',
  '/download',
  '/linkliste',
  '/presse',
  '/jobs',
  '/zusammensetzen',
  '/tour/',
];

function classifyUrl(url: string): { contentType: string; include: boolean } {
  const path = new URL(url).pathname;

  if (EXCLUDE_PREFIXES.some((p) => path.startsWith(p))) {
    return { contentType: 'excluded', include: false };
  }

  if (path.startsWith('/news/')) return { contentType: 'news', include: true };
  if (path.startsWith('/themen/')) return { contentType: 'thema', include: true };
  if (path.startsWith('/nrwprogramm24') || path.startsWith('/wahlprogramm'))
    return { contentType: 'programm', include: true };
  if (path.startsWith('/organisation/')) return { contentType: 'organisation', include: true };

  // For pages, only include if prefix-matched
  if (PAGE_INCLUDE_PREFIXES.some((p) => path.startsWith(p))) {
    return { contentType: 'page', include: true };
  }

  return { contentType: 'page', include: false };
}

export class GrueneAtScraper extends BaseScraper {
  private baseUrl: string;
  private crawlDelay: number;
  private timeout: number;
  private maxRetries: number;
  private userAgent: string;
  private qdrant: any;

  constructor() {
    super({
      collectionName: 'gruene_at_documents',
      verbose: true,
    });

    this.baseUrl = 'https://gruene.at';
    this.crawlDelay = 300;
    this.timeout = 30000;
    this.maxRetries = 3;
    this.userAgent = BRAND?.botUserAgent || 'Gruenerator-Bot/1.0';
    this.qdrant = null;
  }

  async init(): Promise<void> {
    this.qdrant = getQdrantInstance();
    await this.qdrant.init();
    await mistralEmbeddingService.init();
    this.log('GrueneAt scraper initialized');
  }

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
   * Discover URLs from all sitemaps, classified by content type.
   */
  async discoverFromSitemaps(): Promise<{ url: string; contentType: string }[]> {
    const discovered: { url: string; contentType: string }[] = [];
    const seen = new Set<string>();

    for (const source of SITEMAP_SOURCES) {
      this.log(`Fetching sitemap: ${source.url}`);
      try {
        const xml = await this.#fetchPage(source.url);
        if (!xml) continue;

        const $ = cheerio.load(xml, { xmlMode: true });
        $('url > loc').each((_, el) => {
          const loc = $(el).text().trim();
          if (!loc || seen.has(loc)) return;
          seen.add(loc);

          const classification = classifyUrl(loc);
          if (classification.include) {
            discovered.push({ url: loc, contentType: classification.contentType });
          }
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[GrueneAt] Failed to fetch sitemap ${source.url}: ${msg}`);
      }

      await this.delay(300);
    }

    this.log(`Discovered ${discovered.length} URLs from ${SITEMAP_SOURCES.length} sitemaps`);
    return discovered;
  }

  /**
   * Extract content from a gruene.at WordPress page.
   * Uses Yoast SEO JSON-LD and standard WordPress selectors.
   */
  #extractContent(html: string, url: string, contentType: string): ExtractedContent {
    const $ = cheerio.load(html);

    // Parse JSON-LD metadata (Yoast uses @graph array)
    let jsonLdData: any = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || '');
        if (data['@graph']) {
          jsonLdData = data['@graph'].find(
            (node: any) =>
              node['@type'] === 'Article' ||
              node['@type'] === 'BlogPosting' ||
              node['@type'] === 'NewsArticle' ||
              node['@type'] === 'WebPage'
          );
        } else if (
          data['@type'] === 'Article' ||
          data['@type'] === 'WebPage' ||
          data['@type'] === 'BlogPosting'
        ) {
          jsonLdData = data;
        }
      } catch {
        // Ignore parse errors
      }
    });

    const title =
      jsonLdData?.headline ||
      jsonLdData?.name ||
      $('h1.entry-title').text().trim() ||
      $('h1').first().text().trim() ||
      $('title').text().trim() ||
      '';

    const description =
      jsonLdData?.description ||
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';

    const publishedAt =
      jsonLdData?.datePublished ||
      $('meta[property="article:published_time"]').attr('content') ||
      $('time[datetime]').first().attr('datetime') ||
      null;

    // Extract categories
    const categories: string[] = [];
    $('a[rel="category tag"], .cat-links a, .entry-categories a').each((_, el) => {
      const cat = $(el).text().trim();
      if (cat && !categories.includes(cat)) categories.push(cat);
    });

    // Remove unwanted elements
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
      '.wp-block-separator',
      '.post-navigation',
      '.comments-area',
      '.accessibility-bar',
      '.instagram-feed',
      '#sb_instagram',
    ]);

    // Extract main content
    const contentEl = $('.entry-content');
    let text =
      contentEl.length > 0
        ? contentEl.text().replace(/\s+/g, ' ').trim()
        : $('article').text().replace(/\s+/g, ' ').trim();

    // Fallback: main content area
    if (!text || text.length < 100) {
      text = $('main, .main-content, .page-content, [role="main"]')
        .text()
        .replace(/\s+/g, ' ')
        .trim();
    }

    return {
      title: title.substring(0, 500),
      description: (description || '').substring(0, 1000),
      text,
      publishedAt,
      primaryCategory: categories[0] || contentType,
      subcategories: categories.slice(1),
      contentType,
    };
  }

  async #articleExists(url: string): Promise<ExistingArticle | null> {
    try {
      const points = await scrollDocuments(
        this.qdrant.client,
        this.config.collectionName,
        { must: [{ key: 'source_url', match: { value: url } }] },
        { limit: 1, withPayload: true, withVector: false }
      );

      if (points.length > 0) {
        return { content_hash: points[0].payload.content_hash as string };
      }
      return null;
    } catch {
      return null;
    }
  }

  async #deleteArticle(url: string): Promise<void> {
    await batchDelete(this.qdrant.client, this.config.collectionName, {
      must: [{ key: 'source_url', match: { value: url } }],
    });
  }

  async #processAndStore(url: string, content: ExtractedContent): Promise<ProcessResult> {
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
        source: 'gruene_at',
        source_url: url,
      },
    });

    if (chunks.length === 0) {
      return { stored: false, reason: 'no_chunks' };
    }

    const chunkTexts = chunks.map((c: any) => c.text || c.chunk_text);
    const embeddings = await mistralEmbeddingService.generateBatchEmbeddings(chunkTexts);

    const points = chunks.map((chunk, index) => ({
      id: generatePointId('gruene_at', url, index),
      vector: embeddings[index],
      payload: {
        document_id: `gruene_at_${contentHash}`,
        source_url: url,
        content_hash: contentHash,
        chunk_index: index,
        chunk_text: chunkTexts[index],
        content_type: content.contentType,
        primary_category: content.primaryCategory,
        subcategories: content.subcategories,
        country: 'AT',
        title: content.title,
        description: content.description,
        published_at: content.publishedAt,
        source: 'gruene_at',
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

  async fullCrawl(options: GrueneAtCrawlOptions = {}): Promise<GrueneAtCrawlResult> {
    const { forceUpdate = false, maxArticles = null } = options;
    const startTime = Date.now();

    this.log('\n===================================');
    this.log('Starting gruene.at full crawl');
    this.log(`Force update: ${forceUpdate}`);
    if (maxArticles) this.log(`Max articles: ${maxArticles}`);
    this.log('===================================\n');

    const result: GrueneAtCrawlResult = {
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
        filtered: { count: 0, examples: [] },
      },
    };

    try {
      const entries = await this.discoverFromSitemaps();
      result.totalUrls = entries.length;

      const toProcess = (maxArticles ? entries.slice(0, maxArticles) : entries).filter(
        ({ url }) => {
          if (this.visitedUrls.has(url)) return false;
          this.visitedUrls.add(url);
          return true;
        }
      );

      this.log(`Prefetching ${toProcess.length} pages (concurrency: 5)...`);
      const fetched = await batchProcess(toProcess, ({ url }) => this.#fetchPage(url), {
        concurrency: 5,
        delayMs: this.crawlDelay,
      });

      for (let i = 0; i < fetched.length; i++) {
        const entry = fetched[i];
        const { url, contentType } = entry.item;

        if ('error' in entry) {
          result.errors++;
          result.skipReasons.fetch_error.count++;
          if (result.skipReasons.fetch_error.examples.length < 5) {
            result.skipReasons.fetch_error.examples.push(url);
          }
          continue;
        }

        const html = entry.result;
        if (!html) {
          result.skipped++;
          continue;
        }

        try {
          const content = this.#extractContent(html, url, contentType);

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

          const processResult = await this.#processAndStore(url, content);

          if (processResult.stored) {
            if (processResult.updated) {
              result.updated++;
            } else {
              result.stored++;
            }
            result.totalVectors += processResult.vectors || 0;
            this.log(
              `[${i + 1}/${fetched.length}] [${contentType}] "${content.title?.substring(0, 50)}" (${processResult.chunks} chunks)`
            );
          } else {
            result.skipped++;
            const reason = processResult.reason;
            if (reason && result.skipReasons[reason as keyof typeof result.skipReasons]) {
              const sr = result.skipReasons[reason as keyof typeof result.skipReasons];
              sr.count++;
              if (sr.examples.length < 5) sr.examples.push(url);
            }
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[GrueneAt] Error processing ${url}: ${msg}`);
          result.errors++;
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[GrueneAt] Crawl failed:', msg);
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
      if (sr.filtered.count > 0) this.log(`  Filtered: ${sr.filtered.count}`);
      if (sr.fetch_error.count > 0) this.log(`  Fetch errors: ${sr.fetch_error.count}`);
    }

    this.log('===================================');

    return result;
  }

  async incrementalUpdate(): Promise<GrueneAtCrawlResult> {
    return this.fullCrawl({ forceUpdate: false });
  }

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
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { collection: this.config.collectionName, error: msg };
    }
  }
}

export const grueneAtScraperService = new GrueneAtScraper();
export default grueneAtScraperService;

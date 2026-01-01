/**
 * Böll Stiftung Scraper
 * Scrapes Heinrich Böll Stiftung website (boell.de)
 * Focuses on political topics, articles, dossiers, and atlases
 */

import * as cheerio from 'cheerio';
import { BaseScraper } from '../base/BaseScraper.js';
import type { ScraperResult } from '../types.js';
import { smartChunkDocument } from '../../../utils/textChunker.js';
import { fastEmbedService } from '../../FastEmbedService.js';
import { getQdrantInstance } from '../../../database/services/QdrantService/index.js';
import { BRAND } from '../../../utils/domainUtils.js';
import { generatePointId } from '../../../utils/hashUtils.js';

/**
 * Content type classification
 */
export type BoellContentType = 'atlas' | 'dossier' | 'schwerpunkt' | 'artikel';

/**
 * Region classification
 */
export type BoellRegion =
  | 'afrika'
  | 'asien'
  | 'europa'
  | 'lateinamerika'
  | 'nahost'
  | 'nordamerika'
  | 'transatlantisch'
  | null;

/**
 * Extracted content from article
 */
interface ExtractedContent {
  title: string;
  description: string;
  text: string;
  publishedAt: string | null;
  contentType: BoellContentType;
  topics: string[];
  topic: string | null;
  region: BoellRegion;
  authors: string[];
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
 * Crawl options
 */
export interface BoellCrawlOptions {
  /** Force update even if content hasn't changed */
  forceUpdate?: boolean;
  /** Maximum number of articles to process */
  maxArticles?: number | null;
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
export interface BoellCrawlResult {
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
    excluded: SkipReason;
    fetch_error: SkipReason;
  };
}

/**
 * Search options
 */
export interface BoellSearchOptions {
  contentType?: BoellContentType | null;
  topic?: string | null;
  limit?: number;
  threshold?: number;
}

/**
 * Article search result
 */
export interface BoellArticleResult {
  id: string;
  score: number;
  title: string;
  content_type: BoellContentType;
  primary_category: string | null;
  subcategories: string[];
  source_url: string;
  matchedChunk: string;
}

/**
 * Collection statistics
 */
export interface BoellStats {
  collection: string;
  vectors_count?: number;
  points_count?: number;
  status?: string;
  error?: string;
}

/**
 * Böll Stiftung website scraper
 */
export class BoellStiftungScraper extends BaseScraper {
  private baseUrl: string;
  private crawlDelay: number;
  private batchSize: number;
  private maxDepth: number;
  private timeout: number;
  private maxRetries: number;
  private userAgent: string;
  private topicSlugs: readonly string[];
  private regionMapping: Record<string, BoellRegion>;
  private excludePatterns: readonly RegExp[];
  private qdrant: any;

  constructor() {
    super({
      collectionName: 'boell_stiftung_documents',
      verbose: true,
    });

    this.baseUrl = 'https://www.boell.de';
    this.crawlDelay = 1000;
    this.batchSize = 10;
    this.maxDepth = 2;
    this.timeout = 30000;
    this.maxRetries = 3;
    this.userAgent = BRAND?.botUserAgent || 'Gruenerator-Bot/1.0';
    this.qdrant = null;

    // Comprehensive topic list for Böll Stiftung
    this.topicSlugs = [
      'afrika',
      'arbeit',
      'asien',
      'aussen-sicherheitspolitik',
      'bildung',
      'buergerbeteiligung',
      'commons',
      'digitalisierung',
      'energiewende',
      'europaeische-union',
      'europapolitik',
      'familienpolitik',
      'feminismus',
      'finanzen',
      'film',
      'geoengineering',
      'geschlechterdemokratie',
      'gruene-geschichte',
      'heinrich-boell',
      'hochschule',
      'infrastruktur',
      'inklusion',
      'klima',
      'kohleausstieg',
      'kommunalpolitik',
      'kuenstliche-intelligenz',
      'landwirtschaft',
      'lateinamerika',
      'literatur',
      'lsbtiq',
      'medienpolitik',
      'menschenrechte',
      'migration',
      'mobilitaet',
      'naher-osten',
      'nordafrika',
      'nordamerika',
      'oeffentliche-raeume',
      'ost-suedosteuropa',
      'plastik',
      'politikforschung',
      'populismus',
      'ressourcen',
      'schule',
      'sozialpolitik',
      'stadtentwicklung',
      'teilhabe',
      'theater',
      'transatlantische-beziehungen',
      'verkehrswende',
      'waermewende',
      'weltwirtschaft',
      'zeitdiagnose',
      'zeitgeschichte',
    ] as const;

    // Topic to region mapping
    this.regionMapping = {
      afrika: 'afrika',
      asien: 'asien',
      'europaeische-union': 'europa',
      europapolitik: 'europa',
      lateinamerika: 'lateinamerika',
      'naher-osten': 'nahost',
      nordafrika: 'nahost',
      nordamerika: 'nordamerika',
      'ost-suedosteuropa': 'europa',
      'transatlantische-beziehungen': 'transatlantisch',
    };

    // URL patterns to exclude
    this.excludePatterns = [
      /\/publikationen(\/)?$/i,
      /\/publikationen\?/i,
      /\/veranstaltungen(\/)?$/i,
      /\/stipendien(\/)?$/i,
      /\/en\//i,
      /\/presse(\/)?$/i,
      /\/podcast(s)?(\/)?$/i,
      /\.(pdf|jpg|jpeg|png|gif|mp3|mp4|zip)$/i,
      /\/person\//i,
      /\/kontakt(\/)?$/i,
      /\/newsletter(\/)?$/i,
      /\/spenden(\/)?$/i,
      /\/service(\/)?$/i,
      /\/ueber-uns(\/)?$/i,
      /\/weltweit(\/)?$/i,
      /\/referate-institute(\/)?$/i,
      /\/themen(\/)?$/i,
      /\/suche(\/)?$/i,
      /\/archiv(\/)?$/i,
      /\/mediathek(\/)?$/i,
      /\/shop(\/)?$/i,
      /\/login(\/)?$/i,
      /\/register(\/)?$/i,
    ] as const;
  }

  /**
   * Initialize services
   */
  async init(): Promise<void> {
    this.qdrant = getQdrantInstance();
    await this.qdrant.init();
    await fastEmbedService.init();
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
      duration: result.duration * 1000, // Convert to ms
    };
  }

  /**
   * Check if URL should be excluded
   */
  #isExcludedUrl(url: string): boolean {
    return this.excludePatterns.some((pattern) => pattern.test(url));
  }

  /**
   * Fetch page with retry logic
   */
  async #fetchPage(url: string, retries: number = 0): Promise<string | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'de-DE,de;q=0.9',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        return null;
      }

      return await response.text();
    } catch (error) {
      clearTimeout(timeoutId);
      if (retries < this.maxRetries) {
        await this.delay(1000 * (retries + 1));
        return this.#fetchPage(url, retries + 1);
      }
      throw error;
    }
  }

  /**
   * Extract content from HTML
   */
  #extractContent(html: string, url: string): ExtractedContent {
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $('script, style, noscript, iframe, nav, header, footer').remove();
    $('.navigation, .sidebar, .cookie-banner, .cookie-notice, .popup, .modal').remove();
    $('[role="navigation"], [role="banner"], [role="contentinfo"]').remove();
    $('.breadcrumb, .breadcrumb-nav, [aria-label*="Breadcrumb"]').remove();
    $('.social-share, .share-buttons, .related-content').remove();
    $('.author-info, .author-bio').remove();

    // Extract metadata
    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('h1.page-title').first().text().trim() ||
      $('h1').first().text().trim() ||
      $('title').text().trim() ||
      '';

    const description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';

    // Extract publication date
    let publishedAt: string | null = null;
    const ogDate = $('meta[property="article:published_time"]').attr('content');
    if (ogDate) {
      publishedAt = ogDate;
    } else {
      const timeEl = $('time[datetime]').first();
      if (timeEl.length) {
        publishedAt = timeEl.attr('datetime') || null;
      }
    }

    // Content extraction selectors (Böll-specific)
    const contentSelectors = [
      '.field--name-body',
      '.node__content',
      'article .content',
      '.article-content',
      '.main-content',
      'main article',
      '.text-content',
      '[role="main"]',
    ];

    let contentText = '';
    for (const selector of contentSelectors) {
      const el = $(selector);
      if (el.length && el.text().trim().length > 100) {
        contentText = el.text();
        break;
      }
    }

    // Fallback to main or body
    if (!contentText || contentText.trim().length < 100) {
      contentText = $('main').text() || $('body').text();
    }

    // Clean text
    contentText = contentText.replace(/\s+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

    const contentType = this.#detectContentType(url, $);
    const topics = this.#extractTopics($, url);
    const region = this.#detectRegion(url, topics);
    const authors = this.#extractAuthors($);

    return {
      title: title.substring(0, 500),
      description: description.substring(0, 1000),
      text: contentText,
      publishedAt,
      contentType,
      topics,
      topic: topics[0] || null,
      region,
      authors,
    };
  }

  /**
   * Detect content type from URL and HTML
   */
  #detectContentType(url: string, $: cheerio.CheerioAPI): BoellContentType {
    const urlLower = url.toLowerCase();

    if (urlLower.includes('atlas') || urlLower.includes('grafiken-und-lizenzbestimmungen')) {
      return 'atlas';
    }
    if (urlLower.includes('dossier')) {
      return 'dossier';
    }
    if (urlLower.includes('schwerpunkt')) {
      return 'schwerpunkt';
    }

    const bodyClass = $('body').attr('class') || '';
    if (bodyClass.includes('node-type-atlas')) return 'atlas';
    if (bodyClass.includes('node-type-dossier')) return 'dossier';
    if (bodyClass.includes('node-type-schwerpunkt')) return 'schwerpunkt';

    return 'artikel';
  }

  /**
   * Extract topics from URL and HTML
   */
  #extractTopics($: cheerio.CheerioAPI, url: string): string[] {
    const topics: string[] = [];

    // Extract from URL
    for (const slug of this.topicSlugs) {
      if (url.includes(`/themen/${slug}`) || url.includes(`/${slug}/`)) {
        topics.push(slug);
      }
    }

    // Extract from tags/taxonomy
    $('.field--name-field-tags a, .tags a, .taxonomy a').each((_, el) => {
      const tag = $(el)
        .text()
        .trim()
        .toLowerCase()
        .replace(/[äöü]/g, (match) => ({ ä: 'ae', ö: 'oe', ü: 'ue' }[match as 'ä' | 'ö' | 'ü'] || match))
        .replace(/\s+/g, '-');
      if (this.topicSlugs.includes(tag as any) && !topics.includes(tag)) {
        topics.push(tag);
      }
    });

    return topics.slice(0, 5);
  }

  /**
   * Detect region from topics and URL
   */
  #detectRegion(url: string, topics: string[]): BoellRegion {
    // Check topics first
    for (const topic of topics) {
      if (this.regionMapping[topic]) {
        return this.regionMapping[topic];
      }
    }

    // Check URL
    for (const [slug, region] of Object.entries(this.regionMapping)) {
      if (url.includes(slug)) {
        return region;
      }
    }

    return null;
  }

  /**
   * Extract authors from HTML
   */
  #extractAuthors($: cheerio.CheerioAPI): string[] {
    const authors: string[] = [];

    $('.field--name-field-author a, .author a, .byline a').each((_, el) => {
      const name = $(el).text().trim();
      if (name && name.length > 2 && name.length < 100) {
        authors.push(name);
      }
    });

    return authors.slice(0, 5);
  }

  /**
   * Extract article links from a page
   */
  #extractArticleLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
    const links = new Set<string>();
    const datePattern = /\/de\/\d{4}\/\d{2}\/\d{2}\//;
    const themenPattern = /\/de\/themen\/[^\/]+\/.+/;

    $('a[href]').each((_, el) => {
      let href = $(el).attr('href');
      if (!href) return;

      // Make absolute
      if (href.startsWith('/')) {
        href = `${this.baseUrl}${href}`;
      }

      // Same domain only
      if (!href.startsWith(this.baseUrl)) return;
      if (!href.includes('/de/')) return;
      if (this.#isExcludedUrl(href)) return;

      // Clean URL
      const cleanUrl = href.split('#')[0].split('?')[0];

      // Must match article patterns
      if (datePattern.test(cleanUrl) || themenPattern.test(cleanUrl)) {
        links.add(cleanUrl);
      }
    });

    return Array.from(links);
  }

  /**
   * Check if article exists in Qdrant
   */
  async #articleExists(url: string): Promise<ExistingArticle | null> {
    try {
      const result = await this.qdrant.client.scroll(this.config.collectionName, {
        filter: {
          must: [{ key: 'source_url', match: { value: url } }],
        },
        limit: 1,
        with_payload: ['content_hash', 'indexed_at'],
        with_vector: false,
      });

      if (result.points && result.points.length > 0) {
        return result.points[0].payload as ExistingArticle;
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
    await this.qdrant.client.delete(this.config.collectionName, {
      filter: {
        must: [{ key: 'source_url', match: { value: url } }],
      },
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
        source: 'boell_stiftung',
        source_url: url,
      },
    });

    if (chunks.length === 0) {
      return { stored: false, reason: 'no_chunks' };
    }

    const chunkTexts = chunks.map((c: any) => c.text || c.chunk_text);
    const embeddings = await fastEmbedService.generateBatchEmbeddings(chunkTexts);

    const subcategories = [...(content.topics || [])];
    if (content.region && !subcategories.includes(content.region)) {
      subcategories.push(content.region);
    }

    const points = chunks.map((chunk, index) => ({
      id: generatePointId('boell', url, index),
      vector: embeddings[index],
      payload: {
        article_id: `boell_${contentHash}`,
        source_url: url,
        content_hash: contentHash,
        chunk_index: index,
        chunk_text: chunkTexts[index],
        content_type: content.contentType,
        primary_category: content.topic,
        subcategories: subcategories,
        title: content.title,
        description: content.description,
        authors: content.authors,
        published_at: content.publishedAt,
        source: 'boell_stiftung',
        indexed_at: new Date().toISOString(),
      },
    }));

    // Store in batches of 10
    for (let i = 0; i < points.length; i += 10) {
      const batch = points.slice(i, i + 10);
      await this.qdrant.client.upsert(this.config.collectionName, { points: batch });
    }

    return { stored: true, chunks: chunks.length, vectors: points.length, updated: !!existing };
  }

  /**
   * Discover article URLs from topic pages
   */
  async discoverFromTopicPages(): Promise<string[]> {
    const allUrls = new Set<string>();

    this.log(`Discovering URLs from ${this.topicSlugs.length} topic pages...`);

    for (const slug of this.topicSlugs) {
      const topicUrl = `${this.baseUrl}/de/themen/${slug}`;

      try {
        const html = await this.#fetchPage(topicUrl);
        if (!html) continue;

        const $ = cheerio.load(html);
        const links = this.#extractArticleLinks($, topicUrl);

        links.forEach((link) => allUrls.add(link));
        this.log(`Topic "${slug}": found ${links.length} links`);

        await this.delay(this.crawlDelay);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[BoellStiftung] Failed to crawl topic "${slug}": ${errorMessage}`);
      }
    }

    this.log(`Total unique URLs discovered: ${allUrls.size}`);
    return Array.from(allUrls);
  }

  /**
   * Full crawl of all topics
   */
  async fullCrawl(options: BoellCrawlOptions = {}): Promise<BoellCrawlResult> {
    const { forceUpdate = false, maxArticles = null } = options;
    const startTime = Date.now();

    this.log('\n═══════════════════════════════════════');
    this.log('Starting full crawl');
    this.log(`Force update: ${forceUpdate}`);
    if (maxArticles) this.log(`Max articles: ${maxArticles}`);
    this.log('═══════════════════════════════════════\n');

    const result: BoellCrawlResult = {
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
        excluded: { count: 0, examples: [] },
        fetch_error: { count: 0, examples: [] },
      },
    };

    try {
      const urls = await this.discoverFromTopicPages();
      result.totalUrls = urls.length;

      const urlsToProcess = maxArticles ? urls.slice(0, maxArticles) : urls;

      for (let i = 0; i < urlsToProcess.length; i++) {
        const url = urlsToProcess[i];

        if (this.visitedUrls.has(url)) {
          continue;
        }
        this.visitedUrls.add(url);

        if (this.#isExcludedUrl(url)) {
          result.skipped++;
          result.skipReasons.excluded.count++;
          continue;
        }

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
              `✓ [${i + 1}/${urlsToProcess.length}] "${content.title?.substring(0, 50)}" (${processResult.chunks} chunks)`
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
          console.error(`[BoellStiftung] ✗ Error ${url}: ${errorMessage}`);
          result.errors++;
          result.skipReasons.fetch_error.count++;
          if (result.skipReasons.fetch_error.examples.length < 5) {
            result.skipReasons.fetch_error.examples.push(url);
          }
        }

        if (i % 10 === 0 && i > 0) {
          this.log(`Progress: ${result.stored} stored, ${result.updated} updated, ${result.skipped} skipped`);
        }

        await this.delay(this.crawlDelay);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[BoellStiftung] Crawl failed:', errorMessage);
      throw error;
    }

    result.duration = Math.round((Date.now() - startTime) / 1000);

    this.log('\n═══════════════════════════════════════');
    this.log(`COMPLETED: ${result.stored} new, ${result.updated} updated (${result.totalVectors} vectors)`);
    this.log(`Skipped: ${result.skipped}, Errors: ${result.errors}`);
    this.log(`Duration: ${result.duration}s`);

    if (result.skipped > 0) {
      this.log('\nSkip Breakdown:');
      const sr = result.skipReasons;
      if (sr.unchanged.count > 0) this.log(`  • Unchanged: ${sr.unchanged.count}`);
      if (sr.too_short.count > 0) this.log(`  • Too short: ${sr.too_short.count}`);
      if (sr.no_chunks.count > 0) this.log(`  • No chunks: ${sr.no_chunks.count}`);
      if (sr.excluded.count > 0) this.log(`  • Excluded URL: ${sr.excluded.count}`);
      if (sr.fetch_error.count > 0) this.log(`  • Fetch errors: ${sr.fetch_error.count}`);
    }

    this.log('═══════════════════════════════════════');

    return result;
  }

  /**
   * Incremental update (only new/changed content)
   */
  async incrementalUpdate(): Promise<BoellCrawlResult> {
    return this.fullCrawl({ forceUpdate: false });
  }

  /**
   * Search articles by semantic query
   */
  async searchArticles(query: string, options: BoellSearchOptions = {}): Promise<{ results: BoellArticleResult[]; total: number }> {
    const { contentType = null, topic = null, limit = 10, threshold = 0.35 } = options;

    const queryVector = await fastEmbedService.generateQueryEmbedding(query);

    const filter: any = { must: [] };
    if (contentType) {
      filter.must.push({ key: 'content_type', match: { value: contentType } });
    }
    if (topic) {
      filter.must.push({ key: 'primary_category', match: { value: topic } });
    }

    const searchResult = await this.qdrant.client.search(this.config.collectionName, {
      vector: queryVector,
      filter: filter.must.length > 0 ? filter : undefined,
      limit: limit * 3,
      score_threshold: threshold,
      with_payload: true,
    });

    const articlesMap = new Map<string, BoellArticleResult>();
    for (const hit of searchResult) {
      const articleId = hit.payload.article_id;
      if (!articlesMap.has(articleId)) {
        articlesMap.set(articleId, {
          id: articleId,
          score: hit.score,
          title: hit.payload.title,
          content_type: hit.payload.content_type,
          primary_category: hit.payload.primary_category,
          subcategories: hit.payload.subcategories,
          source_url: hit.payload.source_url,
          matchedChunk: hit.payload.chunk_text,
        });
      }

      if (articlesMap.size >= limit) break;
    }

    return {
      results: Array.from(articlesMap.values()),
      total: articlesMap.size,
    };
  }

  /**
   * Get collection statistics
   */
  async getStats(): Promise<BoellStats> {
    try {
      const info = await this.qdrant.client.getCollection(this.config.collectionName);
      return {
        collection: this.config.collectionName,
        vectors_count: info.vectors_count,
        points_count: info.points_count,
        status: info.status,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { collection: this.config.collectionName, error: errorMessage };
    }
  }

  /**
   * Get all unique topics
   */
  async getTopics(): Promise<string[]> {
    try {
      const topics = new Set<string>();
      let offset: string | number | null = null;

      do {
        const result = await this.qdrant.client.scroll(this.config.collectionName, {
          limit: 100,
          offset: offset,
          with_payload: ['subcategories'],
          with_vector: false,
        });

        for (const point of result.points) {
          if (point.payload.subcategories) {
            point.payload.subcategories.forEach((t: string) => topics.add(t));
          }
        }

        offset = result.next_page_offset;
      } while (offset);

      return Array.from(topics).sort();
    } catch (error) {
      return [];
    }
  }

  /**
   * Clear entire collection
   */
  async clearCollection(): Promise<void> {
    this.log('Clearing all documents...');
    try {
      let offset: string | number | null = null;
      const points: number[] = [];

      do {
        const result = await this.qdrant.client.scroll(this.config.collectionName, {
          limit: 100,
          offset: offset,
          with_payload: false,
          with_vector: false,
        });

        points.push(...result.points.map((p: any) => p.id));
        offset = result.next_page_offset;
      } while (offset);

      if (points.length > 0) {
        for (let i = 0; i < points.length; i += 100) {
          const batch = points.slice(i, i + 100);
          await this.qdrant.client.delete(this.config.collectionName, {
            points: batch,
          });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[BoellStiftung] Clear failed:', errorMessage);
    }
    this.log('Collection cleared');
  }
}

// Singleton instance for backward compatibility
export const boellStiftungScraperService = new BoellStiftungScraper();
export default boellStiftungScraperService;

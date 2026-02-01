/**
 * Landesverband Scraper - Main Orchestrator
 * Scrapes German Green Party state associations (Landesverbände) and parliamentary groups
 * Delegates to specialized modules for focused responsibilities
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  getSourceById,
  getSourcesByType,
  getSourcesByLandesverband,
  LANDESVERBAENDE_CONFIG,
  type SourceType,
} from '../../../../config/landesverbaendeConfig.js';
import { getQdrantInstance } from '../../../../database/services/QdrantService/index.js';
import {
  scrollDocuments,
  batchDelete,
} from '../../../../database/services/QdrantService/operations/batchOperations.js';
import { BRAND } from '../../../../utils/domainUtils.js';
import { mistralEmbeddingService } from '../../../mistral/index.js';
import { ocrService } from '../../../OcrService/index.js';

import { BaseScraper } from '../../base/BaseScraper.js';
import { ContentExtractor } from './extractors/ContentExtractor.js';
import { DateExtractor } from './extractors/DateExtractor.js';
import { LinkExtractor } from './extractors/LinkExtractor.js';
import { SearchOperations } from './operations/SearchOperations.js';
import { DocumentProcessor } from './processors/DocumentProcessor.js';

import type {
  SourceResult,
  LandesverbandScrapeOptions,
  LandesverbandFullResult,
  ContentPathResult,
  LandesverbandSearchOptions,
} from './types.js';
import type { ScraperResult } from '../../types.js';

/**
 * Main scraper class - orchestrates all modules
 * Reduced from 1,139 lines to ~400 lines through modularization
 */
export class LandesverbandScraper extends BaseScraper {
  private qdrantClient: any;
  private searchOps!: SearchOperations;
  private documentProcessor!: DocumentProcessor;
  private linkExtractor!: LinkExtractor;

  private crawlDelay: number;
  private batchSize: number;
  private timeout: number;
  private maxRetries: number;
  private userAgent: string;

  constructor() {
    super({
      collectionName: 'landesverbaende_documents',
      verbose: true,
    });

    this.crawlDelay = 500;
    this.batchSize = 10;
    this.timeout = 60000;
    this.maxRetries = 3;
    this.userAgent = BRAND?.botUserAgent || 'Gruenerator-Bot/1.0';
  }

  /**
   * Initialize services & compose dependencies
   * Dependency injection pattern for testability
   */
  async init(): Promise<void> {
    const qdrant = getQdrantInstance();
    await qdrant.init();
    await mistralEmbeddingService.init();

    // Store Qdrant client
    this.qdrantClient = qdrant.client;

    // Compose operations
    this.searchOps = new SearchOperations(qdrant, this.config.collectionName);
    this.documentProcessor = new DocumentProcessor(
      this.qdrantClient,
      this.config.collectionName,
      this.generateHash.bind(this),
      this.#generatePointId.bind(this),
      { batchSize: this.batchSize }
    );
    this.linkExtractor = new LinkExtractor(
      this.#fetchUrl.bind(this),
      this.#normalizeUrl.bind(this),
      this.#shouldExcludeUrl.bind(this),
      this.delay.bind(this)
    );

    this.log('Service initialized');
  }

  /**
   * Main scraping method (implements abstract method from BaseScraper)
   */
  async scrape(): Promise<ScraperResult> {
    const result = await this.scrapeAllSources({});
    return {
      documentsProcessed: result.stored + result.updated,
      chunksCreated: result.totalVectors,
      vectorsStored: result.totalVectors,
      errors: [],
      duration: result.duration * 1000,
    };
  }

  /**
   * Scrape a content path (articles or PDFs)
   * Delegates to specialized processors based on content type
   */
  async #scrapeContentPath(
    source: any,
    contentPath: any,
    options: LandesverbandScrapeOptions = {}
  ): Promise<ContentPathResult> {
    const { forceUpdate = false, maxDocuments = null } = options;
    const targetCollection = source.qdrantCollection || this.config.collectionName;
    const result: ContentPathResult = {
      contentType: contentPath.type,
      stored: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      totalVectors: 0,
      skipReasons: {},
    };

    this.log(`\nScraping ${source.name} - ${contentPath.type} from ${contentPath.path}`);

    if (contentPath.isPdfArchive) {
      // PDF archive processing with cost optimization
      const pdfLinks = await this.linkExtractor.extractPdfLinks(source, contentPath);
      this.log(`Found ${pdfLinks.length} PDF links`);

      // Extract dates BEFORE expensive OCR (cost optimization)
      const pdfLinksWithDates = pdfLinks.map((pdf) => ({
        ...pdf,
        dateInfo: DateExtractor.extractDateFromPdfInfo(pdf.url, pdf.title, pdf.context),
      }));

      const recentPdfs = pdfLinksWithDates.filter((pdf) => pdf.dateInfo.isTooOld === false);
      const oldPdfs = pdfLinksWithDates.filter((pdf) => pdf.dateInfo.isTooOld === true);
      const undatedPdfs = pdfLinksWithDates.filter((pdf) => pdf.dateInfo.isTooOld === null);

      if (oldPdfs.length > 0) {
        this.log(`Skipping ${oldPdfs.length} PDFs older than 10 years`);
        result.skipped += oldPdfs.length;
        result.skipReasons['too_old'] = (result.skipReasons['too_old'] || 0) + oldPdfs.length;
      }

      if (undatedPdfs.length > 0) {
        this.log(`Skipping ${undatedPdfs.length} PDFs without detectable dates`);
        result.skipped += undatedPdfs.length;
        result.skipReasons['no_date'] = (result.skipReasons['no_date'] || 0) + undatedPdfs.length;
      }

      const toProcess = maxDocuments ? recentPdfs.slice(0, maxDocuments) : recentPdfs;
      this.log(`Processing ${toProcess.length} recent PDFs`);

      for (let i = 0; i < toProcess.length; i++) {
        const pdf = toProcess[i];
        try {
          if (!forceUpdate) {
            const points = await scrollDocuments(
              this.qdrantClient,
              targetCollection,
              { must: [{ key: 'source_url', match: { value: pdf.url } }] },
              { limit: 1, withPayload: false, withVector: false }
            );
            if (points.length > 0) {
              result.skipped++;
              continue;
            }
          }

          const response = await this.#fetchUrl(pdf.url);
          const arrayBuffer = await response.arrayBuffer();
          const pdfBuffer = Buffer.from(arrayBuffer);

          const filename = pdf.url.split('/').pop() || 'document.pdf';

          // Write PDF to temp file for OcrService
          const tempPath = path.join(os.tmpdir(), `landesverband_${Date.now()}_${filename}`);
          let text = '';

          try {
            await fs.writeFile(tempPath, pdfBuffer);
            this.log(`Processing PDF with OcrService: ${filename}`);

            const result = await ocrService.extractTextWithMistralOCR(tempPath);
            text = result.text || '';

            this.log(`OcrService extracted ${text.length} chars from ${filename}`);
          } finally {
            // Clean up temp file
            try {
              await fs.unlink(tempPath);
            } catch (e) {
              // Ignore cleanup errors
            }
          }

          const storeResult = await this.documentProcessor.processAndStoreDocument(
            source,
            contentPath.type,
            pdf.url,
            {
              title: pdf.title,
              text,
              publishedAt: pdf.dateInfo.dateString,
              categories: [],
            },
            targetCollection,
            source.maxAgeYears
          );

          if (storeResult.stored) {
            if (storeResult.updated) result.updated++;
            else result.stored++;
            result.totalVectors += storeResult.vectors || 0;
            this.log(
              `✓ PDF [${i + 1}/${toProcess.length}] ${pdf.title} (${pdf.dateInfo.dateString || 'no date'})`
            );
          } else {
            result.skipped++;
            result.skipReasons[storeResult.reason || 'unknown'] =
              (result.skipReasons[storeResult.reason || 'unknown'] || 0) + 1;
          }

          await this.delay(this.crawlDelay);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[Landesverband] ✗ PDF error: ${errorMessage}`);
          result.errors++;
        }
      }
    } else {
      // HTML article processing - use sitemap if available, otherwise pagination
      let articleLinks: string[];

      if (contentPath.sitemapUrls && contentPath.sitemapUrls.length > 0) {
        this.log(`Using sitemap extraction for ${contentPath.type}`);
        articleLinks = await this.linkExtractor.extractLinksFromSitemaps(
          contentPath.sitemapUrls,
          contentPath.sitemapFilter,
          this.log.bind(this)
        );
      } else {
        articleLinks = await this.linkExtractor.extractArticleLinks(
          source,
          contentPath,
          this.log.bind(this)
        );
      }
      this.log(`Found ${articleLinks.length} article links`);

      const toProcess = maxDocuments ? articleLinks.slice(0, maxDocuments) : articleLinks;

      for (let i = 0; i < toProcess.length; i++) {
        const url = toProcess[i];
        try {
          if (!forceUpdate) {
            const points = await scrollDocuments(
              this.qdrantClient,
              targetCollection,
              { must: [{ key: 'source_url', match: { value: url } }] },
              { limit: 1, withPayload: false, withVector: false }
            );
            if (points.length > 0) {
              result.skipped++;
              continue;
            }
          }

          const content = await ContentExtractor.extractPageContent(
            url,
            source,
            this.#fetchUrl.bind(this)
          );
          const storeResult = await this.documentProcessor.processAndStoreDocument(
            source,
            contentPath.type,
            url,
            content,
            targetCollection,
            source.maxAgeYears
          );

          if (storeResult.stored) {
            if (storeResult.updated) result.updated++;
            else result.stored++;
            result.totalVectors += storeResult.vectors || 0;
            this.log(`✓ [${i + 1}/${toProcess.length}] ${content.title?.substring(0, 60) || url}`);
          } else {
            result.skipped++;
            result.skipReasons[storeResult.reason || 'unknown'] =
              (result.skipReasons[storeResult.reason || 'unknown'] || 0) + 1;
          }

          await this.delay(this.crawlDelay);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[Landesverband] ✗ Error: ${errorMessage}`);
          result.errors++;
        }
      }
    }

    return result;
  }

  /**
   * Scrape a single source
   */
  async scrapeSource(
    sourceId: string,
    options: LandesverbandScrapeOptions = {}
  ): Promise<SourceResult> {
    const source = getSourceById(sourceId);
    if (!source) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    this.log('\n═══════════════════════════════════════');
    this.log(`Scraping: ${source.name}`);
    this.log(`Type: ${source.type}`);
    this.log(`CMS: ${source.cms}`);
    this.log(`Content paths: ${source.contentPaths.length}`);
    this.log('═══════════════════════════════════════\n');

    const result: SourceResult = {
      sourceId: source.id,
      sourceName: source.name,
      stored: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      totalVectors: 0,
      contentTypes: {},
    };

    for (const contentPath of source.contentPaths) {
      if (options.contentType && contentPath.type !== options.contentType) {
        continue;
      }

      const pathResult = await this.#scrapeContentPath(source, contentPath, options);
      result.stored += pathResult.stored;
      result.updated += pathResult.updated;
      result.skipped += pathResult.skipped;
      result.errors += pathResult.errors;
      result.totalVectors += pathResult.totalVectors;
      result.contentTypes[contentPath.type] = pathResult;
    }

    return result;
  }

  /**
   * Scrape all sources or filtered subset
   */
  async scrapeAllSources(
    options: LandesverbandScrapeOptions = {}
  ): Promise<LandesverbandFullResult> {
    const startTime = Date.now();
    const { sourceType = null, landesverband = null, contentType = null } = options;

    let sources = (LANDESVERBAENDE_CONFIG as any).sources;

    if (sourceType) {
      sources = getSourcesByType(sourceType as SourceType);
    }

    if (landesverband) {
      sources = getSourcesByLandesverband(landesverband);
    }

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║       Landesverbaende Scraper - Full Crawl                ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    this.log(`Sources to process: ${sources.length}`);
    if (sourceType) this.log(`Filter by type: ${sourceType}`);
    if (landesverband) this.log(`Filter by LV: ${landesverband}`);
    if (contentType) this.log(`Filter by content: ${contentType}`);

    const totalResult: LandesverbandFullResult = {
      sourcesProcessed: 0,
      stored: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      totalVectors: 0,
      bySource: {},
      duration: 0,
    };

    for (const source of sources) {
      try {
        const sourceResult = await this.scrapeSource(source.id, { ...options, contentType });
        totalResult.sourcesProcessed++;
        totalResult.stored += sourceResult.stored;
        totalResult.updated += sourceResult.updated;
        totalResult.skipped += sourceResult.skipped;
        totalResult.errors += sourceResult.errors;
        totalResult.totalVectors += sourceResult.totalVectors;
        totalResult.bySource[source.id] = sourceResult;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Landesverband] Failed to scrape ${source.id}: ${errorMessage}`);
        totalResult.errors++;
      }
    }

    totalResult.duration = Math.round((Date.now() - startTime) / 1000);

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                    CRAWL COMPLETE                         ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    this.log(`Sources processed: ${totalResult.sourcesProcessed}`);
    this.log(`New documents: ${totalResult.stored}`);
    this.log(`Updated: ${totalResult.updated}`);
    this.log(`Skipped: ${totalResult.skipped}`);
    this.log(`Errors: ${totalResult.errors}`);
    this.log(`Total vectors: ${totalResult.totalVectors}`);
    this.log(`Duration: ${totalResult.duration}s`);

    return totalResult;
  }

  /**
   * Search documents (delegates to SearchOperations)
   */
  async searchDocuments(query: string, options: LandesverbandSearchOptions = {}): Promise<any> {
    return this.searchOps.searchDocuments(query, options);
  }

  /**
   * Get stats (delegates to SearchOperations)
   */
  async getStats(): Promise<any> {
    return this.searchOps.getStats();
  }

  /**
   * Clear specific source using batch delete
   */
  async clearSource(sourceId: string): Promise<void> {
    this.log(`Clearing source: ${sourceId}`);
    const filter = {
      must: [{ key: 'source_id', match: { value: sourceId } }],
    };
    await batchDelete(this.qdrantClient, this.config.collectionName, filter);
    this.log(`Source ${sourceId} cleared`);
  }

  /**
   * Clear entire collection using batch delete
   */
  async clearCollection(): Promise<void> {
    this.log('Clearing entire collection...');
    // Delete all points by using an empty filter with must_not condition that never matches
    await batchDelete(this.qdrantClient, this.config.collectionName, {});
    this.log('Collection cleared');
  }

  /**
   * Get list of available sources
   */
  getSources(): any[] {
    return (LANDESVERBAENDE_CONFIG as any).sources.map((s: any) => ({
      id: s.id,
      name: s.name,
      shortName: s.shortName,
      type: s.type,
      baseUrl: s.baseUrl,
      cms: s.cms,
      contentTypes: s.contentPaths.map((cp: any) => cp.type),
    }));
  }

  // ────────────────────────────────────────────────────────────
  // HELPER METHODS (URL handling, retry logic, point ID generation)
  // ────────────────────────────────────────────────────────────

  /**
   * Fetch URL with retry logic and timeout
   */
  async #fetchUrl(url: string): Promise<Response> {
    return this.fetchWithRetry(url, {
      timeout: this.timeout,
      maxRetries: this.maxRetries,
      userAgent: this.userAgent,
    });
  }

  /**
   * Normalize relative URLs to absolute
   */
  #normalizeUrl(url: string | undefined, baseUrl: string): string | null {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    if (url.startsWith('//')) {
      return 'https:' + url;
    }
    if (url.startsWith('/')) {
      return baseUrl + url;
    }
    return baseUrl + '/' + url;
  }

  /**
   * Check if URL should be excluded based on patterns
   */
  #shouldExcludeUrl(url: string, excludePatterns?: string[]): boolean {
    if (!url || !excludePatterns) return false;
    return excludePatterns.some((pattern) => url.includes(pattern));
  }

  /**
   * Generate deterministic point ID from URL and chunk index
   */
  #generatePointId(url: string, chunkIndex: number): number {
    const combinedString = `lv_${url}_${chunkIndex}`;
    let hash = 0;
    for (let i = 0; i < combinedString.length; i++) {
      const char = combinedString.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

// Singleton instance for backward compatibility
export const landesverbandScraperService = new LandesverbandScraper();
export default landesverbandScraperService;

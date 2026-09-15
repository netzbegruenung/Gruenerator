/**
 * Landesverband Scraper - Main Orchestrator
 * Scrapes German Green Party state associations (Landesverbände) and parliamentary groups
 * Delegates to specialized modules for focused responsibilities
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

import { type QdrantClient } from '@qdrant/js-client-rest';

import { env } from '../../../../config/env.js';
import {
  getSourceById,
  getSourcesByType,
  getSourcesByLandesverband,
  LANDESVERBAENDE_CONFIG,
  type SourceType,
  type ContentPath,
  type LandesverbandSource,
} from '../../../../config/landesverbaendeConfig.js';
import { getDisabledLandesverbandShortNames } from '../../../../config/notebookCollectionMap.js';
import { getQdrantInstance } from '../../../../database/services/QdrantService/index.js';
import {
  scrollDocuments,
  batchDelete,
} from '../../../../database/services/QdrantService/operations/batchOperations.js';
import { BRAND } from '../../../../utils/domainUtils.js';
import { parallelLimit } from '../../../../utils/parallelLimit.js';
import { sendLvSyncNotificationEmail } from '../../../email/emailService.js';
import { mistralEmbeddingService } from '../../../mistral/index.js';
import { ocrService } from '../../../OcrService/index.js';
import { BaseScraper, HttpStatusError, isGoneStatus } from '../../base/BaseScraper.js';
import {
  recordExtraction,
  recordExtractionSkip,
  recordRedundantExtraction,
} from '../../extractionRecorder.js';
import {
  conditionalHeaders,
  fingerprintResponse,
  isSameFile,
} from '../../utils/binaryFingerprint.js';
import { collectWolkeShareFiles, extractWolkeFileText } from '../../utils/wolkeShareHandler.js';

import { ContentExtractor } from './extractors/ContentExtractor.js';
import { DateExtractor } from './extractors/DateExtractor.js';
import { LinkExtractor } from './extractors/LinkExtractor.js';
import { WpApiExtractor } from './extractors/WpApiExtractor.js';
import { SearchOperations } from './operations/SearchOperations.js';
import { DocumentProcessor } from './processors/DocumentProcessor.js';
import {
  addDeadLinkSamples,
  addErrorSamples,
  foldDeadLinksIfNothingWorked,
  mergeSkipReasons,
} from './resultSamples.js';

import type {
  SourceResult,
  LandesverbandScrapeOptions,
  LandesverbandFullResult,
  ContentPathResult,
  LandesverbandSearchOptions,
  ProcessResult,
} from './types.js';
import type { ScraperResult } from '../../types.js';

/**
 * Re-fetch an already-indexed URL once its last indexing is older than this.
 * Living documents (Wahlprogramme, revised Beschlüsse) keep a stable URL but
 * change in place; a permanent "URL exists → skip" gate froze them forever.
 * On a re-fetch the content-hash diff in DocumentProcessor decides whether to
 * actually re-embed, so unchanged pages cost only an HTTP GET, not embeddings.
 */
const RECHECK_AFTER_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

/**
 * Content published longer ago than this is treated as settled: it no longer
 * changes in place, so once indexed we never re-fetch it. This bounds the
 * per-run re-check set to recent/living content instead of re-walking a
 * multi-year archive every run — the re-fetch cost that pushed big LVs (BE, HH)
 * past the sync timeout. Pages without a parseable published date fall through
 * to the RECHECK_AFTER_MS window, so unknown-age content is still re-checked.
 */
const RECHECK_MAX_CONTENT_AGE_MS = 2 * 365 * 24 * 60 * 60 * 1000; // ~2 years

/**
 * Layer-1 freshness gate. True when the caller should skip the document entirely.
 * Skips an already-indexed URL when EITHER:
 *   - its content was published more than RECHECK_MAX_CONTENT_AGE_MS ago
 *     (settled history — never re-fetched once indexed), OR
 *   - it was last indexed within RECHECK_AFTER_MS (recently re-checked).
 * Missing, timestamp-less (legacy), or stale recent points return false so the
 * caller re-fetches. What the re-fetch then costs is decided one layer down: for
 * PDFs by the file fingerprint (before extraction), for HTML pages by the
 * DocumentProcessor content-hash diff (before embedding).
 */
function isFreshlyIndexed(payload: Record<string, unknown> | null): boolean {
  if (!payload) return false;

  const publishedAt = payload.published_at as string | undefined;
  if (publishedAt) {
    const contentAge = Date.now() - new Date(publishedAt).getTime();
    if (Number.isFinite(contentAge) && contentAge > RECHECK_MAX_CONTENT_AGE_MS) {
      return true;
    }
  }

  const indexedAt = payload.indexed_at as string | undefined;
  if (!indexedAt) return false;
  const age = Date.now() - new Date(indexedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < RECHECK_AFTER_MS;
}

/**
 * Cold archive collection for documents past their source's maxAgeYears. Stale
 * points are moved here (see #archiveStaleDocuments) instead of being deleted,
 * so notebooks/agents — which only ever query landesverbaende_documents — never
 * surface them, while historical/research functions can opt in explicitly.
 * Created at boot from COLLECTION_SCHEMAS in qdrantCollectionsSchema.ts.
 */
const LANDESVERBAENDE_ARCHIVE_COLLECTION = 'landesverbaende_archive';

/**
 * Per-content-path article processing concurrency. The article loop is purely
 * I/O-bound per item (Qdrant skip-check → HTTP fetch → embed → store), so a
 * worker pool collapses the wall-clock of multi-thousand-link archives that
 * previously ran serially and pushed big LVs (HE) past the 50-minute sync
 * timeout. Kept modest so that, combined with up to LV_CONCURRENCY sources in
 * flight (and HE serving two of them off one host), request pressure on any
 * single site stays polite — replacing the old per-item crawlDelay, which a
 * worker pool makes meaningless.
 */
const ARTICLE_CONCURRENCY = 6;

/**
 * Main scraper class - orchestrates all modules
 * Reduced from 1,139 lines to ~400 lines through modularization
 */
export class LandesverbandScraper extends BaseScraper {
  private qdrantClient!: QdrantClient; // assigned in init()
  private searchOps!: SearchOperations;
  private documentProcessor!: DocumentProcessor;
  private linkExtractor!: LinkExtractor;
  private wpApiExtractor!: WpApiExtractor;

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

    this.crawlDelay = 300;
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
    this.qdrantClient = qdrant.client!;

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
    this.wpApiExtractor = new WpApiExtractor(this.#fetchUrl.bind(this), this.delay.bind(this));

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
    source: LandesverbandSource,
    contentPath: ContentPath,
    options: LandesverbandScrapeOptions = {}
  ): Promise<ContentPathResult> {
    const { forceUpdate = false, maxDocuments = null, dryRun = false, recent = false } = options;
    // Incremental hourly window (see --recent): WP REST discovery gets a
    // modified_after filter; HTML listings are capped to their first pages. The
    // nightly run leaves `recent` off for a full walk. A 2-day lookback is
    // stateless and gap-proof across the overnight pause, and re-seeing an
    // already-indexed item is a cheap freshness-gated Qdrant skip.
    const RECENT_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;
    const RECENT_MAX_PAGES = 2;
    const modifiedAfter = recent ? new Date(Date.now() - RECENT_LOOKBACK_MS) : null;
    const targetCollection = source.qdrantCollection || this.config.collectionName;
    const result: ContentPathResult = {
      contentType: contentPath.type,
      stored: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      errorMessages: [],
      deadLinks: 0,
      deadLinkMessages: [],
      totalVectors: 0,
      skipReasons: {},
      newArticles: [],
    };

    this.log(`\nScraping ${source.name} - ${contentPath.type} from ${contentPath.path}`);

    // Incremental hourly runs skip heavy PDF/OCR/Wolke paths (recentSkip) — those
    // only run in the nightly full crawl, so PDFs aren't re-fetched every hour.
    if (recent && contentPath.recentSkip) {
      this.log(`Incremental run: skipping ${contentPath.type} (${contentPath.path}) — recentSkip`);
      return result;
    }

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
        if (contentPath.processUndatedPdfs) {
          this.log(`Found ${undatedPdfs.length} PDFs without detectable dates (will process)`);
        } else {
          this.log(`Skipping ${undatedPdfs.length} PDFs without detectable dates`);
          result.skipped += undatedPdfs.length;
          result.skipReasons['no_date'] = (result.skipReasons['no_date'] || 0) + undatedPdfs.length;
        }
      }

      const processable = contentPath.processUndatedPdfs
        ? [...recentPdfs, ...undatedPdfs]
        : recentPdfs;
      const toProcess = maxDocuments ? processable.slice(0, maxDocuments) : processable;

      // Dry run: check Qdrant for existing PDFs, report counts, skip processing
      if (dryRun) {
        let newCount = 0;
        let existingCount = 0;
        for (const pdf of toProcess) {
          const points = await scrollDocuments(
            this.qdrantClient,
            targetCollection,
            { must: [{ key: 'source_url', match: { value: pdf.url } }] },
            { limit: 1, withPayload: false, withVector: false }
          );
          if (points.length > 0) {
            existingCount++;
          } else {
            newCount++;
          }
        }
        result.stored = newCount;
        result.skipped += existingCount;
        this.log(`[DRY RUN] ${newCount} new PDFs, ${existingCount} already stored`);
        return result;
      }

      this.log(`Processing ${toProcess.length} recent PDFs`);

      for (let i = 0; i < toProcess.length; i++) {
        const pdf = toProcess[i];
        try {
          const stored = forceUpdate ? null : await this.#storedPayload(pdf.url, targetCollection);
          if (isFreshlyIndexed(stored)) {
            result.skipped++;
            recordExtractionSkip('freshly_indexed');
            continue;
          }

          // Layer 2: bedingter GET. Bestätigt der Server den gespeicherten ETag
          // bzw. Last-Modified mit 304, entfällt schon der Download.
          const response = await this.#fetchUrl(pdf.url, {
            headers: conditionalHeaders(stored),
            acceptStatus: [304],
          });

          if (response.status === 304) {
            result.skipped++;
            result.skipReasons['unchanged'] = (result.skipReasons['unchanged'] || 0) + 1;
            recordExtractionSkip('not_modified');
            continue;
          }

          const arrayBuffer = await response.arrayBuffer();
          const pdfBuffer = Buffer.from(arrayBuffer);

          // Layer 3: Byte-Fingerprint. Server ohne brauchbare Validatoren liefern
          // die Datei erneut aus; identische Bytes heißen aber, dass Extraktion
          // (bei gescannten PDFs ein seitenweise abgerechneter OCR-Lauf) und
          // Einbettung nichts Neues ergeben könnten.
          const fingerprint = fingerprintResponse(pdfBuffer, response);
          if (isSameFile(stored, fingerprint)) {
            result.skipped++;
            result.skipReasons['unchanged'] = (result.skipReasons['unchanged'] || 0) + 1;
            recordExtractionSkip('same_bytes');
            continue;
          }

          const rawFilename =
            new URL(pdf.url).pathname.replace(/\/$/, '').split('/').pop() || 'document';
          const filename = rawFilename.endsWith('.pdf') ? rawFilename : `${rawFilename}.pdf`;

          // Write PDF to temp file for OcrService
          const tempPath = path.join(os.tmpdir(), `landesverband_${Date.now()}_${filename}`);
          let text = '';

          try {
            await fs.writeFile(tempPath, pdfBuffer);
            this.log(`Processing PDF with OcrService: ${filename}`);

            const result = await ocrService.extractTextFromDocument(tempPath);
            text = result.text || '';
            recordExtraction({
              method: result.extractionMethod || result.method,
              pages: result.pageCount,
            });

            this.log(
              `OcrService extracted ${text.length} chars from ${filename} (${result.extractionMethod || 'unknown'})`
            );
          } finally {
            // Clean up temp file
            try {
              await fs.unlink(tempPath);
            } catch (_e) {
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
            source.maxAgeYears,
            fingerprint
          );

          if (storeResult.stored) {
            if (storeResult.updated) result.updated++;
            else {
              result.stored++;
              result.newArticles.push({ title: pdf.title, url: pdf.url, type: contentPath.type });
            }
            result.totalVectors += storeResult.vectors || 0;
            this.log(
              `✓ PDF [${i + 1}/${toProcess.length}] ${pdf.title} (${pdf.dateInfo.dateString || 'no date'})`
            );
          } else {
            result.skipped++;
            result.skipReasons[storeResult.reason || 'unknown'] =
              (result.skipReasons[storeResult.reason || 'unknown'] || 0) + 1;
            // Ausgelesen und danach doch unverändert — kein Gatter hat gegriffen.
            if (storeResult.reason === 'unchanged') recordRedundantExtraction();
          }

          await this.delay(this.crawlDelay);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(
            `[Landesverband] ✗ PDF error in ${source.id} (${pdf.url}): ${errorMessage}`
          );
          result.errors++;
          addErrorSamples(result, `PDF ${pdf.url}: ${errorMessage}`);
        }
      }
    } else if (contentPath.wolkeShare) {
      // Public Nextcloud "Wolke" share as a content source. etag dedup skips
      // download+OCR for unchanged files (so this stays cheap on re-runs).
      const { shareLink, recursive = true } = contentPath.wolkeShare;
      let collected: Awaited<ReturnType<typeof collectWolkeShareFiles>>;
      try {
        collected = await collectWolkeShareFiles(shareLink, recursive, this.log.bind(this));
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error(
          `[Landesverband] Wolke share list failed for ${source.id} (${shareLink}): ${msg}`
        );
        result.errors++;
        addErrorSamples(result, `Wolke-Share ${shareLink}: ${msg}`);
        return result;
      }

      const { client, files } = collected;
      const toProcess = maxDocuments ? files.slice(0, maxDocuments) : files;

      // Dry run: report new vs already-stored, don't download/OCR/store.
      if (dryRun) {
        let newCount = 0;
        let existingCount = 0;
        for (const file of toProcess) {
          const points = await scrollDocuments(
            this.qdrantClient,
            targetCollection,
            { must: [{ key: 'source_url', match: { value: file.url } }] },
            { limit: 1, withPayload: false, withVector: false }
          );
          if (points.length > 0) existingCount++;
          else newCount++;
        }
        result.stored = newCount;
        result.skipped += existingCount;
        this.log(`[DRY RUN] ${newCount} new Wolke files, ${existingCount} already stored`);
        return result;
      }

      this.log(`Processing ${toProcess.length} Wolke file(s)`);

      for (let i = 0; i < toProcess.length; i++) {
        const file = toProcess[i];
        try {
          // Layer-1 dedup: skip the download+OCR when the stored etag matches.
          // Only applies to files that stored successfully (the etag is persisted
          // on the point). Files that failed to store (OCR error, or <100-char
          // text) carry no stored etag, so they are retried each full run — which
          // is intended for transient OCR errors (e.g. a .docx that succeeds once
          // Docling is reachable) and bounded to the nightly crawl via recentSkip.
          // Files with a null WebDAV etag (rare on Nextcloud) also fall through.
          if (!forceUpdate && file.etag) {
            const existing = await scrollDocuments(
              this.qdrantClient,
              targetCollection,
              { must: [{ key: 'source_url', match: { value: file.url } }] },
              { limit: 1, withPayload: true, withVector: false }
            );
            if (existing.length > 0 && existing[0].payload?.wolke_etag === file.etag) {
              result.skipped++;
              result.skipReasons['unchanged'] = (result.skipReasons['unchanged'] || 0) + 1;
              recordExtractionSkip('not_modified');
              continue;
            }
          }

          const extraction = await extractWolkeFileText(client, file);
          recordExtraction({ method: extraction.method, pages: extraction.pages });
          const text = extraction.text;
          const title = file.name.replace(/\.[^.]+$/, '');
          const storeResult = await this.documentProcessor.processAndStoreDocument(
            source,
            contentPath.type,
            file.url,
            { title, text, publishedAt: null, categories: [] },
            targetCollection,
            source.maxAgeYears,
            file.etag ? { wolke_etag: file.etag } : undefined
          );

          if (storeResult.stored) {
            if (storeResult.updated) result.updated++;
            else {
              result.stored++;
              result.newArticles.push({ title, url: file.url, type: contentPath.type });
            }
            result.totalVectors += storeResult.vectors || 0;
            this.log(`✓ Wolke [${i + 1}/${toProcess.length}] ${title}`);
          } else {
            result.skipped++;
            result.skipReasons[storeResult.reason || 'unknown'] =
              (result.skipReasons[storeResult.reason || 'unknown'] || 0) + 1;
            if (storeResult.reason === 'unchanged') recordRedundantExtraction();
          }

          await this.delay(this.crawlDelay);
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[Landesverband] ✗ Wolke error in ${source.id} (${file.url}): ${msg}`);
          result.errors++;
          addErrorSamples(result, `Wolke ${file.url}: ${msg}`);
        }
      }
    } else {
      // HTML article processing - use static URLs, sitemap, or pagination
      let articleLinks: string[];

      if (contentPath.staticUrls && contentPath.staticUrls.length > 0) {
        this.log(`Using ${contentPath.staticUrls.length} static URLs for ${contentPath.type}`);
        articleLinks = contentPath.staticUrls;
      } else if (contentPath.wpApi) {
        this.log(
          `Using WordPress REST API discovery (category ${contentPath.wpApi.categoryId}) for ${contentPath.type}`
        );
        articleLinks = await this.wpApiExtractor.extractArticleLinks(
          source,
          contentPath,
          this.log.bind(this),
          modifiedAfter
        );
      } else if (contentPath.sitemapUrls && contentPath.sitemapUrls.length > 0) {
        this.log(`Using sitemap extraction for ${contentPath.type}`);
        articleLinks = await this.linkExtractor.extractLinksFromSitemaps(
          contentPath.sitemapUrls,
          contentPath.sitemapFilter,
          this.log.bind(this)
        );
      } else {
        // Incremental: cap HTML-listing discovery to the first pages (newest items
        // sit on page 1 of a reverse-chronological listing). The full walk runs nightly.
        const discoveryPath =
          recent && (contentPath.maxPages ?? RECENT_MAX_PAGES) > RECENT_MAX_PAGES
            ? { ...contentPath, maxPages: RECENT_MAX_PAGES }
            : contentPath;
        if (recent) {
          this.log(
            `Incremental: first ${discoveryPath.maxPages ?? RECENT_MAX_PAGES} listing page(s) only`
          );
        }
        articleLinks = await this.linkExtractor.extractArticleLinks(
          source,
          discoveryPath,
          this.log.bind(this)
        );
      }

      // Filter: only keep links whose path starts with the content path being scraped.
      // Prevents cross-contamination (e.g., /beschluesse/ links picked up from /nachrichten sidebar).
      //
      // Bypass for sitemap-discovered URLs and any path that explicitly opts out:
      // sitemap URLs are canonical and may not share the listing path's prefix
      // (e.g. TYPO3 emits /news/<slug> in the sitemap while the listing is /nachrichten),
      // and WordPress sites with root-permalinks publish at / regardless of the
      // /category/X listing path used for discovery.
      const skipOffPathFilter =
        contentPath.disableOffPathFilter === true ||
        (contentPath.sitemapUrls !== undefined && contentPath.sitemapUrls.length > 0) ||
        contentPath.wpApi !== undefined;

      if (!skipOffPathFilter && contentPath.path && contentPath.path !== '/') {
        const before = articleLinks.length;
        articleLinks = articleLinks.filter((url) => {
          try {
            const urlPath = new URL(url).pathname;
            const contentPathNorm = contentPath.path.replace(/\/$/, '');
            return urlPath.startsWith(contentPathNorm);
          } catch {
            return true; // Keep if URL parsing fails
          }
        });
        if (articleLinks.length < before) {
          this.log(
            `Filtered ${before - articleLinks.length} off-path links (kept ${articleLinks.length})`
          );
        }
      }

      this.log(`Found ${articleLinks.length} article links`);

      const toProcess = maxDocuments ? articleLinks.slice(0, maxDocuments) : articleLinks;

      // Dry run: check Qdrant for existing articles, report counts, skip processing
      if (dryRun) {
        let newCount = 0;
        let existingCount = 0;
        for (const url of toProcess) {
          const points = await scrollDocuments(
            this.qdrantClient,
            targetCollection,
            { must: [{ key: 'source_url', match: { value: url } }] },
            { limit: 1, withPayload: false, withVector: false }
          );
          if (points.length > 0) {
            existingCount++;
          } else {
            newCount++;
          }
        }
        result.stored = newCount;
        result.skipped = existingCount;
        this.log(`[DRY RUN] ${newCount} new articles, ${existingCount} already stored`);
        return result;
      }

      // Process discovered articles with bounded concurrency (see ARTICLE_CONCURRENCY).
      // Counters mutate from each task — safe under Node's single thread, where the
      // synchronous increments between awaits never interleave. `processed` is the
      // dispatch counter used only for progress logging.
      let processed = 0;
      const tasks = toProcess.map((url) => async (): Promise<void> => {
        const n = ++processed;
        try {
          if (!forceUpdate && isFreshlyIndexed(await this.#storedPayload(url, targetCollection))) {
            result.skipped++;
            return;
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
            else {
              result.stored++;
              result.newArticles.push({ title: content.title || url, url, type: contentPath.type });
            }
            result.totalVectors += storeResult.vectors || 0;
            this.log(`✓ [${n}/${toProcess.length}] ${content.title?.substring(0, 60) || url}`);
          } else {
            result.skipped++;
            result.skipReasons[storeResult.reason || 'unknown'] =
              (result.skipReasons[storeResult.reason || 'unknown'] || 0) + 1;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          // A link the listing still advertises but the host refuses to serve is
          // upstream's stale index, not a failure of this run. Counting it apart
          // keeps `errors` meaning "something broke"; foldDeadLinksIfNothingWorked
          // takes it back if the whole source came up empty. Deliberately only
          // here, on HTML articles: a Beschluss PDF that vanishes from its own
          // archive page is worth a red number, and no such case was measured.
          if (error instanceof HttpStatusError && isGoneStatus(error.status)) {
            console.warn(`[Landesverband] ⚠ Dead link in ${source.id}: ${url} (${errorMessage})`);
            result.deadLinks++;
            addDeadLinkSamples(result, `${url}: ${errorMessage}`);
            return;
          }
          console.error(`[Landesverband] ✗ Error in ${source.id} (${url}): ${errorMessage}`);
          result.errors++;
          addErrorSamples(result, `${url}: ${errorMessage}`);
        }
      });
      await parallelLimit(tasks, ARTICLE_CONCURRENCY);
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
      errorMessages: [],
      deadLinks: 0,
      deadLinkMessages: [],
      totalVectors: 0,
      skipReasons: {},
      contentTypes: {},
      newArticles: [],
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
      addErrorSamples(result, ...pathResult.errorMessages);
      result.deadLinks += pathResult.deadLinks;
      addDeadLinkSamples(result, ...pathResult.deadLinkMessages);
      result.totalVectors += pathResult.totalVectors;
      mergeSkipReasons(result, pathResult.skipReasons);
      // Accumulate into the per-type bucket: a source can have several paths of the
      // same content type (e.g. multiple `beschluss` PDF archives + Wolke shares),
      // so overwriting would report only the last path's counts for that type.
      const existing = result.contentTypes[contentPath.type];
      if (existing) {
        existing.stored += pathResult.stored;
        existing.updated += pathResult.updated;
        existing.skipped += pathResult.skipped;
        existing.errors += pathResult.errors;
        addErrorSamples(existing, ...pathResult.errorMessages);
        existing.deadLinks += pathResult.deadLinks;
        addDeadLinkSamples(existing, ...pathResult.deadLinkMessages);
        existing.totalVectors += pathResult.totalVectors;
        existing.newArticles.push(...pathResult.newArticles);
        mergeSkipReasons(existing, pathResult.skipReasons);
      } else {
        result.contentTypes[contentPath.type] = pathResult;
      }
      result.newArticles.push(...pathResult.newArticles);
    }

    foldDeadLinksIfNothingWorked(result, this.log.bind(this));

    // Enforce the age cap on already-stored documents, not just at ingestion.
    // Skipped on dry runs so a preview never mutates the index.
    if (!options.dryRun) {
      const liveCollection = source.qdrantCollection || this.config.collectionName;
      const archived = await this.#archiveStaleDocuments(source, liveCollection);
      if (archived > 0) {
        this.log(
          `Archived ${archived} stored point(s) older than ${source.maxAgeYears}y for ${source.name}`
        );
      }
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

    let sources = LANDESVERBAENDE_CONFIG.sources;

    if (sourceType) {
      sources = getSourcesByType(sourceType as SourceType);
    }

    if (landesverband) {
      sources = getSourcesByLandesverband(landesverband);
    }

    // An explicit LV filter that matches nothing is a configuration fault, not
    // an empty workload: either the code is wrong, or — the case that actually
    // happened — the running build predates the config that introduced it.
    // Saarland sat in the hourly matrix for ten days after `saarland-lv` was
    // merged, matched zero sources on the deployed backend, and reported
    // "stored 0, errors 0" every hour. That reads as success, so no email ever
    // went out. Flagged here rather than in the caller so both the CLI and the
    // internal sync route inherit it. Checked BEFORE the dormant/disabled
    // filtering below, which zeroes sources out for legitimate reasons.
    const lvFilterMatchedNothing = Boolean(landesverband) && sources.length === 0;

    // Skip sources for a Landesverband whose notebook is turned off
    // (`enabled: false`) — derived from the same single switch, so no separate
    // `dormant` flag is needed to stop scheduled scraping. Direct
    // `scrapeSource(id)` calls bypass this, so the data can still be re-scraped.
    const disabledLvCodes = getDisabledLandesverbandShortNames();
    const dormantSources = sources.filter((s) => s.dormant);
    const disabledLvSources = sources.filter((s) => !s.dormant && disabledLvCodes.has(s.shortName));
    sources = sources.filter((s) => !s.dormant && !disabledLvCodes.has(s.shortName));

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║       Landesverbaende Scraper - Full Crawl                ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    this.log(`Sources to process: ${sources.length}`);
    if (dormantSources.length > 0) {
      this.log(`Dormant sources skipped: ${dormantSources.map((s) => s.id).join(', ')}`);
    }
    if (disabledLvSources.length > 0) {
      this.log(`Disabled-LV sources skipped: ${disabledLvSources.map((s) => s.id).join(', ')}`);
    }
    if (sourceType) this.log(`Filter by type: ${sourceType}`);
    if (landesverband) this.log(`Filter by LV: ${landesverband}`);
    if (contentType) this.log(`Filter by content: ${contentType}`);

    const totalResult: LandesverbandFullResult = {
      sourcesProcessed: 0,
      stored: 0,
      updated: 0,
      skipped: 0,
      // Counted as a hard error so the caller's "did anything happen?" gate
      // (`stored + updated + errors > 0`) fires and someone actually gets told.
      errors: lvFilterMatchedNothing ? 1 : 0,
      errorMessages: lvFilterMatchedNothing
        ? [`Kein Quelleintrag für landesverband="${landesverband}" in diesem Build`]
        : [],
      deadLinks: 0,
      deadLinkMessages: [],
      totalVectors: 0,
      skipReasons: {},
      bySource: {},
      duration: 0,
    };

    if (lvFilterMatchedNothing) {
      const known = [...new Set(LANDESVERBAENDE_CONFIG.sources.map((s) => s.shortName))]
        .sort()
        .join(', ');
      console.error(
        `[Landesverband] No source configured for landesverband="${landesverband}". ` +
          `Known codes in this build: ${known}. ` +
          `If the code is right, this build predates the config that added it — redeploy.`
      );
    }

    const LV_CONCURRENCY = 4;
    this.log(`Concurrency: ${LV_CONCURRENCY} states in parallel`);

    interface LvOutcome {
      sourceId: string;
      result: SourceResult | null;
      error: string | null;
    }

    const tasks: (() => Promise<LvOutcome>)[] = sources.map(
      (source: { id: string }) => async (): Promise<LvOutcome> => {
        try {
          const sourceResult = await this.scrapeSource(source.id, { ...options, contentType });
          return { sourceId: source.id, result: sourceResult, error: null };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[Landesverband] Failed to scrape ${source.id}: ${errorMessage}`);
          return { sourceId: source.id, result: null, error: errorMessage };
        }
      }
    );

    const outcomes = await parallelLimit(tasks, LV_CONCURRENCY);

    for (const outcome of outcomes) {
      if (outcome.result) {
        totalResult.sourcesProcessed++;
        totalResult.stored += outcome.result.stored;
        totalResult.updated += outcome.result.updated;
        totalResult.skipped += outcome.result.skipped;
        totalResult.errors += outcome.result.errors;
        addErrorSamples(totalResult, ...outcome.result.errorMessages);
        totalResult.deadLinks += outcome.result.deadLinks;
        addDeadLinkSamples(totalResult, ...outcome.result.deadLinkMessages);
        totalResult.totalVectors += outcome.result.totalVectors;
        mergeSkipReasons(totalResult, outcome.result.skipReasons);
        totalResult.bySource[outcome.sourceId] = outcome.result;
      } else {
        totalResult.errors++;
        addErrorSamples(totalResult, `${outcome.sourceId}: ${outcome.error ?? 'Unknown error'}`);
      }
    }

    // Send per-LV email notifications for sources with new articles.
    // Falls back to the admin CONTENT_SYNC_EMAIL when a source has no
    // dedicated LV contact, so every Landesverband is covered until
    // per-LV recipients are configured.
    const syncDate = new Date().toISOString();
    for (const outcome of outcomes) {
      if (!outcome.result || outcome.result.stored === 0) continue;
      const source = sources.find((s: { id: string }) => s.id === outcome.sourceId);
      const notificationEmail = source?.notificationEmail ?? env.CONTENT_SYNC_EMAIL;
      if (!source || !notificationEmail) continue;

      try {
        await sendLvSyncNotificationEmail(notificationEmail, {
          lvName: source.name,
          newArticles: outcome.result.newArticles,
          syncDate,
        });
        this.log(`Email sent to ${notificationEmail} for ${source.name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Landesverband] Email notification failed for ${source.name}: ${msg}`);
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
  async searchDocuments(query: string, options: LandesverbandSearchOptions = {}): Promise<unknown> {
    return this.searchOps.searchDocuments(query, options);
  }

  /**
   * Get stats (delegates to SearchOperations)
   */
  async getStats(): Promise<unknown> {
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
  getSources(): Record<string, unknown>[] {
    return LANDESVERBAENDE_CONFIG.sources.map((s) => ({
      id: s.id,
      name: s.name,
      shortName: s.shortName,
      type: s.type,
      baseUrl: s.baseUrl,
      cms: s.cms,
      contentTypes: s.contentPaths.map((cp) => cp.type),
    }));
  }

  /**
   * Ingest a single PDF by URL with explicit metadata.
   * For manual ingestion of PDFs that automated scraping can't date-extract.
   */
  async ingestPdf(
    sourceId: string,
    pdfUrl: string,
    title: string,
    publishedAt: string,
    options: { forceUpdate?: boolean; collection?: string } = {}
  ): Promise<ProcessResult> {
    const source = getSourceById(sourceId);
    if (!source) throw new Error(`Source ${sourceId} not found`);

    const targetCollection =
      options.collection || source.qdrantCollection || this.config.collectionName;

    // Check if already stored
    if (!options.forceUpdate) {
      const existing = await scrollDocuments(
        this.qdrantClient,
        targetCollection,
        { must: [{ key: 'source_url', match: { value: pdfUrl } }] },
        { limit: 1, withPayload: false, withVector: false }
      );
      if (existing.length > 0) {
        return { stored: false, reason: 'already_exists' };
      }
    }

    // Download
    const response = await this.#fetchUrl(pdfUrl);
    const buffer = Buffer.from(await response.arrayBuffer());

    // OCR
    const filename = pdfUrl.split('/').pop() || 'document.pdf';
    const tempPath = path.join(os.tmpdir(), `lv_manual_${Date.now()}_${filename}`);
    let text = '';

    try {
      await fs.writeFile(tempPath, buffer);
      const ocrResult = await ocrService.extractTextFromDocument(tempPath);
      text = ocrResult.text || '';
      recordExtraction({
        method: ocrResult.extractionMethod || ocrResult.method,
        pages: ocrResult.pageCount,
      });
    } finally {
      try {
        await fs.unlink(tempPath);
      } catch {
        /* ignore */
      }
    }

    // Store
    return this.documentProcessor.processAndStoreDocument(
      source,
      'beschluss',
      pdfUrl,
      { title, text, publishedAt, categories: [] },
      targetCollection,
      source.maxAgeYears
    );
  }

  // ────────────────────────────────────────────────────────────
  // HELPER METHODS (URL handling, retry logic, point ID generation)
  // ────────────────────────────────────────────────────────────

  /**
   * Fetch URL with retry logic and timeout
   */
  async #fetchUrl(
    url: string,
    options: { headers?: Record<string, string>; acceptStatus?: number[] } = {}
  ): Promise<Response> {
    return this.fetchWithRetry(url, {
      timeout: this.timeout,
      maxRetries: this.maxRetries,
      userAgent: this.userAgent,
      ...options,
    });
  }

  /**
   * Normalize relative URLs to absolute
   */
  #normalizeUrl(url: string | undefined, baseUrl: string): string | null {
    if (!url) return null;
    let absolute: string;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      absolute = url;
    } else if (url.startsWith('//')) {
      absolute = 'https:' + url;
    } else if (url.startsWith('/')) {
      absolute = baseUrl + url;
    } else {
      absolute = baseUrl + '/' + url;
    }
    // Canonicalize: strip fragment and cache-busting params (preserve trailing slashes to match existing Qdrant data)
    try {
      const parsed = new URL(absolute);
      parsed.hash = '';
      parsed.searchParams.delete('tmstv');
      const search = parsed.searchParams.toString();
      return parsed.origin + parsed.pathname + (search ? '?' + search : '');
    } catch {
      return absolute;
    }
  }

  /**
   * Check if URL should be excluded based on patterns
   */
  #shouldExcludeUrl(url: string, excludePatterns?: string[]): boolean {
    if (!url || !excludePatterns) return false;
    return excludePatterns.some((pattern) => url.includes(pattern));
  }

  /**
   * Payload of one already-stored chunk for this URL, or null when the URL has
   * never been indexed. Read once per document and handed to both the freshness
   * gate and the file-fingerprint gate, so a re-check still costs one scroll.
   */
  async #storedPayload(
    url: string,
    targetCollection: string
  ): Promise<Record<string, unknown> | null> {
    const points = await scrollDocuments(
      this.qdrantClient,
      targetCollection,
      { must: [{ key: 'source_url', match: { value: url } }] },
      { limit: 1, withPayload: true, withVector: false }
    );
    return points.length > 0 ? points[0].payload : null;
  }

  /**
   * Enforce the source's age cap on documents that are ALREADY stored by moving
   * them to the cold archive collection instead of deleting them.
   *
   * The DocumentProcessor age filter only rejects new content at ingestion.
   * Documents indexed before a source's window was tightened linger forever:
   * isFreshlyIndexed never re-fetches settled history (published > 2y ago) and
   * dedup only ever touches URLs that are re-encountered. Sachsen-Anhalt, for
   * example, was scraped under the 10-year default before its 5-year cap was
   * set, so 2016–2020 documents stayed in the live collection and surfaced in
   * the notebook.
   *
   * Stale points (published_at older than maxAgeYears) are copied — vectors and
   * payload intact — into LANDESVERBAENDE_ARCHIVE_COLLECTION, then deleted from
   * the live collection. Notebooks/agents only ever query the live collection,
   * so the cap is enforced there structurally (no per-query filter to forget),
   * while historical/research functions can still query the archive explicitly.
   *
   * Undated points are kept in the live collection — consistent with the
   * ingestion filter (DocumentProcessor STEP 2), which only rejects dated
   * content. Sources without a configured cap are left untouched. The copy uses
   * the same deterministic point ids, so the move is idempotent: a re-run
   * re-archives the same ids (overwriting in the archive) before deleting. We
   * archive a batch before deleting it, so a mid-run failure never loses data —
   * worst case a point is duplicated into the archive and re-deleted next run.
   *
   * @returns number of points moved to the archive
   */
  async #archiveStaleDocuments(
    source: LandesverbandSource,
    liveCollection: string
  ): Promise<number> {
    if (source.maxAgeYears == null) return 0;
    const ageLimit = source.maxAgeYears;

    const staleIds: (string | number)[] = [];
    let offset: string | number | Record<string, unknown> | undefined;

    try {
      // Phase 1: cheap payload-only scroll to find stale point ids.
      do {
        const page = await this.qdrantClient.scroll(liveCollection, {
          filter: { must: [{ key: 'source_id', match: { value: source.id } }] },
          with_payload: { include: ['published_at'] },
          with_vector: false,
          limit: 256,
          ...(offset !== undefined ? { offset } : {}),
        });

        for (const point of page.points) {
          const publishedAt = (point.payload as { published_at?: string } | null)?.published_at;
          if (!publishedAt) continue; // undated content is kept, mirroring ingestion
          const pubDate = new Date(publishedAt);
          if (Number.isNaN(pubDate.getTime())) continue;
          if (DateExtractor.isDateTooOld(pubDate, ageLimit)) {
            staleIds.push(point.id);
          }
        }

        offset = page.next_page_offset ?? undefined;
      } while (offset !== undefined);

      if (staleIds.length === 0) return 0;

      // Phase 2: per batch, fetch the full points (with vectors), copy them into
      // the archive, then delete them from the live collection.
      const archivedAt = new Date().toISOString();
      const batchSize = 128;
      let archived = 0;

      for (let i = 0; i < staleIds.length; i += batchSize) {
        const idBatch = staleIds.slice(i, i + batchSize);
        const records = await this.qdrantClient.retrieve(liveCollection, {
          ids: idBatch,
          with_payload: true,
          with_vector: true,
        });

        // Single unnamed vector per point; skip anything without a usable vector
        // so we never archive (and then delete) an unrecoverable point.
        const archivePoints = records
          .filter((r) => Array.isArray(r.vector))
          .map((r) => ({
            id: r.id,
            vector: r.vector as number[],
            payload: {
              ...((r.payload as Record<string, unknown>) || {}),
              archived_at: archivedAt,
              archived_from: liveCollection,
            },
          }));

        if (archivePoints.length === 0) continue;

        await this.qdrantClient.upsert(LANDESVERBAENDE_ARCHIVE_COLLECTION, {
          wait: true,
          points: archivePoints,
        });
        await this.qdrantClient.delete(liveCollection, {
          wait: true,
          points: archivePoints.map((p) => p.id),
        });
        archived += archivePoints.length;
      }

      return archived;
    } catch (error) {
      // Best-effort maintenance — never fail a scrape over it. Because we delete
      // only after a successful archive upsert, a failure here leaves the live
      // collection untouched for the un-processed remainder; the next run retries.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Landesverband] Archive prune failed for ${source.id}: ${message}`);
      return 0;
    }
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

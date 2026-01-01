/**
 * Satzungen Scraper
 * Scrapes German Green Party bylaws (Satzungen) from NRW organizations
 * Supports both PDF (with Mistral OCR) and HTML sources
 */

import * as cheerio from 'cheerio';
import { BaseScraper } from '../base/BaseScraper.js';
import type { ScraperResult } from '../types.js';
import { smartChunkDocument } from '../../../utils/textChunker.js';
import { fastEmbedService } from '../../FastEmbedService.js';
import { getQdrantInstance } from '../../../database/services/QdrantService/index.js';
import { scrollDocuments, batchUpsert, batchDelete, getCollectionStats } from '../../../database/services/QdrantService/operations/batchOperations.js';
import { BRAND } from '../../../utils/domainUtils.js';
import { generatePointId } from '../../../utils/hashUtils.js';
import { ocrService } from '../../OcrService/index.js';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Satzung source definition
 */
export interface SatzungSource {
  url: string;
  city: string;
  gremium: 'Kreisverband' | 'Ortsverband';
  format: 'pdf' | 'html';
}

/**
 * Crawl options
 */
export interface SatzungenCrawlOptions {
  /** Force update even if content hasn't changed */
  forceUpdate?: boolean;
  /** Maximum number of documents to process */
  maxDocuments?: number | null;
}

/**
 * Process result
 */
interface ProcessResult {
  stored: boolean;
  reason?: string;
  chunks?: number;
  vectors?: number;
  updated?: boolean;
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
export interface SatzungenCrawlResult {
  totalSources: number;
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
 * Search options
 */
export interface SatzungenSearchOptions {
  gremium?: 'Kreisverband' | 'Ortsverband' | null;
  city?: string | null;
  limit?: number;
  threshold?: number;
}

/**
 * Document search result
 */
export interface SatzungSearchResult {
  id: string;
  score: number;
  title: string;
  gremium: string;
  city: string;
  landesverband: string;
  source_url: string;
  matchedChunk: string;
}

/**
 * Existing document check result
 */
interface ExistingDocument {
  content_hash: string;
  indexed_at: string;
}

/**
 * Comprehensive list of Satzungen sources (72 total)
 */
const SATZUNGEN_SOURCES: readonly SatzungSource[] = [
  // PDF Sources - Kreisverbände
  { url: 'https://www.gruene-bielefeld.de/wp-content/uploads/2024/03/Satzung.pdf', city: 'Bielefeld', gremium: 'Kreisverband', format: 'pdf' },
  { url: 'https://gruene-bochum.de/wp-content/uploads/2023/10/Satzung-Gruene-Bochum-2023_neu.pdf', city: 'Bochum', gremium: 'Kreisverband', format: 'pdf' },
  { url: 'https://gruene-bonn.de/partei/wp-content/uploads/sites/3/2020/06/Satzung_GRUENE-Bonn.pdf', city: 'Bonn', gremium: 'Kreisverband', format: 'pdf' },
  {
    url: 'https://www.gruene-dortmund.de/assets/ov-aplerbeck/assets/downloads/Satzung_KV_Dortmund___nach___nderung_JHV_2024__1.pdf',
    city: 'Dortmund',
    gremium: 'Kreisverband',
    format: 'pdf',
  },
  { url: 'https://gruene-duisburg.de/wp-content/uploads/2025/03/Satzung-Stand-Mai-2024-1.pdf', city: 'Duisburg', gremium: 'Kreisverband', format: 'pdf' },
  { url: 'https://gruene-dueren.de/files/2019/11/Satzung-KV-D%C3%BCren-laut-KMV-21.09.2018-1.pdf', city: 'Düren', gremium: 'Kreisverband', format: 'pdf' },
  { url: 'https://www.gruene-duesseldorf.de/wp-content/uploads/2025/04/20250128_Satzung.pdf', city: 'Düsseldorf', gremium: 'Kreisverband', format: 'pdf' },
  { url: 'https://gruene-essen.de/kreisverband/wp-content/uploads/sites/2/2023/01/SatzungKVEssen2012.pdf', city: 'Essen', gremium: 'Kreisverband', format: 'pdf' },
  { url: 'https://www.gruene-gelsenkirchen.de/wp-content/uploads/2019/12/Satzung.pdf', city: 'Gelsenkirchen', gremium: 'Kreisverband', format: 'pdf' },
  { url: 'https://www.gruene-kreisgt.de/wp-content/uploads/2022/03/Satzung-KV-Guetersloh-26.03.2022-2.pdf', city: 'Gütersloh', gremium: 'Kreisverband', format: 'pdf' },
  { url: 'https://gruene-herne.de/wp-content/uploads/2020/05/Satzung-und-GO_20201905.pdf', city: 'Herne', gremium: 'Kreisverband', format: 'pdf' },
  { url: 'https://gruene-hoexter.de/userspace/NW/kv_hoexter/Dokumente/Satzung_Beschluss_2014.pdf', city: 'Höxter', gremium: 'Kreisverband', format: 'pdf' },
  { url: 'https://www.gruenekoeln.de/fileadmin/user_upload/GR%C3%9CNE_K%C3%B6ln_-_Satzung__25.03.2023_.pdf', city: 'Köln', gremium: 'Kreisverband', format: 'pdf' },
  { url: 'https://gruene-muenster.de/wp-content/uploads/2025/07/2025-07-Satzung.pdf', city: 'Münster', gremium: 'Kreisverband', format: 'pdf' },
  { url: 'https://gruene-oberberg.de/wp-content/uploads/2023/09/2023.03.24_Satzung-KV-Oberberg.pdf', city: 'Oberberg', gremium: 'Kreisverband', format: 'pdf' },
  { url: 'https://gruene-oberhausen.de/userspace/NW/kv_oberhausen/Dokumente/Texte/Satzung_Stand_September_2025.pdf', city: 'Oberhausen', gremium: 'Kreisverband', format: 'pdf' },
  { url: 'https://www.gruene-rkn.de/wp-content/uploads/2023/11/Satzung-KV-RKN.pdf', city: 'Rhein-Kreis Neuss', gremium: 'Kreisverband', format: 'pdf' },
  { url: 'https://gruene-rhein-sieg.de/wp-content/uploads/2025/11/Satzung_KVRSK_25neu.pdf', city: 'Rhein-Sieg', gremium: 'Kreisverband', format: 'pdf' },
  {
    url: 'https://gruene-rbk.de/userspace/NW/kv_rheinberg/Typo3/Kreisverband/Satzung/Satzung_Kreisverband_RBK_Stand__31_08_2024.pdf',
    city: 'Rheinisch-Bergischer Kreis',
    gremium: 'Kreisverband',
    format: 'pdf',
  },
  { url: 'https://www.gruene-kreis-steinfurt.de/userspace/NW/kv_steinfurt/Dokumente/Neue_Satzung_KV_Steinfurt_-_01.10.2020.pdf', city: 'Steinfurt', gremium: 'Kreisverband', format: 'pdf' },
  { url: 'https://gruene-kreis-warendorf.de/userspace/NW/kv_warendorf/Satzung/20201110_Satzung_KV_Warendorf.pdf', city: 'Warendorf', gremium: 'Kreisverband', format: 'pdf' },
  { url: 'https://gruene-kvwuppertal.de/userspace/NW/kv_wuppertal/Dokumente/Satzung_01.02.24.pdf', city: 'Wuppertal', gremium: 'Kreisverband', format: 'pdf' },

  // PDF Sources - Ortsverbände
  { url: 'https://www.gruenekoeln.de/fileadmin/user_upload/Satzung_OV_1.pdf', city: 'Köln Innenstadt/Deutz', gremium: 'Ortsverband', format: 'pdf' },
  { url: 'https://www.gruenekoeln.de/fileadmin/KV/Kreisverband/Veedel/OV2/OV2_-_Satzung_AKTUELL__ab_2022_.pdf', city: 'Köln Rodenkirchen', gremium: 'Ortsverband', format: 'pdf' },
  { url: 'https://www.gruenekoeln.de/fileadmin/KV/Kreisverband/Veedel/OV5/SatzungOV5.pdf', city: 'Köln Nippes', gremium: 'Ortsverband', format: 'pdf' },
  { url: 'https://www.gruenekoeln.de/fileadmin/user_upload/Satzung_Gruene_OV_Chorweiler_Endversion_2021.pdf', city: 'Köln Chorweiler', gremium: 'Ortsverband', format: 'pdf' },
  { url: 'https://gruene-kleve.de/wp-content/uploads/2023/08/2023-08-22_Satzung_Gruener-OV-Kleve.pdf', city: 'Kleve', gremium: 'Ortsverband', format: 'pdf' },
  { url: 'https://gruene-unna.de/wp-content/uploads/2025/09/satzung.pdf', city: 'Unna', gremium: 'Ortsverband', format: 'pdf' },
  { url: 'https://www.gruene-wesel.de/wp-content/uploads/2025/05/Satzung_Stand-21.05.2025.pdf', city: 'Wesel', gremium: 'Ortsverband', format: 'pdf' },
  { url: 'https://gruene-recklinghausen.de/wp-content/uploads/sites/261/2024/03/SatzungOVRecklinghausen.pdf', city: 'Recklinghausen', gremium: 'Ortsverband', format: 'pdf' },

  // HTML Sources - Kreisverbände
  { url: 'https://www.gruene-region-aachen.de/service/satzung', city: 'Aachen', gremium: 'Kreisverband', format: 'html' },
  { url: 'https://gruene-kreis-borken.de/satzung-buendnis-90-die-gruenen-kreisverband-borken/', city: 'Borken', gremium: 'Kreisverband', format: 'html' },
  { url: 'https://www.gruene-euskirchen.de/kreisverband/satzung/', city: 'Euskirchen', gremium: 'Kreisverband', format: 'html' },
  { url: 'https://www.gruene-hamm.de/satzung/', city: 'Hamm', gremium: 'Kreisverband', format: 'html' },
  { url: 'https://gruene-kreis-heinsberg.de/satzung-des-kreisverbandes-heinsberg/', city: 'Heinsberg', gremium: 'Kreisverband', format: 'html' },
  { url: 'https://gruene-kreis-herford.de/satzung-von-buendnis-90-die-gruenen-kreisverband-herford/', city: 'Herford', gremium: 'Kreisverband', format: 'html' },
  { url: 'https://gruene-hochsauerland.de/satzung-des-kreisverbandes/', city: 'Hochsauerlandkreis', gremium: 'Kreisverband', format: 'html' },
  { url: 'https://www.gruene-krefeld.de/satzung-kv/', city: 'Krefeld', gremium: 'Kreisverband', format: 'html' },
  { url: 'https://gruene-lev.de/satzung/', city: 'Leverkusen', gremium: 'Kreisverband', format: 'html' },
  { url: 'https://gruene-lippe.de/kreisverband/satzung-und-ordnungen/satzung-kv-lippe/', city: 'Lippe', gremium: 'Kreisverband', format: 'html' },
  { url: 'https://www.gruene-mk.de/kreisverband/satzung/', city: 'Märkischer Kreis', gremium: 'Kreisverband', format: 'html' },
  { url: 'https://xn--grne-milk-r9a.de/satzung-des-kv-milk/', city: 'Minden-Lübbecke', gremium: 'Kreisverband', format: 'html' },
  { url: 'https://gruene-mg.net/satzung-buendnis-90-die-gruenen-kreisverband-moenchengladbach', city: 'Mönchengladbach', gremium: 'Kreisverband', format: 'html' },
  { url: 'https://gruene-mh.de/satzung/', city: 'Mülheim', gremium: 'Kreisverband', format: 'html' },
  { url: 'https://www.padergruen.de/kreisverband/satzung-kreisverband/', city: 'Paderborn', gremium: 'Kreisverband', format: 'html' },
  { url: 'https://gruene-recklinghausen.de/satzung-und-dokumente/', city: 'Recklinghausen', gremium: 'Kreisverband', format: 'html' },
  { url: 'https://gruene-remscheid.de/partei-der-kreisverband/satzung', city: 'Remscheid', gremium: 'Kreisverband', format: 'html' },
  { url: 'https://www.gruene-siegen-wittgenstein.de/ueber-uns/satzung/', city: 'Siegen-Wittgenstein', gremium: 'Kreisverband', format: 'html' },
  { url: 'https://gruene-solingen.de/partei/satzung', city: 'Solingen', gremium: 'Kreisverband', format: 'html' },
  { url: 'https://www.gruene-viersen.de/satzung/', city: 'Viersen', gremium: 'Kreisverband', format: 'html' },

  // HTML Sources - Ortsverbände
  { url: 'https://www.gruenekoeln.de/veedel/lindenthal/satzung', city: 'Köln Lindenthal', gremium: 'Ortsverband', format: 'html' },
  { url: 'https://gruene-muenster-nord.de/satzung/', city: 'Münster Nord', gremium: 'Ortsverband', format: 'html' },
  { url: 'https://gruene-muenster-west.de/?page_id=136', city: 'Münster West', gremium: 'Ortsverband', format: 'html' },
  { url: 'https://www.gruene-hiltrup.de/ortsverband-hiltrup/satzung/', city: 'Münster Hiltrup', gremium: 'Ortsverband', format: 'html' },
] as const;

/**
 * Satzungen scraper for NRW Green Party organizations
 */
export class SatzungenScraper extends BaseScraper {
  private landesverband: string;
  private qdrant: any;
  private mistralClient: any;
  private crawlDelay: number;
  private batchSize: number;
  private timeout: number;
  private maxRetries: number;
  private userAgent: string;

  constructor() {
    super({
      collectionName: 'satzungen_documents',
      verbose: true,
    });

    this.landesverband = 'NRW';
    this.qdrant = null;
    this.mistralClient = null;
    this.crawlDelay = 2000;
    this.batchSize = 10;
    this.timeout = 60000;
    this.maxRetries = 3;
    this.userAgent = BRAND?.botUserAgent || 'Gruenerator-Bot/1.0';
  }

  /**
   * Initialize services
   */
  async init(): Promise<void> {
    this.qdrant = getQdrantInstance();
    await this.qdrant.init();
    await fastEmbedService.init();

    // Import Mistral client dynamically
    const mod = await import('../../../workers/mistralClient.js');
    this.mistralClient = (mod as any).default || mod;

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
   * Fetch URL with retry logic
   */
  async #fetchUrl(url: string): Promise<Response> {
    return this.fetchWithRetry(url, {
      timeout: this.timeout,
      maxRetries: this.maxRetries,
      userAgent: this.userAgent,
      headers: { Accept: '*/*' },
    });
  }


  /**
   * Extract content from HTML
   */
  #extractContentFromHtml(html: string, url: string): { title: string; text: string } {
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $('script, style, noscript, iframe, nav, header, footer').remove();
    $('.navigation, .sidebar, .cookie-banner, .cookie-notice, .popup, .modal').remove();
    $('[role="navigation"], [role="banner"], [role="contentinfo"]').remove();
    $('.breadcrumb, .breadcrumb-nav, [aria-label*="Breadcrumb"]').remove();
    $('.social-share, .share-buttons, .related-content').remove();

    const title =
      $('meta[property="og:title"]').attr('content') || $('h1.page-title').first().text().trim() || $('h1').first().text().trim() || $('title').text().trim() || '';

    // Content selectors (satzung-specific)
    const contentSelectors = [
      '.satzung',
      '.satzung-content',
      '.entry-content',
      '.field--name-body',
      '.node__content',
      'article .content',
      '.article-content',
      '.main-content',
      'main article',
      '.text-content',
      '[role="main"]',
      '.page-content',
      '.content-area',
      'article',
      'main',
    ];

    let contentText = '';
    for (const selector of contentSelectors) {
      const el = $(selector);
      if (el.length && el.text().trim().length > 200) {
        contentText = el.text();
        break;
      }
    }

    // Fallback to main or body
    if (!contentText || contentText.trim().length < 200) {
      contentText = $('main').text() || $('body').text();
    }

    contentText = contentText.replace(/\s+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

    return { title, text: contentText };
  }

  /**
   * Check if document exists in Qdrant
   */
  async #documentExists(url: string): Promise<ExistingDocument | null> {
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
   * Delete document from Qdrant
   */
  async #deleteDocument(url: string): Promise<void> {
    await batchDelete(
      this.qdrant.client,
      this.config.collectionName,
      {
        must: [{ key: 'source_url', match: { value: url } }],
      }
    );
  }


  /**
   * Process and store document
   */
  async #processAndStoreDocument(source: SatzungSource, text: string, title: string | null): Promise<ProcessResult> {
    if (!text || text.length < 100) {
      return { stored: false, reason: 'too_short' };
    }

    const contentHash = this.generateHash(text);

    const existing = await this.#documentExists(source.url);
    if (existing && existing.content_hash === contentHash) {
      return { stored: false, reason: 'unchanged' };
    }

    if (existing) {
      await this.#deleteDocument(source.url);
    }

    const documentTitle = title || `Satzung ${source.gremium} ${source.city}`;

    const chunks = await smartChunkDocument(text, {
      baseMetadata: {
        title: documentTitle,
        source: 'satzungen_gruene',
        source_url: source.url,
      },
    });

    if (chunks.length === 0) {
      return { stored: false, reason: 'no_chunks' };
    }

    const chunkTexts = chunks.map((c: any) => c.text || c.chunk_text);
    const embeddings = await fastEmbedService.generateBatchEmbeddings(chunkTexts);

    const points = chunks.map((chunk, index) => ({
      id: generatePointId('satzung', source.url, index),
      vector: embeddings[index],
      payload: {
        document_id: `satzung_${contentHash}`,
        source_url: source.url,
        content_hash: contentHash,
        chunk_index: index,
        chunk_text: chunkTexts[index],
        title: documentTitle,
        landesverband: this.landesverband,
        gremium: source.gremium,
        city: source.city,
        source: 'satzungen_gruene',
        indexed_at: new Date().toISOString(),
      },
    }));

    for (let i = 0; i < points.length; i += 10) {
      const batch = points.slice(i, i + 10);
      await batchUpsert(this.qdrant.client, this.config.collectionName, batch);
    }

    return { stored: true, chunks: chunks.length, vectors: points.length, updated: !!existing };
  }

  /**
   * Process PDF source using centralized OcrService
   */
  async #processPdfSource(source: SatzungSource): Promise<ProcessResult> {
    const response = await this.#fetchUrl(source.url);
    const arrayBuffer = await response.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    const filename = source.url.split('/').pop() || 'satzung.pdf';

    // Write PDF to temp file for OcrService
    const tempPath = path.join(os.tmpdir(), `satzung_${Date.now()}_${filename}`);
    let textResult;

    try {
      await fs.writeFile(tempPath, pdfBuffer);
      this.log(`Processing PDF with OcrService: ${filename}`);

      const result = await ocrService.extractTextWithMistralOCR(tempPath);
      textResult = result.text || '';

      this.log(`OcrService extracted ${textResult.length} chars from ${filename}`);
    } finally {
      // Clean up temp file
      try {
        await fs.unlink(tempPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    return this.#processAndStoreDocument(source, textResult, null);
  }

  /**
   * Process HTML source
   */
  async #processHtmlSource(source: SatzungSource): Promise<ProcessResult> {
    const response = await this.#fetchUrl(source.url);
    const html = await response.text();

    const { title, text } = this.#extractContentFromHtml(html, source.url);

    return this.#processAndStoreDocument(source, text, title);
  }

  /**
   * Full crawl of all satzungen sources
   */
  async fullCrawl(options: SatzungenCrawlOptions = {}): Promise<SatzungenCrawlResult> {
    const { forceUpdate = false, maxDocuments = null } = options;
    const startTime = Date.now();

    this.log('\n═══════════════════════════════════════');
    this.log('Starting full crawl');
    this.log(`Force update: ${forceUpdate}`);
    this.log(`Total sources: ${SATZUNGEN_SOURCES.length}`);
    if (maxDocuments) this.log(`Max documents: ${maxDocuments}`);
    this.log('═══════════════════════════════════════\n');

    const result: SatzungenCrawlResult = {
      totalSources: SATZUNGEN_SOURCES.length,
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

    const sourcesToProcess = maxDocuments ? (SATZUNGEN_SOURCES.slice(0, maxDocuments) as SatzungSource[]) : SATZUNGEN_SOURCES;

    for (let i = 0; i < sourcesToProcess.length; i++) {
      const source = sourcesToProcess[i];

      try {
        if (!forceUpdate) {
          const existing = await this.#documentExists(source.url);
          if (existing) {
            result.skipped++;
            result.skipReasons.unchanged.count++;
            this.log(`○ [${i + 1}/${sourcesToProcess.length}] Skipped (unchanged): ${source.city}`);
            continue;
          }
        }

        let processResult: ProcessResult;
        if (source.format === 'pdf') {
          processResult = await this.#processPdfSource(source);
        } else {
          processResult = await this.#processHtmlSource(source);
        }

        if (processResult.stored) {
          if (processResult.updated) {
            result.updated++;
          } else {
            result.stored++;
          }
          result.totalVectors += processResult.vectors || 0;
          this.log(`✓ [${i + 1}/${sourcesToProcess.length}] ${source.gremium} ${source.city} (${processResult.chunks} chunks)`);
        } else {
          result.skipped++;
          const reason = processResult.reason;
          if (reason && result.skipReasons[reason as keyof typeof result.skipReasons]) {
            const skipReason = result.skipReasons[reason as keyof typeof result.skipReasons];
            skipReason.count++;
            if (skipReason.examples.length < 5) {
              skipReason.examples.push(source.url);
            }
          }
          this.log(`○ [${i + 1}/${sourcesToProcess.length}] Skipped (${reason}): ${source.city}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Satzungen] ✗ Error ${source.city}: ${errorMessage}`);
        result.errors++;
        result.skipReasons.fetch_error.count++;
        if (result.skipReasons.fetch_error.examples.length < 5) {
          result.skipReasons.fetch_error.examples.push(source.url);
        }
      }

      await this.delay(this.crawlDelay);
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
      if (sr.fetch_error.count > 0) this.log(`  • Fetch errors: ${sr.fetch_error.count}`);
    }

    this.log('═══════════════════════════════════════');

    return result;
  }

  /**
   * Search documents by semantic query
   */
  async searchDocuments(query: string, options: SatzungenSearchOptions = {}): Promise<{ results: SatzungSearchResult[]; total: number }> {
    const { gremium = null, city = null, limit = 10, threshold = 0.35 } = options;

    const queryVector = await fastEmbedService.generateQueryEmbedding(query);

    const filter: any = { must: [] };
    if (gremium) {
      filter.must.push({ key: 'gremium', match: { value: gremium } });
    }
    if (city) {
      filter.must.push({ key: 'city', match: { value: city } });
    }

    const searchResult = await this.qdrant.client.search(this.config.collectionName, {
      vector: queryVector,
      filter: filter.must.length > 0 ? filter : undefined,
      limit: limit * 3,
      score_threshold: threshold,
      with_payload: true,
    });

    const documentsMap = new Map<string, SatzungSearchResult>();
    for (const hit of searchResult) {
      const docId = hit.payload.document_id;
      if (!documentsMap.has(docId)) {
        documentsMap.set(docId, {
          id: docId,
          score: hit.score,
          title: hit.payload.title,
          gremium: hit.payload.gremium,
          city: hit.payload.city,
          landesverband: hit.payload.landesverband,
          source_url: hit.payload.source_url,
          matchedChunk: hit.payload.chunk_text,
        });
      }

      if (documentsMap.size >= limit) break;
    }

    return {
      results: Array.from(documentsMap.values()),
      total: documentsMap.size,
    };
  }

  /**
   * Get collection statistics
   */
  async getStats(): Promise<any> {
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
      return { error: errorMessage };
    }
  }

  /**
   * Clear entire collection
   */
  async clearCollection(): Promise<void> {
    this.log('Clearing all documents...');
    try {
      const points = await scrollDocuments(
        this.qdrant.client,
        this.config.collectionName,
        undefined,
        {
          limit: 100,
          withPayload: false,
          withVector: false,
        }
      );

      if (points.length > 0) {
        const pointIds = points.map((p) => p.id);
        await this.qdrant.client.delete(this.config.collectionName, { points: pointIds });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Satzungen] Clear failed:', errorMessage);
    }
    this.log('Collection cleared');
  }
}

// Singleton instance for backward compatibility
export const satzungenScraperService = new SatzungenScraper();
export default satzungenScraperService;

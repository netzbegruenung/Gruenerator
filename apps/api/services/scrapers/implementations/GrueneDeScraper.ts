/**
 * Grüne Deutschland (gruene.de) Scraper
 *
 * Scrapes www.gruene.de — the German Green Party website.
 * Discovers content via sitemap.xml and stores in gruene_de_documents.
 *
 * gruene.de is a client-rendered Next.js app: article bodies are not present
 * as HTML but embedded in the React Flight payload of the initial document.
 * Extraction therefore goes through nextFlightExtractor instead of cheerio
 * content selectors; only <title> and meta description are SSR-rendered.
 *
 * Content types:
 *   - /artikel/*  → News articles and program announcements
 *   - /themen/*   → Policy position pages
 *   - /erfolge/*  → Achievement pages
 */

import { getQdrantInstance } from '../../../database/services/QdrantService/index.js';
import {
  scrollDocuments,
  batchUpsert,
  batchDelete,
} from '../../../database/services/QdrantService/operations/batchOperations.js';
import { BRAND } from '../../../utils/domainUtils.js';
import { generatePointId } from '../../../utils/validation/index.js';
import { chunkQualityService } from '../../ChunkQualityService/index.js';
import {
  smartChunkDocument,
  buildEmbeddingTextsForChunks,
  structurePayload,
} from '../../document-services/index.js';
import { mistralEmbeddingService } from '../../mistral/index.js';
import { BaseScraper } from '../base/BaseScraper.js';
import { recordSyncEvent, toExcerpt } from '../syncEventRecorder.js';
import { batchProcess } from '../utils/batchFetch.js';
import {
  extractFlightStream,
  extractFlightTexts,
  flightTextToPlain,
} from '../utils/nextFlightExtractor.js';

import type { QdrantService } from '../../../database/services/QdrantService/index.js';
import type { ScraperResult } from '../types.js';

interface SitemapEntry {
  url: string;
  contentType: string;
  lastmod: string | null;
}

interface ExtractedContent {
  title: string;
  description: string;
  text: string;
  publishedAt: string | null;
  contentType: string;
}

interface ProcessResult {
  stored: boolean;
  reason?: string;
  chunks?: number;
  vectors?: number;
  updated?: boolean;
}

interface SkipReason {
  count: number;
  examples: string[];
}

export interface GrueneDeCrawlResult {
  totalUrls: number;
  stored: number;
  updated: number;
  skipped: number;
  errors: number;
  /**
   * Capped sample of the messages behind `errors`. Without it the nightly run
   * reported the bare number (32, unchanged run after run) and the reason lived
   * only in the prod log — the CI report can render `errorSamples`, it just
   * never got any from this source. `errors` itself stays uncapped and exact.
   */
  errorSamples: string[];
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

export interface GrueneDeCrawlOptions {
  forceUpdate?: boolean;
  maxArticles?: number | null;
}

/**
 * As in the Landesverband scraper: the messages are a sample, not a log — a
 * total sitemap outage would otherwise push hundreds of lines through the
 * Redis-backed job status and into the CI summary.
 */
const MAX_ERROR_SAMPLES = 25;

function addErrorSample(target: { errorSamples: string[] }, message: string): void {
  if (target.errorSamples.length >= MAX_ERROR_SAMPLES) return;
  target.errorSamples.push(message);
}

const SITEMAP_URL = 'https://www.gruene.de/sitemap.xml';

/** Path prefixes with substantive content. Everything else is skipped. */
const INCLUDE_PREFIXES: { prefix: string; contentType: string }[] = [
  { prefix: '/artikel/', contentType: 'artikel' },
  { prefix: '/themen/', contentType: 'thema' },
  { prefix: '/erfolge/', contentType: 'erfolg' },
];

/**
 * Flight fragments that appear on every page (newsletter box, donation
 * banner) — dropped so they don't pollute every document's chunks.
 */
const BOILERPLATE_MARKERS = [
  'informiert über Aktionen, Veranstaltungen und Kampagnen',
  'Bleibe informiert über Aktionen',
  'Deine Spende für Grün',
];

const MIN_FRAGMENT_CHARS = 80;

function classifyUrl(url: string): { contentType: string; include: boolean } {
  const path = new URL(url).pathname;
  for (const { prefix, contentType } of INCLUDE_PREFIXES) {
    if (path.startsWith(prefix)) return { contentType, include: true };
  }
  return { contentType: 'page', include: false };
}

/** Keep only natural-language fragments (drops SVG path data, URLs, JSON noise). */
function isNaturalText(fragment: string): boolean {
  if (fragment.length < MIN_FRAGMENT_CHARS) return false;
  if (/^[Mm][\d.\s-]/.test(fragment)) return false; // SVG path data
  if (fragment.startsWith('http')) return false;
  const letters = (fragment.match(/[a-zA-ZäöüÄÖÜß]/g) || []).length;
  if (letters / fragment.length < 0.6) return false;
  return /[a-zäöüß]{3,}\s+[a-zäöüß]{2,}\s+[a-zäöüß]{2,}/i.test(fragment);
}

export class GrueneDeScraper extends BaseScraper {
  private crawlDelay: number;
  private timeout: number;
  private maxRetries: number;
  private userAgent: string;
  private qdrantService: QdrantService | null;

  constructor() {
    super({
      collectionName: 'gruene_de_documents',
      verbose: true,
    });

    this.crawlDelay = 300;
    this.timeout = 30000;
    this.maxRetries = 3;
    this.userAgent = BRAND?.botUserAgent || 'Gruenerator-Bot/1.0';
    this.qdrantService = null;
  }

  private get qdrant(): QdrantService {
    if (!this.qdrantService) {
      throw new Error('GrueneDeScraper not initialized. Call init() first.');
    }
    return this.qdrantService;
  }

  async init(): Promise<void> {
    this.qdrantService = getQdrantInstance();
    await this.qdrantService.init();
    await mistralEmbeddingService.init();
    this.log('GrueneDe scraper initialized');
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

  async discoverFromSitemap(): Promise<SitemapEntry[]> {
    const xml = await this.#fetchPage(SITEMAP_URL);
    if (!xml) {
      throw new Error(`Failed to fetch sitemap: ${SITEMAP_URL}`);
    }

    const entries: SitemapEntry[] = [];
    const seen = new Set<string>();

    for (const match of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const block = match[1];
      const loc = /<loc>([^<]+)<\/loc>/.exec(block)?.[1]?.trim();
      if (!loc || seen.has(loc)) continue;
      seen.add(loc);

      const classification = classifyUrl(loc);
      if (!classification.include) continue;

      const lastmod = /<lastmod>([^<]+)<\/lastmod>/.exec(block)?.[1]?.trim() || null;
      entries.push({ url: loc, contentType: classification.contentType, lastmod });
    }

    this.log(`Discovered ${entries.length} URLs from sitemap`);
    return entries;
  }

  #extractContent(html: string, entry: SitemapEntry): ExtractedContent {
    const rawTitle = /<title>([^<]*)<\/title>/.exec(html)?.[1] || '';
    // Fallback to the URL slug: an empty title would fail the sync-event
    // schema (z.string().min(1)) and 400 the whole event batch of the run.
    const title =
      rawTitle.replace(/\s*[-–|]\s*BÜNDNIS 90\/DIE GRÜNEN\s*$/, '').trim() ||
      new URL(entry.url).pathname.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') ||
      'gruene.de';

    const description =
      /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ||
      /<meta property="og:description" content="([^"]*)"/.exec(html)?.[1] ||
      '';

    const flight = extractFlightStream(html);
    const fragments = extractFlightTexts(flight)
      .map(flightTextToPlain)
      .filter(isNaturalText)
      .filter((f) => !BOILERPLATE_MARKERS.some((marker) => f.includes(marker)));

    // Dedupe repeated fragments (the intro often appears twice in the stream)
    const unique: string[] = [];
    const seenFragments = new Set<string>();
    for (const fragment of fragments) {
      if (seenFragments.has(fragment)) continue;
      seenFragments.add(fragment);
      unique.push(fragment);
    }

    const text = unique.join('\n\n').trim();

    return {
      title: title.substring(0, 500),
      description: description.substring(0, 1000),
      text,
      publishedAt: entry.lastmod,
      contentType: entry.contentType,
    };
  }

  async #articleExists(url: string): Promise<{ content_hash: string } | null> {
    try {
      const points = await scrollDocuments(
        this.qdrant.client!,
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
    await batchDelete(this.qdrant.client!, this.config.collectionName, {
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
        source: 'gruene_de',
        source_url: url,
      },
    });

    if (chunks.length === 0) {
      return { stored: false, reason: 'no_chunks' };
    }

    const chunkTexts = chunks.map((c) => c.text);
    const embeddings = await mistralEmbeddingService.generateBatchEmbeddings(
      buildEmbeddingTextsForChunks(chunks, content.title)
    );

    const points = chunks.map((chunk, index) => ({
      id: generatePointId('gruene_de', url, index),
      vector: embeddings[index],
      payload: {
        document_id: `gruene_de_${contentHash}`,
        source_url: url,
        content_hash: contentHash,
        chunk_index: index,
        chunk_text: chunkTexts[index],
        ...structurePayload(chunk),
        quality_score: chunkQualityService.calculateQualityScore(chunkTexts[index]),
        content_type: content.contentType,
        primary_category: content.contentType,
        country: 'DE',
        title: content.title,
        description: content.description,
        published_at: content.publishedAt,
        source: 'gruene_de',
        indexed_at: new Date().toISOString(),
        ...(index === 0 ? { full_text: content.text } : {}),
      },
    }));

    for (let i = 0; i < points.length; i += 10) {
      const batch = points.slice(i, i + 10);
      await batchUpsert(this.qdrant.client!, this.config.collectionName, batch);
    }

    recordSyncEvent({
      title: content.title,
      sourceUrl: url,
      sourceGroupId: 'gruene-de',
      sourceName: 'Grüne Deutschland',
      excerpt: toExcerpt(content.description || content.text),
      landesverband: null,
      collection: this.config.collectionName,
      eventType: existing ? 'updated' : 'stored',
      publishedAt: content.publishedAt,
    });

    return { stored: true, chunks: chunks.length, vectors: points.length, updated: !!existing };
  }

  async fullCrawl(options: GrueneDeCrawlOptions = {}): Promise<GrueneDeCrawlResult> {
    const { forceUpdate = false, maxArticles = null } = options;
    const startTime = Date.now();

    this.log('\n===================================');
    this.log('Starting gruene.de full crawl');
    this.log(`Force update: ${forceUpdate}`);
    if (maxArticles) this.log(`Max articles: ${maxArticles}`);
    this.log('===================================\n');

    const result: GrueneDeCrawlResult = {
      totalUrls: 0,
      stored: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      errorSamples: [],
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
      const entries = await this.discoverFromSitemap();
      result.totalUrls = entries.length;

      const toProcess = (maxArticles ? entries.slice(0, maxArticles) : entries).filter((entry) => {
        if (this.visitedUrls.has(entry.url)) return false;
        this.visitedUrls.add(entry.url);
        return true;
      });

      this.log(`Prefetching ${toProcess.length} pages (concurrency: 5)...`);
      const fetched = await batchProcess(toProcess, (entry) => this.#fetchPage(entry.url), {
        concurrency: 5,
        delayMs: this.crawlDelay,
      });

      for (let i = 0; i < fetched.length; i++) {
        const entry = fetched[i];
        const { url, contentType } = entry.item;

        if ('error' in entry) {
          result.errors++;
          addErrorSample(result, `Abruf ${url}: ${entry.error}`);
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
          const content = this.#extractContent(html, entry.item);

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
          console.error(`[GrueneDe] Error processing ${url}: ${msg}`);
          result.errors++;
          addErrorSample(result, `${url}: ${msg}`);
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[GrueneDe] Crawl failed:', msg);
      throw error;
    }

    result.duration = Math.round((Date.now() - startTime) / 1000);

    this.log('\n===================================');
    this.log(
      `COMPLETED: ${result.stored} new, ${result.updated} updated (${result.totalVectors} vectors)`
    );
    this.log(`Skipped: ${result.skipped}, Errors: ${result.errors}`);
    this.log(`Duration: ${result.duration}s`);
    this.log('===================================');

    return result;
  }

  async incrementalUpdate(): Promise<GrueneDeCrawlResult> {
    return this.fullCrawl({ forceUpdate: false });
  }
}

export const grueneDeScraperService = new GrueneDeScraper();
export default grueneDeScraperService;

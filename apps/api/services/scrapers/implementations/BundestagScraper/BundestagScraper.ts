import * as cheerio from 'cheerio';

import { deleteBundestagContentByUrl } from '../../../../database/services/QdrantService/deletion.js';
import { getAllUrls } from '../../../../database/services/QdrantService/facets.js';
import { getQdrantInstance } from '../../../../database/services/QdrantService/index.js';
import { indexBundestagContent } from '../../../../database/services/QdrantService/indexing.js';
import { BRAND } from '../../../../utils/domainUtils.js';
import { createLogger } from '../../../../utils/logger.js';
import BundestagContentProcessor from '../../../bundestag/BundestagContentProcessor.js';
import { mistralEmbeddingService } from '../../../mistral/index.js';
import { WebsiteCrawler } from '../WebsiteCrawler.js';

import {
  BASE_URL,
  COLLECTION_NAME,
  CRAWL_DELAY,
  REQUEST_TIMEOUT,
  FETCH_CONCURRENCY,
  SITEMAP_URLS,
  BUNDESTAG_SOURCES,
  getMdBDetailUrls,
} from './bundestagConfig.js';

import type {
  BundestagSourceConfig,
  BundestagScrapeOptions,
  BundestagScrapeResult,
} from './types.js';
import type { CrawledPage } from '../WebsiteCrawler.js';

const log = createLogger('BundestagScraper');

export class BundestagScraper {
  private qdrant: any;
  private processor: BundestagContentProcessor;
  private initialized = false;

  constructor() {
    this.qdrant = null;
    this.processor = new BundestagContentProcessor({
      chunkSize: 400,
      chunkOverlap: 50,
      batchSize: 10,
    });
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.qdrant = getQdrantInstance();
    await this.qdrant.init();
    await mistralEmbeddingService.init();
    this.initialized = true;
    log.info('BundestagScraper initialized');
  }

  async scrapeAllSources(options: BundestagScrapeOptions = {}): Promise<BundestagScrapeResult> {
    const { forceUpdate = false, sourceId } = options;
    const startTime = Date.now();

    const result: BundestagScrapeResult = {
      stored: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      totalVectors: 0,
      duration: 0,
      sources: [],
    };

    const sources = sourceId
      ? BUNDESTAG_SOURCES.filter((s) => s.id === sourceId)
      : BUNDESTAG_SOURCES;

    if (sources.length === 0) {
      log.warn(`No sources found${sourceId ? ` for id "${sourceId}"` : ''}`);
      return result;
    }

    log.info(`Fetching existing URLs from Qdrant collection "${COLLECTION_NAME}"...`);
    const existingUrlRecords = await getAllUrls(this.qdrant.client, COLLECTION_NAME);
    const existingUrls = new Map(existingUrlRecords.map((r) => [r.source_url, r.content_hash]));
    log.info(`Found ${existingUrls.size} existing URLs in collection`);

    for (const source of sources) {
      log.info(`\n--- Scraping source: ${source.name} (${source.path}) [${source.discovery}] ---`);

      const sourceResult = {
        id: source.id,
        name: source.name,
        pages: 0,
        stored: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
      };

      try {
        const crawledPages =
          source.discovery === 'generated'
            ? await this.#discoverFromGeneratedUrls(source)
            : source.discovery === 'sitemap'
              ? await this.#discoverFromSitemap(source)
              : await this.#discoverByCrawl(source);

        sourceResult.pages = crawledPages.length;
        log.info(`Discovered ${crawledPages.length} pages for ${source.name}`);

        for (const page of crawledPages) {
          try {
            const existingHash = existingUrls.get(page.source_url);

            if (!forceUpdate && existingHash && existingHash === page.content_hash) {
              sourceResult.skipped++;
              continue;
            }

            if (page.text.length < 100) {
              sourceResult.skipped++;
              continue;
            }

            const processed = await this.processor.processPages([
              {
                url: page.source_url,
                text: page.text,
                title: page.title,
                section: source.primaryCategory,
                content_hash: page.content_hash,
                published_at: page.published_at,
              },
            ]);

            if (!processed.pages.length || !processed.pages[0].chunks.length) {
              sourceResult.skipped++;
              continue;
            }

            const processedPage = processed.pages[0];
            const chunks = processedPage.chunks
              .filter((c) => c.embedding)
              .map((c) => ({
                text: c.text,
                chunk_text: c.text,
                embedding: c.embedding!,
                token_count: c.token_count,
                tokens: c.token_count,
              }));

            if (chunks.length === 0) {
              sourceResult.skipped++;
              continue;
            }

            if (existingHash) {
              await deleteBundestagContentByUrl(
                this.qdrant.client,
                COLLECTION_NAME,
                page.source_url
              );
            }

            await indexBundestagContent(
              this.qdrant.client,
              COLLECTION_NAME,
              page.source_url,
              chunks,
              {
                title: page.title,
                primary_category: source.primaryCategory,
                published_at: page.published_at,
                content_hash: page.content_hash,
                full_text: page.text,
              }
            );

            if (existingHash) {
              sourceResult.updated++;
            } else {
              sourceResult.stored++;
            }

            result.totalVectors += chunks.length;
          } catch (pageError) {
            const msg = pageError instanceof Error ? pageError.message : String(pageError);
            log.error(`Failed to process page ${page.source_url}: ${msg}`);
            sourceResult.errors++;
          }
        }
      } catch (sourceError) {
        const msg = sourceError instanceof Error ? sourceError.message : String(sourceError);
        log.error(`Failed to scrape source ${source.name}: ${msg}`);
        sourceResult.errors++;
      }

      result.stored += sourceResult.stored;
      result.updated += sourceResult.updated;
      result.skipped += sourceResult.skipped;
      result.errors += sourceResult.errors;
      result.sources.push(sourceResult);

      log.info(
        `Source ${source.name}: ${sourceResult.pages} pages, ` +
          `${sourceResult.stored} stored, ${sourceResult.updated} updated, ` +
          `${sourceResult.skipped} skipped, ${sourceResult.errors} errors`
      );
    }

    result.duration = (Date.now() - startTime) / 1000;
    log.info(
      `\nBundestag scrape complete in ${result.duration.toFixed(1)}s: ` +
        `${result.stored} stored, ${result.updated} updated, ` +
        `${result.skipped} skipped, ${result.errors} errors, ` +
        `${result.totalVectors} vectors`
    );

    return result;
  }

  async #discoverFromGeneratedUrls(source: BundestagSourceConfig): Promise<CrawledPage[]> {
    const urls = getMdBDetailUrls();
    log.info(
      `Generated ${urls.length} MdB detail URLs, fetching in batches of ${FETCH_CONCURRENCY}`
    );

    const pages: CrawledPage[] = [];
    for (let i = 0; i < urls.length; i += FETCH_CONCURRENCY) {
      const batch = urls.slice(i, i + FETCH_CONCURRENCY);
      const results = await Promise.allSettled(batch.map((url) => this.#fetchPage(url)));

      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        const idx = i + j + 1;
        if (r.status === 'fulfilled' && r.value) {
          pages.push(r.value);
          log.info(`[${idx}/${urls.length}] OK ${r.value.title} (${r.value.text.length} chars)`);
        } else if (r.status === 'rejected') {
          log.error(`[${idx}/${urls.length}] ERROR: ${r.reason}`);
        }
      }

      if (i + FETCH_CONCURRENCY < urls.length) {
        await new Promise((r) => setTimeout(r, CRAWL_DELAY));
      }
    }
    return pages;
  }

  async #discoverByCrawl(source: BundestagSourceConfig): Promise<CrawledPage[]> {
    const crawler = new WebsiteCrawler({
      baseUrl: BASE_URL,
      allowedPaths: [source.path],
      maxDepth: source.maxDepth,
      maxPages: source.maxPages,
      crawlDelay: CRAWL_DELAY,
      timeout: REQUEST_TIMEOUT,
    });
    return crawler.crawlSite();
  }

  async #discoverFromSitemap(source: BundestagSourceConfig): Promise<CrawledPage[]> {
    const urls = await this.#fetchSitemapUrls(source.path, source.maxPages);
    log.info(`Sitemap: found ${urls.length} URLs, fetching in batches of ${FETCH_CONCURRENCY}`);

    const pages: CrawledPage[] = [];
    for (let i = 0; i < urls.length; i += FETCH_CONCURRENCY) {
      const batch = urls.slice(i, i + FETCH_CONCURRENCY);
      const results = await Promise.allSettled(batch.map((url) => this.#fetchPage(url)));

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) pages.push(r.value);
      }

      if (i + FETCH_CONCURRENCY < urls.length) {
        await new Promise((r) => setTimeout(r, CRAWL_DELAY));
      }

      if ((i / FETCH_CONCURRENCY) % 10 === 0) {
        log.info(
          `Sitemap fetch progress: ${Math.min(i + FETCH_CONCURRENCY, urls.length)}/${urls.length}`
        );
      }
    }
    return pages;
  }

  async #fetchSitemapUrls(pathPrefix: string, limit: number): Promise<string[]> {
    const urls: string[] = [];

    for (const sitemapUrl of SITEMAP_URLS) {
      try {
        const res = await fetch(sitemapUrl, {
          headers: { 'User-Agent': BRAND.botUserAgent },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT),
        });
        if (!res.ok) continue;

        const xml = await res.text();
        const $ = cheerio.load(xml, { xmlMode: true });

        $('url > loc').each((_, el) => {
          const loc = $(el).text().trim();
          try {
            const pathname = new URL(loc).pathname;
            if (pathname.startsWith(pathPrefix) && pathname !== pathPrefix) {
              urls.push(loc);
            }
          } catch {
            // invalid URL
          }
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(`Failed to fetch sitemap ${sitemapUrl}: ${msg}`);
      }

      if (urls.length >= limit) break;
    }

    return urls.slice(0, limit);
  }

  async #fetchPage(url: string): Promise<CrawledPage | null> {
    const res = await fetch(url, {
      headers: {
        'User-Agent': BRAND.botUserAgent,
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!res.ok) {
      log.warn(`HTTP ${res.status} for ${url}`);
      return null;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Remove nav, footer, scripts, styles
    $('nav, footer, script, style, header, .cookie-banner, [role="banner"]').remove();

    // Try TYPO3 search markers first, fall back to <main> if too short
    const typo3Match = html.match(/<!--TYPO3SEARCH_begin-->([\s\S]*?)<!--TYPO3SEARCH_end-->/);
    let text = '';
    if (typo3Match) {
      const $inner = cheerio.load(typo3Match[1]);
      text = $inner.text().replace(/\s+/g, ' ').trim();
    }
    if (text.length < 200) {
      text = $('main, article, .content, #content, body')
        .first()
        .text()
        .replace(/\s+/g, ' ')
        .trim();
    }

    const title = $('h1').first().text().trim() || $('title').text().trim();

    if (text.length < 100) return null;

    const crypto = await import('crypto');
    const content_hash = crypto.createHash('md5').update(text).digest('hex');

    return {
      source_url: url,
      html,
      title,
      text,
      markdown: text,
      description: $('meta[name="description"]').attr('content') || '',
      published_at: $('meta[property="article:published_time"]').attr('content') || null,
      content_hash,
      indexed_at: new Date().toISOString(),
    };
  }
}

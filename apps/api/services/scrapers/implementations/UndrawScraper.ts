/**
 * Undraw Scraper
 * Downloads all SVG illustrations from undraw.co
 * Illustrations are stored in apps/api/public/illustrations/undraw/
 */

import * as cheerio from 'cheerio';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { BaseScraper } from '../base/BaseScraper.js';
import type { ScraperResult } from '../types.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Undraw illustration metadata
 */
interface UndrawIllustration {
  title: string;
  slug: string;
  mediaUrl: string;
  id: string;
}

/**
 * Raw illustration data from Undraw API
 */
interface UndrawRawIllustration {
  _id: string;
  title: string;
  media: string;
  newSlug: string;
}

/**
 * Undraw scraper configuration
 */
export interface UndrawScraperConfig {
  /** Output directory for downloaded SVGs */
  outputDir?: string;
  /** Maximum number of pages to scrape (41 total available) */
  maxPages?: number;
  /** Maximum concurrent downloads */
  maxConcurrent?: number;
  /** Delay between page requests in ms */
  delayMs?: number;
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Scraper for downloading illustrations from undraw.co
 */
export class UndrawScraper extends BaseScraper {
  private baseUrl = 'https://undraw.co';
  private cdnUrl = 'https://cdn.undraw.co';
  private outputDir: string;
  private maxPages: number;
  private illustrations: UndrawIllustration[] = [];

  constructor(config: UndrawScraperConfig = {}) {
    super({
      collectionName: 'undraw_illustrations',
      maxConcurrent: config.maxConcurrent || 10,
      delayMs: config.delayMs || 500,
      verbose: config.verbose ?? true,
    });

    this.outputDir = config.outputDir || join(__dirname, '../../../../public/illustrations/undraw');
    this.maxPages = config.maxPages || 41;
  }

  /**
   * Main scraping method
   */
  async scrape(): Promise<ScraperResult> {
    this.initializeSession();
    this.log(`Starting Undraw scraper - will process up to ${this.maxPages} pages`);

    try {
      await mkdir(this.outputDir, { recursive: true });
      this.log(`Output directory: ${this.outputDir}`);

      await this.scrapeAllPages();
      await this.downloadAllIllustrations();

      this.log(`Scraping complete: ${this.illustrations.length} illustrations downloaded`);
      return this.buildResult();
    } catch (error) {
      this.logError('Scraping failed', error);
      return this.buildResult();
    }
  }

  /**
   * Scrape all illustration pages (batched for speed)
   */
  private async scrapeAllPages(): Promise<void> {
    this.log('Fetching illustration metadata from all pages (batched)...');

    const batchSize = 5;
    const batches: number[][] = [];

    for (let i = 1; i <= this.maxPages; i += batchSize) {
      batches.push(Array.from({ length: Math.min(batchSize, this.maxPages - i + 1) }, (_, j) => i + j));
    }

    for (const [batchIndex, batch] of batches.entries()) {
      this.log(`Fetching batch ${batchIndex + 1}/${batches.length} (pages ${batch[0]}-${batch[batch.length - 1]})`);

      const results = await Promise.all(
        batch.map(async (page) => {
          try {
            const pageUrl = page === 1 ? `${this.baseUrl}/illustrations` : `${this.baseUrl}/illustrations/${page}`;

            const response = await this.fetchWithRetry(pageUrl, {
              timeout: 30000,
              maxRetries: 3,
            });

            const html = await response.text();
            return this.extractIllustrationsFromPage(html);
          } catch (error) {
            this.logError(`Failed to fetch page ${page}`, error);
            this.stats.errors.push(`Page ${page} fetch failed`);
            return [];
          }
        })
      );

      for (const pageIllustrations of results) {
        if (pageIllustrations.length > 0) {
          this.illustrations.push(...pageIllustrations);
        }
      }

      this.log(`Progress: ${this.illustrations.length} illustrations found so far`);

      if (batchIndex < batches.length - 1) {
        await this.delay(500);
      }
    }

    this.log(`Total illustrations found: ${this.illustrations.length}`);
  }

  /**
   * Extract illustration data from HTML page
   * Undraw embeds illustration data in Next.js page props
   */
  private extractIllustrationsFromPage(html: string): UndrawIllustration[] {
    const illustrations: UndrawIllustration[] = [];

    try {
      const $ = cheerio.load(html);

      const scriptTags = $('script[type="application/json"]');
      scriptTags.each((_, script) => {
        try {
          const content = $(script).html();
          if (!content) return;

          const data = JSON.parse(content);

          if (data?.props?.pageProps?.illustrations) {
            const illustrationData = data.props.pageProps.illustrations as UndrawRawIllustration[];

            for (const item of illustrationData) {
              if (item.title && item.newSlug && item.media) {
                illustrations.push({
                  title: item.title,
                  slug: item.newSlug,
                  mediaUrl: item.media,
                  id: item._id || '',
                });
              }
            }
          }
        } catch (e) {
          // Not the right script tag, continue
        }
      });

      if (illustrations.length === 0) {
        const text = $.text();
        const jsonMatch = text.match(/"illustrations":\[(.*?)\]/);
        if (jsonMatch) {
          this.log('Found illustrations in embedded data');
        }
      }
    } catch (error) {
      this.logError('Failed to parse page HTML', error);
    }

    return illustrations;
  }

  /**
   * Download all discovered illustrations
   */
  private async downloadAllIllustrations(): Promise<void> {
    this.log(`Downloading ${this.illustrations.length} SVG files...`);

    const concurrent = this.config.maxConcurrent || 10;
    const chunks: UndrawIllustration[][] = [];

    for (let i = 0; i < this.illustrations.length; i += concurrent) {
      chunks.push(this.illustrations.slice(i, i + concurrent));
    }

    for (const [index, chunk] of chunks.entries()) {
      if (index % 10 === 0) {
        this.log(`Progress: ${this.stats.documentsProcessed}/${this.illustrations.length} files downloaded`);
      }

      await Promise.all(
        chunk.map(async (illustration) => {
          try {
            await this.downloadIllustration(illustration);
            this.stats.documentsProcessed++;
          } catch (error) {
            this.logError(`Failed to download ${illustration.slug}`, error);
          }
        })
      );

      if (index < chunks.length - 1) {
        await this.delay(200);
      }
    }

    this.log(`Download complete: ${this.stats.documentsProcessed} files saved`);
  }

  /**
   * Download a single illustration
   */
  private async downloadIllustration(illustration: UndrawIllustration): Promise<void> {
    try {
      const svgUrl = illustration.mediaUrl.startsWith('http')
        ? illustration.mediaUrl
        : `${this.cdnUrl}${illustration.mediaUrl}`;

      const response = await this.fetchWithRetry(svgUrl, {
        timeout: 15000,
        maxRetries: 2,
      });

      const svgContent = await response.text();

      const filename = `${illustration.slug}.svg`;
      const filepath = join(this.outputDir, filename);

      await writeFile(filepath, svgContent, 'utf-8');

      this.log(`Downloaded: ${filename}`);
    } catch (error) {
      throw new Error(`Download failed for ${illustration.slug}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get list of downloaded illustrations
   */
  getIllustrations(): UndrawIllustration[] {
    return this.illustrations;
  }
}

export default UndrawScraper;

/**
 * Open Doodles Scraper
 * Downloads all SVG illustrations from opendoodles.com
 * Illustrations are stored in apps/api/public/illustrations/opendoodles/
 */

import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import * as cheerio from 'cheerio';

import { BaseScraper } from '../base/BaseScraper.js';

import type { ScraperResult } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Open Doodles illustration metadata
 */
interface OpenDoodle {
  name: string;
  svgUrl: string;
  pngUrl?: string;
  gifUrl?: string;
}

/**
 * Open Doodles scraper configuration
 */
export interface OpenDoodlesScraperConfig {
  /** Output directory for downloaded SVGs */
  outputDir?: string;
  /** Download PNG versions as well */
  downloadPng?: boolean;
  /** Download GIF versions as well (where available) */
  downloadGif?: boolean;
  /** Delay between requests in ms */
  delayMs?: number;
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Scraper for downloading illustrations from opendoodles.com
 */
export class OpenDoodlesScraper extends BaseScraper {
  private baseUrl = 'https://www.opendoodles.com';
  private s3BaseUrl = 'https://opendoodles.s3-us-west-1.amazonaws.com';
  private outputDir: string;
  private downloadPng: boolean;
  private downloadGif: boolean;
  private doodles: OpenDoodle[] = [];

  constructor(config: OpenDoodlesScraperConfig = {}) {
    super({
      collectionName: 'opendoodles_illustrations',
      maxConcurrent: 5,
      delayMs: config.delayMs || 1000,
      verbose: config.verbose ?? true,
    });

    this.outputDir =
      config.outputDir || join(__dirname, '../../../../public/illustrations/opendoodles');
    this.downloadPng = config.downloadPng ?? false;
    this.downloadGif = config.downloadGif ?? false;
  }

  /**
   * Main scraping method
   */
  async scrape(): Promise<ScraperResult> {
    this.initializeSession();
    this.log('Starting Open Doodles scraper');

    try {
      await mkdir(this.outputDir, { recursive: true });
      this.log(`Output directory: ${this.outputDir}`);

      await this.scrapeGalleryPage();
      await this.downloadAllDoodles();

      this.log(
        `Scraping complete: ${this.doodles.length} doodles found, ${this.stats.documentsProcessed} files downloaded`
      );
      return this.buildResult();
    } catch (error) {
      this.logError('Scraping failed', error);
      return this.buildResult();
    }
  }

  /**
   * Scrape the main gallery page
   */
  private async scrapeGalleryPage(): Promise<void> {
    this.log(`Fetching gallery page: ${this.baseUrl}`);

    try {
      const response = await this.fetchWithRetry(this.baseUrl, {
        timeout: 30000,
        maxRetries: 3,
      });

      const html = await response.text();
      this.doodles = this.extractDoodlesFromPage(html);

      this.log(`Found ${this.doodles.length} doodles on the gallery page`);
    } catch (error) {
      this.logError('Failed to fetch gallery page', error);
      throw error;
    }
  }

  /**
   * Extract doodle data from HTML page
   * Open Doodles displays all illustrations on a single page
   */
  private extractDoodlesFromPage(html: string): OpenDoodle[] {
    const doodles: OpenDoodle[] = [];

    try {
      const $ = cheerio.load(html);

      $('a[href*=".svg"], a[download*=".svg"]').each((_, element) => {
        const href = $(element).attr('href');
        if (!href) return;

        const svgUrl = href.startsWith('http') ? href : `${this.s3BaseUrl}/${href}`;

        const nameMatch = svgUrl.match(/\/([^/]+)\.svg$/);
        if (!nameMatch) return;

        const name = nameMatch[1];

        const pngUrl = svgUrl.replace('.svg', '.png');
        const gifUrl = svgUrl.replace('.svg', '.gif');

        doodles.push({
          name,
          svgUrl,
          pngUrl,
          gifUrl,
        });
      });

      if (doodles.length === 0) {
        $('img[src*=".svg"], source[srcset*=".svg"]').each((_, element) => {
          const src = $(element).attr('src') || $(element).attr('srcset');
          if (!src) return;

          const svgUrl = src.startsWith('http') ? src : `${this.s3BaseUrl}/${src}`;

          const nameMatch = svgUrl.match(/\/([^/]+)\.svg$/);
          if (!nameMatch) return;

          const name = nameMatch[1];

          doodles.push({
            name,
            svgUrl,
            pngUrl: svgUrl.replace('.svg', '.png'),
            gifUrl: svgUrl.replace('.svg', '.gif'),
          });
        });
      }

      if (doodles.length === 0) {
        this.log('Attempting alternative extraction method...');

        const knownDoodles = [
          'sitting',
          'reading',
          'messy',
          'selfie',
          'loving',
          'plant',
          'dancing',
          'coffee',
          'stand',
          'strolling',
          'sprinting',
          'meditating',
          'yoga',
          'levitate',
          'walking',
          'sitting-reading',
          'resting',
          'success',
          'defeated',
          'falling',
          'jumping',
          'flying',
          'floating',
          'working',
          'gaming',
          'browsing',
          'teaching',
          'studying',
          'presenting',
          'chatting',
          'calling',
          'video-call',
          'listening',
          'music',
          'podcasting',
          'shopping',
          'cooking',
          'eating',
          'pet',
          'dog',
          'cat',
        ];

        for (const name of knownDoodles) {
          doodles.push({
            name,
            svgUrl: `${this.s3BaseUrl}/${name}.svg`,
            pngUrl: `${this.s3BaseUrl}/${name}.png`,
            gifUrl: `${this.s3BaseUrl}/${name}.gif`,
          });
        }

        this.log(`Using fallback list with ${knownDoodles.length} known doodles`);
      }
    } catch (error) {
      this.logError('Failed to parse gallery page', error);
    }

    const uniqueDoodles = Array.from(new Map(doodles.map((d) => [d.name, d])).values());

    return uniqueDoodles;
  }

  /**
   * Download all discovered doodles
   */
  private async downloadAllDoodles(): Promise<void> {
    this.log(
      `Downloading doodles (SVG: yes, PNG: ${this.downloadPng}, GIF: ${this.downloadGif})...`
    );

    const concurrent = this.config.maxConcurrent || 5;
    const chunks: OpenDoodle[][] = [];

    for (let i = 0; i < this.doodles.length; i += concurrent) {
      chunks.push(this.doodles.slice(i, i + concurrent));
    }

    for (const [index, chunk] of chunks.entries()) {
      this.log(`Processing batch ${index + 1}/${chunks.length} (${chunk.length} doodles)`);

      await Promise.all(
        chunk.map(async (doodle) => {
          try {
            await this.downloadDoodle(doodle);
          } catch (error) {
            this.logError(`Failed to download ${doodle.name}`, error);
          }
        })
      );

      if (index < chunks.length - 1) {
        await this.delay();
      }
    }

    this.log(`Download complete: ${this.stats.documentsProcessed} files saved`);
  }

  /**
   * Download a single doodle (SVG, and optionally PNG/GIF)
   */
  private async downloadDoodle(doodle: OpenDoodle): Promise<void> {
    const downloads: Promise<void>[] = [];

    downloads.push(this.downloadFile(doodle.svgUrl, `${doodle.name}.svg`, 'svg'));

    if (this.downloadPng && doodle.pngUrl) {
      downloads.push(this.downloadFile(doodle.pngUrl, `${doodle.name}.png`, 'png'));
    }

    if (this.downloadGif && doodle.gifUrl) {
      downloads.push(this.downloadFile(doodle.gifUrl, `${doodle.name}.gif`, 'gif'));
    }

    await Promise.all(downloads);
  }

  /**
   * Download a file from URL
   */
  private async downloadFile(
    url: string,
    filename: string,
    type: 'svg' | 'png' | 'gif'
  ): Promise<void> {
    try {
      const response = await this.fetchWithRetry(url, {
        timeout: 15000,
        maxRetries: 2,
      });

      if (!response.ok) {
        if (response.status === 404 && type !== 'svg') {
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const content =
        type === 'svg' ? await response.text() : Buffer.from(await response.arrayBuffer());

      const filepath = join(this.outputDir, filename);
      await writeFile(filepath, content, type === 'svg' ? 'utf-8' : undefined);

      this.stats.documentsProcessed++;
      this.log(`Downloaded: ${filename}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('404') && type !== 'svg') {
        return;
      }
      throw error;
    }
  }

  /**
   * Get list of discovered doodles
   */
  getDoodles(): OpenDoodle[] {
    return this.doodles;
  }
}

export default OpenDoodlesScraper;

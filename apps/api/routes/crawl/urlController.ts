/**
 * URL Crawling Route
 * Crawls a URL and returns structured content for use as attachment
 */

import express, { Response } from 'express';
import {
  urlCrawlerService,
  UrlValidator,
} from '../../services/scrapers/implementations/UrlCrawler/index.js';
import { createLogger } from '../../utils/logger.js';
import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { CrawlResult } from '../../services/scrapers/implementations/UrlCrawler/types.js';

const log = createLogger('crawlUrl');

const router = express.Router();

interface CrawlRequestBody {
  url: string;
  usePrivacyMode?: boolean;
}

interface CrawledAttachment {
  type: 'crawled_url';
  name: string;
  url: string;
  displayUrl: string;
  content: string;
  size: number;
  metadata: {
    wordCount: number;
    characterCount: number;
    publicationDate: string | null;
    canonical: string;
    description: string;
    contentSource: string;
    extractedAt: string;
    processingTimeMs: number;
    previewImage?: string;
    dimensions?: { width: number; height: number };
    categories?: string[];
    structuredData?: Record<string, any>;
  };
}

interface CrawlResponse {
  success: boolean;
  attachment?: CrawledAttachment;
  error?: string;
  details?: string;
}

/**
 * POST /api/crawl-url
 * Crawls a URL and returns structured content for use as attachment
 */
router.post('/', async (req: AuthenticatedRequest, res: Response<CrawlResponse>) => {
  const startTime = Date.now();

  try {
    const { url, usePrivacyMode = false } = req.body as CrawlRequestBody;
    const userId = req.user?.id || 'anonymous';

    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'URL is required and must be a string',
      });
    }

    log.debug(
      `[crawl-url] User ${userId} requesting crawl for: ${url} (privacy: ${usePrivacyMode})`
    );

    const validation = await UrlValidator.validateUrl(url);
    if (!validation.isValid) {
      log.debug(`[crawl-url] URL validation failed: ${validation.error}`);
      return res.status(400).json({
        success: false,
        error: validation.error,
      });
    }

    log.debug(`[crawl-url] URL validation passed, starting crawl...`);

    const crawlOptions = {
      enhancedMetadata: true,
      timeout: 15000,
    };

    const result: CrawlResult = await urlCrawlerService.crawlUrl(url, crawlOptions);

    if (!result.success || !result.data) {
      log.debug(`[crawl-url] Crawling failed: ${result.error}`);
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    log.debug(
      `[crawl-url] Crawl successful, ${result.data.wordCount} words extracted from ${result.data.title}`
    );

    const crawledAttachment: CrawledAttachment = {
      type: 'crawled_url',
      name: result.data.title || 'Crawled Content',
      url: result.data.originalUrl,
      displayUrl: new URL(result.data.originalUrl).hostname,
      content: usePrivacyMode ? result.data.content : result.data.markdownContent,
      size: result.data.content.length,
      metadata: {
        wordCount: result.data.wordCount,
        characterCount: result.data.characterCount,
        publicationDate: result.data.publicationDate,
        canonical: result.data.canonical,
        description: result.data.description,
        contentSource: result.data.contentSource,
        extractedAt: result.data.extractedAt,
        processingTimeMs: Date.now() - startTime,
        previewImage: result.data.previewImage,
        dimensions: result.data.dimensions,
        categories: result.data.categories,
        structuredData: result.data.structuredData,
      },
    };

    log.debug(
      `[crawl-url] Successfully crawled ${url}: ${result.data.wordCount} words, ${Date.now() - startTime}ms`
    );

    return res.json({
      success: true,
      attachment: crawledAttachment,
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    log.error(`[crawl-url] Error processing request (${processingTime}ms):`, error);

    const err = error as Error;
    let userError = 'Failed to process URL';

    if (err.message.includes('timeout')) {
      userError = 'Die Verarbeitung hat zu lange gedauert. Bitte versuchen Sie es erneut.';
    } else if (err.message.includes('network') || err.message.includes('ENOTFOUND')) {
      userError = 'Netzwerkfehler. Bitte überprüfen Sie die URL und Ihre Verbindung.';
    } else if (err.message.includes('too large')) {
      userError = 'Der Inhalt ist zu groß zum Verarbeiten.';
    } else if (err.message.includes('Insufficient content')) {
      userError = 'Keine ausreichenden Inhalte gefunden. Die Seite könnte JavaScript benötigen.';
    } else if (err.message.includes('Unsupported content type')) {
      userError = 'Nicht unterstützter Inhaltstyp. Nur HTML-Seiten werden unterstützt.';
    }

    return res.status(500).json({
      success: false,
      error: userError,
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

export default router;

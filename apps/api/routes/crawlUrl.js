import express from 'express';
import { urlCrawlerService } from '../services/scrapers/implementations/UrlCrawler/index.js';
import { createLogger } from '../utils/logger.js';
const log = createLogger('crawlUrl');


const router = express.Router();

/**
 * POST /api/crawl-url
 * Crawls a URL and returns structured content for use as attachment
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { url, usePrivacyMode = false } = req.body;
    const userId = req.user?.sub || req.user?.id || 'anonymous';
    
    // Validate input
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'URL is required and must be a string'
      });
    }

    log.debug(`[crawl-url] User ${userId} requesting crawl for: ${url} (privacy: ${usePrivacyMode})`);

    // Validate URL using the service
    const validation = await urlCrawlerService.validateUrl(url);
    if (!validation.isValid) {
      log.debug(`[crawl-url] URL validation failed: ${validation.error}`);
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    log.debug(`[crawl-url] URL validation passed, starting crawl...`);

    // Crawl URL with enhanced metadata for better context
    const crawlOptions = {
      enhancedMetadata: true,
      timeout: 15000 // 15 seconds for crawling
    };

    const result = await urlCrawlerService.crawlUrl(url, crawlOptions);
    
    if (!result.success) {
      log.debug(`[crawl-url] Crawling failed: ${result.error}`);
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    log.debug(`[crawl-url] Crawl successful, ${result.data.wordCount} words extracted from ${result.data.title}`);

    // Format as attachment-like object compatible with existing attachment system
    const crawledAttachment = {
      type: 'crawled_url',
      name: result.data.title || 'Crawled Content',
      url: result.data.originalUrl,
      displayUrl: new URL(result.data.originalUrl).hostname, // For display purposes
      content: usePrivacyMode ? result.data.content : result.data.markdownContent,
      size: result.data.content.length, // Character count as size
      metadata: {
        wordCount: result.data.wordCount,
        characterCount: result.data.characterCount,
        publicationDate: result.data.publicationDate,
        canonical: result.data.canonical,
        description: result.data.description,
        contentSource: result.data.contentSource,
        extractedAt: result.data.extractedAt,
        processingTimeMs: Date.now() - startTime,
        // Enhanced metadata if available
        previewImage: result.data.previewImage,
        dimensions: result.data.dimensions,
        categories: result.data.categories,
        structuredData: result.data.structuredData
      }
    };

    log.debug(`[crawl-url] Successfully crawled ${url}: ${result.data.wordCount} words, ${Date.now() - startTime}ms`);

    res.json({
      success: true,
      attachment: crawledAttachment
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    log.error(`[crawl-url] Error processing request (${processingTime}ms):`, error);
    
    // Map common errors to user-friendly messages
    let userError = 'Failed to process URL';
    
    if (error.message.includes('timeout')) {
      userError = 'Die Verarbeitung hat zu lange gedauert. Bitte versuchen Sie es erneut.';
    } else if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
      userError = 'Netzwerkfehler. Bitte überprüfen Sie die URL und Ihre Verbindung.';
    } else if (error.message.includes('too large')) {
      userError = 'Der Inhalt ist zu groß zum Verarbeiten.';
    } else if (error.message.includes('Insufficient content')) {
      userError = 'Keine ausreichenden Inhalte gefunden. Die Seite könnte JavaScript benötigen.';
    } else if (error.message.includes('Unsupported content type')) {
      userError = 'Nicht unterstützter Inhaltstyp. Nur HTML-Seiten werden unterstützt.';
    }

    res.status(500).json({
      success: false,
      error: userError,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
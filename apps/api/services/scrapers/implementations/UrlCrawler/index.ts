/**
 * URL Crawler - Barrel Export
 * Public API for the general-purpose URL content extractor
 */

// Main crawler class and singleton
export { UrlCrawler, urlCrawler, urlCrawler as urlCrawlerService } from './UrlCrawler.js';

// Type definitions
export type {
  ValidationResult,
  CrawlerConfig,
  CrawlOptions,
  RawCrawlResult,
  EnhancedMetadata,
  ContentData,
  CrawlResult,
  PreviewResult,
  PdfExtractionResult,
} from './types.js';

// Validator modules (for advanced use cases)
export { UrlValidator } from './validators/UrlValidator.js';

// Extractor modules (for advanced use cases)
export { ContentExtractor } from './extractors/ContentExtractor.js';
export { MetadataExtractor } from './extractors/MetadataExtractor.js';
export { MarkdownConverter } from './extractors/MarkdownConverter.js';

// Crawler modules (for advanced use cases)
export { CrawleeCrawler } from './crawlers/CrawleeCrawler.js';
export { FetchCrawler } from './crawlers/FetchCrawler.js';
export { PdfCrawler } from './crawlers/PdfCrawler.js';

// Default export (singleton instance for convenience)
export { urlCrawler as default } from './UrlCrawler.js';

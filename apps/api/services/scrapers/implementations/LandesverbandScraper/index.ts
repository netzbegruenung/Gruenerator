/**
 * Landesverband Scraper - Barrel Export
 * Public API for the modularized Landesverband scraper
 */

// Main scraper class and singleton
export { LandesverbandScraper, landesverbandScraperService } from './LandesverbandScraper.js';

// Type definitions
export type {
  DateExtractionResult,
  PdfLink,
  ExtractedContent,
  ProcessResult,
  ContentPathResult,
  SourceResult,
  LandesverbandScrapeOptions,
  LandesverbandFullResult,
  LandesverbandSearchOptions,
  LandesverbandSearchResult,
  ExistingDocument,
} from './types.js';

// Extractor modules (for advanced use cases)
export { DateExtractor } from './extractors/DateExtractor.js';
export { LinkExtractor } from './extractors/LinkExtractor.js';
export { ContentExtractor } from './extractors/ContentExtractor.js';

// Processor modules (for advanced use cases)
export { DocumentProcessor } from './processors/DocumentProcessor.js';

// Operations modules (for advanced use cases)
export { SearchOperations } from './operations/SearchOperations.js';

// Default export (singleton instance for convenience)
export { landesverbandScraperService as default } from './LandesverbandScraper.js';

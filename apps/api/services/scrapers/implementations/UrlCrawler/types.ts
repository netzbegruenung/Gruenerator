/**
 * UrlCrawler Type Definitions
 * Shared interfaces for the general-purpose URL content extractor
 */

/**
 * URL validation result
 */
export interface ValidationResult {
  isValid: boolean;
  error?: string | undefined;
}

/**
 * Crawler configuration
 */
export interface CrawlerConfig {
  crawlerMode: 'crawlee' | 'fetch' | 'auto';
  maxConcurrency: number;
  maxRetries: number;
  timeout: number;
  maxContentLength: number;
  userAgent: string;
}

/**
 * Crawl options (user-provided)
 */
export interface CrawlOptions {
  timeout?: number | undefined;
  maxRetries?: number | undefined;
  enhancedMetadata?: boolean | undefined;
  headless?: boolean | undefined;
  userAgent?: string | undefined;
  metadataOnly?: boolean | undefined;
}

/**
 * Raw crawl result from crawlers
 */
export interface RawCrawlResult {
  html: string;
  finalUrl: string;
  statusCode: number;
  isPdf?: boolean | undefined;
  pdfText?: string | undefined;
}

/**
 * Enhanced metadata extracted from HTML
 */
export interface EnhancedMetadata {
  previewImage?: string | undefined;
  dimensions?: {
    width: number;
    height: number;
  };
  categories?: string[] | undefined;
  structuredData?: Record<string, unknown> | undefined;
}

/**
 * Extracted content data
 */
export interface ContentData {
  url: string;
  title: string;
  description: string;
  content: string;
  markdownContent: string;
  contentSource: string;
  publicationDate: string | null;
  canonical: string;
  wordCount: number;
  characterCount: number;
  extractedAt: string;
  previewImage?: string | undefined;
  dimensions?: { width: number; height: number };
  categories?: string[] | undefined;
  structuredData?: Record<string, unknown> | undefined;
}

/**
 * Final crawl result returned to caller
 */
export interface CrawlResult {
  success: boolean;
  data?: ContentData & {
    originalUrl: string;
    statusCode: number;
    processingTimeMs: number;
  };
  error?: string | undefined;
}

/**
 * Preview result (HEAD request)
 */
export interface PreviewResult {
  success: boolean;
  data?: {
    url: string;
    accessible: boolean;
    statusCode: number;
    contentType: string | null;
    preview: string;
  };
  error?: string | undefined;
}

/**
 * PDF extraction result
 */
export interface PdfExtractionResult {
  text: string;
  finalUrl: string;
  statusCode: number;
}

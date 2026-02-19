/**
 * UrlCrawler Type Definitions
 * Shared interfaces for the general-purpose URL content extractor
 */

/**
 * URL validation result
 */
export interface ValidationResult {
  isValid: boolean;
  error?: string;
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
  timeout?: number;
  maxRetries?: number;
  enhancedMetadata?: boolean;
  headless?: boolean;
  userAgent?: string;
}

/**
 * Raw crawl result from crawlers
 */
export interface RawCrawlResult {
  html: string;
  finalUrl: string;
  statusCode: number;
  isPdf?: boolean;
  pdfText?: string;
}

/**
 * Enhanced metadata extracted from HTML
 */
export interface EnhancedMetadata {
  previewImage?: string;
  dimensions?: {
    width: number;
    height: number;
  };
  categories?: string[];
  structuredData?: Record<string, any>;
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
  previewImage?: string;
  dimensions?: { width: number; height: number };
  categories?: string[];
  structuredData?: Record<string, any>;
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
  error?: string;
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
  error?: string;
}

/**
 * PDF extraction result
 */
export interface PdfExtractionResult {
  text: string;
  finalUrl: string;
  statusCode: number;
}

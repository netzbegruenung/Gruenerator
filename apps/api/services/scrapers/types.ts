/**
 * Shared TypeScript types for all scrapers
 * Common interfaces for scraping configuration, results, and data structures
 */

/**
 * Base scraper configuration
 */
export interface ScraperConfig {
  /** Collection name in Qdrant for storing vectors */
  collectionName: string;
  /** Base URL to scrape */
  baseUrl?: string | undefined;
  /** Maximum concurrent requests */
  maxConcurrent?: number | undefined;
  /** Delay between requests in milliseconds */
  delayMs?: number | undefined;
  /** Enable verbose logging */
  verbose?: boolean | undefined;
  /** Additional custom configuration */
  [key: string]: unknown;
}

/**
 * Scraping result statistics
 */
export interface ScraperResult {
  /** Number of documents processed */
  documentsProcessed: number;
  /** Number of chunks created from documents */
  chunksCreated: number;
  /** Number of vectors stored in Qdrant */
  vectorsStored: number;
  /** Errors encountered during scraping */
  errors: string[];
  /** Processing time in milliseconds */
  duration: number;
  /** Optional additional statistics */
  [key: string]: unknown;
}

/**
 * Scraped document before chunking
 */
export interface ScrapedDocument {
  /** Unique document ID (hash or URL-based) */
  id: string;
  /** Document title */
  title: string;
  /** Full text content */
  content: string;
  /** Source URL */
  url: string;
  /** Document metadata */
  metadata: DocumentMetadata;
  /** Extraction timestamp */
  scrapedAt: Date;
}

/**
 * Document metadata
 */
export interface DocumentMetadata {
  /** Document type (article, dossier, paper, etc.) */
  type?: string | undefined;
  /** Author name */
  author?: string | undefined;
  /** Publication date (ISO string or formatted) */
  publishedDate?: string | undefined;
  /** Categories or tags */
  categories?: string[] | undefined;
  /** Language code */
  language?: 'de' | 'en' | undefined;
  /** Source domain */
  domain?: string | undefined;
  /** Additional custom fields */
  [key: string]: unknown;
}

/**
 * PDF processing options
 */
export interface PdfProcessingOptions {
  /** Use Mistral OCR for PDF text extraction */
  useMistralOcr?: boolean | undefined;
  /** Maximum number of pages to process */
  maxPages?: number | undefined;
  /** Skip PDFs published before this date */
  skipOlderThan?: Date | undefined;
  /** Extract metadata from PDF */
  extractMetadata?: boolean | undefined;
}

/**
 * HTML extraction options
 */
export interface HtmlExtractionOptions {
  /** CSS selectors for content extraction */
  contentSelectors?: string[] | undefined;
  /** CSS selectors for elements to remove */
  removeSelectors?: string[] | undefined;
  /** Convert HTML to markdown */
  toMarkdown?: boolean | undefined;
  /** Remove scripts and styles */
  removeScriptsStyles?: boolean | undefined;
  /** Preserve specific attributes */
  preserveAttributes?: string[] | undefined;
}

/**
 * Crawling options for recursive website crawling
 */
export interface CrawlOptions {
  /** Maximum depth for recursive crawling */
  maxDepth?: number | undefined;
  /** URL patterns to include */
  includePatterns?: RegExp[] | undefined;
  /** URL patterns to exclude */
  excludePatterns?: RegExp[] | undefined;
  /** Maximum number of pages to crawl */
  maxPages?: number | undefined;
  /** Respect robots.txt */
  respectRobotsTxt?: boolean | undefined;
  /** Date filter: only crawl pages newer than this */
  newerThan?: Date | undefined;
}

/**
 * MediaWiki API response structure
 */
export interface MediaWikiPage {
  /** Page ID */
  pageid: number;
  /** Page title */
  title: string;
  /** Page content */
  revisions?: Array<{ slots?: { main?: { '*'?: string } }; timestamp?: string; '*'?: string }>;
  /** Categories */
  categories?: Array<{ title: string }>;
  /** Page URL */
  fullurl?: string | undefined;
}

/**
 * OParl API endpoint configuration
 */
export interface OparlEndpoint {
  /** Endpoint name (e.g., city name) */
  name?: string | undefined;
  /** City name for this endpoint */
  city?: string | undefined;
  /** OParl API endpoint URL */
  url: string;
  /** Optional endpoint identifier */
  id?: string | undefined;
}

/**
 * OParl API response structure
 */
export interface OparlPaper {
  /** Paper ID */
  id: string;
  /** Paper name/title (optional - may not be present in API response) */
  name?: string | undefined;
  /** Reference number */
  reference?: string | undefined;
  /** Publication date */
  date?: string | undefined;
  /** Paper type */
  paperType?: string | undefined;
  /** Main file */
  mainFile?: OparlFile | undefined;
  /** Auxiliary files */
  auxiliaryFile?: OparlFile[] | undefined;
}

/**
 * OParl file structure
 */
export interface OparlFile {
  /** File ID */
  id: string;
  /** File name */
  name?: string | undefined;
  /** Access URL */
  accessUrl?: string | undefined;
  /** Download URL */
  downloadUrl?: string | undefined;
  /** MIME type */
  mimeType?: string | undefined;
  /** File size in bytes */
  size?: number | undefined;
  /** Creation date */
  date?: string | undefined;
}

/**
 * WordPress post structure (simplified)
 */
export interface WordPressPost {
  /** Post ID */
  id: number;
  /** Post title */
  title: { rendered: string };
  /** Post content */
  content: { rendered: string };
  /** Post excerpt */
  excerpt?: { rendered: string };
  /** Post date */
  date: string;
  /** Post URL */
  link: string;
  /** Post categories */
  categories?: number[] | undefined;
  /** Post tags */
  tags?: number[] | undefined;
  /** Author ID */
  author?: number | undefined;
}

/**
 * Content extraction result
 */
export interface ExtractionResult {
  /** Extracted text content */
  content: string;
  /** Extracted title */
  title?: string | undefined;
  /** Extracted metadata */
  metadata?: Record<string, unknown> | undefined;
  /** Success status */
  success: boolean;
  /** Error message if failed */
  error?: string | undefined;
}

/**
 * URL validation result
 */
export interface UrlValidationResult {
  /** Is URL valid */
  valid: boolean;
  /** Normalized URL */
  url?: string | undefined;
  /** Validation error */
  error?: string | undefined;
}

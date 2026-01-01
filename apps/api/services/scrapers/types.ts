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
  baseUrl?: string;
  /** Maximum concurrent requests */
  maxConcurrent?: number;
  /** Delay between requests in milliseconds */
  delayMs?: number;
  /** Enable verbose logging */
  verbose?: boolean;
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
  type?: string;
  /** Author name */
  author?: string;
  /** Publication date (ISO string or formatted) */
  publishedDate?: string;
  /** Categories or tags */
  categories?: string[];
  /** Language code */
  language?: 'de' | 'en';
  /** Source domain */
  domain?: string;
  /** Additional custom fields */
  [key: string]: unknown;
}

/**
 * PDF processing options
 */
export interface PdfProcessingOptions {
  /** Use Mistral OCR for PDF text extraction */
  useMistralOcr?: boolean;
  /** Maximum number of pages to process */
  maxPages?: number;
  /** Skip PDFs published before this date */
  skipOlderThan?: Date;
  /** Extract metadata from PDF */
  extractMetadata?: boolean;
}

/**
 * HTML extraction options
 */
export interface HtmlExtractionOptions {
  /** CSS selectors for content extraction */
  contentSelectors?: string[];
  /** CSS selectors for elements to remove */
  removeSelectors?: string[];
  /** Convert HTML to markdown */
  toMarkdown?: boolean;
  /** Remove scripts and styles */
  removeScriptsStyles?: boolean;
  /** Preserve specific attributes */
  preserveAttributes?: string[];
}

/**
 * Crawling options for recursive website crawling
 */
export interface CrawlOptions {
  /** Maximum depth for recursive crawling */
  maxDepth?: number;
  /** URL patterns to include */
  includePatterns?: RegExp[];
  /** URL patterns to exclude */
  excludePatterns?: RegExp[];
  /** Maximum number of pages to crawl */
  maxPages?: number;
  /** Respect robots.txt */
  respectRobotsTxt?: boolean;
  /** Date filter: only crawl pages newer than this */
  newerThan?: Date;
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
  revisions?: Array<{ slots: { main: { '*': string } } }>;
  /** Categories */
  categories?: Array<{ title: string }>;
  /** Page URL */
  fullurl?: string;
}

/**
 * OParl API endpoint configuration
 */
export interface OparlEndpoint {
  /** Endpoint name (e.g., city name) */
  name?: string;
  /** City name for this endpoint */
  city?: string;
  /** OParl API endpoint URL */
  url: string;
  /** Optional endpoint identifier */
  id?: string;
}

/**
 * OParl API response structure
 */
export interface OparlPaper {
  /** Paper ID */
  id: string;
  /** Paper name/title */
  name: string;
  /** Reference number */
  reference?: string;
  /** Publication date */
  date?: string;
  /** Paper type */
  paperType?: string;
  /** Main file */
  mainFile?: OparlFile;
  /** Auxiliary files */
  auxiliaryFile?: OparlFile[];
}

/**
 * OParl file structure
 */
export interface OparlFile {
  /** File ID */
  id: string;
  /** File name */
  name?: string;
  /** Access URL */
  accessUrl?: string;
  /** Download URL */
  downloadUrl?: string;
  /** MIME type */
  mimeType?: string;
  /** File size in bytes */
  size?: number;
  /** Creation date */
  date?: string;
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
  categories?: number[];
  /** Post tags */
  tags?: number[];
  /** Author ID */
  author?: number;
}

/**
 * Content extraction result
 */
export interface ExtractionResult {
  /** Extracted text content */
  content: string;
  /** Extracted title */
  title?: string;
  /** Extracted metadata */
  metadata?: Record<string, unknown>;
  /** Success status */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * URL validation result
 */
export interface UrlValidationResult {
  /** Is URL valid */
  valid: boolean;
  /** Normalized URL */
  url?: string;
  /** Validation error */
  error?: string;
}

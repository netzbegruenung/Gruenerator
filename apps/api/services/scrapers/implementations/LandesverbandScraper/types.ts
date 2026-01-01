/**
 * Type definitions for Landesverband Scraper
 * All interfaces and types used by the scraper modules
 */

/**
 * Date extraction result with age validation
 */
export interface DateExtractionResult {
  /** Extracted date object */
  date: Date | null;
  /** ISO date string */
  dateString: string | null;
  /** Whether date is older than threshold (10 years) */
  isTooOld: boolean | null;
}

/**
 * PDF link with metadata and context
 */
export interface PdfLink {
  /** PDF URL */
  url: string;
  /** PDF title or filename */
  title: string;
  /** Surrounding text context */
  context: string;
  /** Date information (populated after extraction) */
  dateInfo?: DateExtractionResult;
}

/**
 * Extracted page content
 */
export interface ExtractedContent {
  /** Page or document title */
  title: string;
  /** Publication date (ISO string or null) */
  publishedAt: string | null;
  /** Full text content */
  text: string;
  /** Category tags */
  categories: string[];
}

/**
 * Document processing result
 */
export interface ProcessResult {
  /** Whether document was stored successfully */
  stored: boolean;
  /** Reason if not stored (e.g., 'too_short', 'too_old', 'unchanged') */
  reason?: string;
  /** Number of chunks created */
  chunks?: number;
  /** Number of vectors stored */
  vectors?: number;
  /** Whether this was an update of existing document */
  updated?: boolean;
}

/**
 * Content path scraping result
 */
export interface ContentPathResult {
  /** Content type identifier */
  contentType: string;
  /** Number of new documents stored */
  stored: number;
  /** Number of documents updated */
  updated: number;
  /** Number of documents skipped */
  skipped: number;
  /** Number of errors encountered */
  errors: number;
  /** Total vectors created */
  totalVectors: number;
  /** Skip reasons with counts */
  skipReasons: Record<string, number>;
}

/**
 * Source scraping result
 */
export interface SourceResult {
  /** Source identifier */
  sourceId: string;
  /** Source display name */
  sourceName: string;
  /** Number of new documents stored */
  stored: number;
  /** Number of documents updated */
  updated: number;
  /** Number of documents skipped */
  skipped: number;
  /** Number of errors encountered */
  errors: number;
  /** Total vectors created */
  totalVectors: number;
  /** Results by content type */
  contentTypes: Record<string, ContentPathResult>;
}

/**
 * Full scrape options
 */
export interface LandesverbandScrapeOptions {
  /** Force update even if content hasn't changed */
  forceUpdate?: boolean;
  /** Filter by source type */
  sourceType?: string | null;
  /** Filter by Landesverband short code */
  landesverband?: string | null;
  /** Filter by content type */
  contentType?: string | null;
  /** Maximum documents per content path */
  maxDocuments?: number | null;
}

/**
 * Complete scrape result
 */
export interface LandesverbandFullResult {
  /** Number of sources processed */
  sourcesProcessed: number;
  /** Total new documents stored */
  stored: number;
  /** Total documents updated */
  updated: number;
  /** Total documents skipped */
  skipped: number;
  /** Total errors encountered */
  errors: number;
  /** Total vectors created */
  totalVectors: number;
  /** Results by source ID */
  bySource: Record<string, SourceResult>;
  /** Duration in seconds */
  duration: number;
}

/**
 * Search options
 */
export interface LandesverbandSearchOptions {
  /** Filter by source ID */
  sourceId?: string | null;
  /** Filter by Landesverband short code */
  landesverband?: string | null;
  /** Filter by source type */
  sourceType?: string | null;
  /** Filter by content type */
  contentType?: string | null;
  /** Maximum results to return */
  limit?: number;
  /** Minimum similarity threshold (0-1) */
  threshold?: number;
}

/**
 * Document search result
 */
export interface LandesverbandSearchResult {
  /** Document ID */
  id: string;
  /** Similarity score */
  score: number;
  /** Document title */
  title: string;
  /** Source ID */
  sourceId: string;
  /** Source name */
  sourceName: string;
  /** Landesverband short code */
  landesverband: string;
  /** Source type */
  sourceType: string;
  /** Content type */
  contentType: string;
  /** Content type label (human-readable) */
  contentTypeLabel: string;
  /** Source URL */
  source_url: string;
  /** Publication date */
  publishedAt: string | null;
  /** Matched text chunk */
  matchedChunk: string;
}

/**
 * Existing document check result
 */
export interface ExistingDocument {
  /** Content hash for deduplication */
  content_hash: string;
  /** Last indexed timestamp */
  indexed_at: string;
}

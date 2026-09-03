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
  dateInfo?: DateExtractionResult | undefined;
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
  reason?: string | undefined;
  /** Number of chunks created */
  chunks?: number | undefined;
  /** Number of vectors stored */
  vectors?: number | undefined;
  /** Whether this was an update of existing document */
  updated?: boolean | undefined;
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
  /**
   * Messages behind `errors`, capped. The count alone never left the server —
   * only `console.error` carried the reason, so a red count in the CI-Bericht
   * could only be diagnosed by reading prod logs within their retention window.
   */
  errorMessages: string[];
  /**
   * Links the upstream site still publishes but no longer serves (HTTP 403/404/
   * 410). Counted apart from `errors` because they are an upstream data-quality
   * fact that no change on our side can clear — six of them recur on every
   * nightly run (issue #2971), and left inside `errors` they train the reader to
   * ignore the one number that is supposed to mean "something broke".
   */
  deadLinks: number;
  /** URLs behind `deadLinks`, capped like `errorMessages`. */
  deadLinkMessages: string[];
  /** Total vectors created */
  totalVectors: number;
  /** Skip reasons with counts */
  skipReasons: Record<string, number>;
  /** Metadata of newly stored articles (for notifications) */
  newArticles: NewArticle[];
}

/**
 * Source scraping result
 */
export interface NewArticle {
  title: string;
  url: string;
  type: string;
}

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
  /**
   * Messages behind `errors`, capped. The count alone never left the server —
   * only `console.error` carried the reason, so a red count in the CI-Bericht
   * could only be diagnosed by reading prod logs within their retention window.
   */
  errorMessages: string[];
  /** Links upstream publishes but no longer serves. See ContentPathResult.deadLinks. */
  deadLinks: number;
  /** URLs behind `deadLinks`, capped. */
  deadLinkMessages: string[];
  /** Total vectors created */
  totalVectors: number;
  /** Why documents were skipped, summed over all content paths (see ContentPathResult.skipReasons). */
  skipReasons: Record<string, number>;
  /** Results by content type */
  contentTypes: Record<string, ContentPathResult>;
  /** Metadata of newly stored articles (for notifications) */
  newArticles: NewArticle[];
}

/**
 * Full scrape options
 */
export interface LandesverbandScrapeOptions {
  /** Force update even if content hasn't changed */
  forceUpdate?: boolean | undefined;
  /** Filter by source type */
  sourceType?: string | null | undefined;
  /** Filter by Landesverband short code */
  landesverband?: string | null | undefined;
  /** Filter by content type */
  contentType?: string | null | undefined;
  /** Maximum documents per content path */
  maxDocuments?: number | null | undefined;
  /** Dry run: extract links and check Qdrant, but don't download/process */
  dryRun?: boolean | undefined;
  /**
   * Incremental discovery: only surface the newest items — WP REST modified_after
   * window, and the first pages of HTML listings — instead of walking the full
   * archive. For hourly runs; the nightly run leaves it off for a complete walk.
   */
  recent?: boolean | undefined;
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
  /** Messages behind `errors`, capped. See ContentPathResult.errorMessages. */
  errorMessages: string[];
  /** Links upstream publishes but no longer serves. See ContentPathResult.deadLinks. */
  deadLinks: number;
  /** URLs behind `deadLinks`, capped. */
  deadLinkMessages: string[];
  /** Total vectors created */
  totalVectors: number;
  /** Why documents were skipped, summed over all sources. */
  skipReasons: Record<string, number>;
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
  sourceId?: string | null | undefined;
  /** Filter by Landesverband short code */
  landesverband?: string | null | undefined;
  /** Filter by source type */
  sourceType?: string | null | undefined;
  /** Filter by content type */
  contentType?: string | null | undefined;
  /** Maximum results to return */
  limit?: number | undefined;
  /** Minimum similarity threshold (0-1) */
  threshold?: number | undefined;
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

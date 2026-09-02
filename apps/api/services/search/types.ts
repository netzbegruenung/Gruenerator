/**
 * Shared TypeScript Types for Search Services
 */

// ============================================================================
// SearxngService Types
// ============================================================================

export interface SearxngSearchOptions {
  timeout?: number | undefined;
  maxResults?: number | undefined;
  language?: string | undefined;
  safesearch?: number | undefined;
  categories?: string | undefined;
  time_range?: string | undefined;
  page?: number | undefined;
  format?: string | undefined;
}

export interface SearchResult {
  rank: number;
  title: string;
  url: string;
  content: string;
  snippet: string;
  publishedDate: string | null;
  engine: string;
  score: number;
  category: string;
  domain: string;
  metadata: {
    length: number;
    hasContent: boolean;
  };
  [key: string]: unknown;
}

export interface ContentStats {
  totalResults: number;
  resultsWithContent: number;
  averageContentLength: number;
  uniqueDomains: number;
  topDomains: string[];
}

export interface FormattedSearchResults {
  success: boolean;
  query: string;
  results: SearchResult[];
  resultCount: number;
  totalResults: number;
  searchEngine: string;
  timestamp: string;
  searchOptions: {
    categories: string;
    language: string;
    maxResults: number;
  };
  contentStats: ContentStats;
  suggestions: string[];
  infoboxes: Record<string, unknown>[];
  answers: string[];
}

export interface SearxngSummary {
  text: string;
  generated: boolean;
  model?: string | undefined;
  timestamp?: string | undefined;
  wordCount?: number | undefined;
  basedOnResults?: number | undefined;
  error?: string | undefined;
}

export interface FormattedSearchResultsWithSummary extends FormattedSearchResults {
  summary?: SearxngSummary | undefined;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export interface ServiceStatus {
  baseUrl: string;
  cache: {
    type: 'redis' | 'memory';
    size: number;
    connected: boolean;
    error?: string | undefined;
  };
  cacheTimeout: number;
  newsCache: number;
  defaultOptions: SearxngSearchOptions;
  uptime: number;
  timestamp: string;
}

// ============================================================================
// SearchResultProcessor Types
// ============================================================================

export interface SearchResultInput {
  title?: string | undefined;
  document_title?: string | undefined;
  filename?: string | undefined;
  top_chunks?: Array<{
    preview?: string | undefined;
    /** Untruncated chunk — see TopChunk.text on why the preview is not enough. */
    text?: string | undefined;
    chunk_index: number;
    page_number?: number | null | undefined;
    chunk_type?: string | null | undefined;
  }>;
  source_url?: string | undefined;
  url?: string | undefined;
  document_id?: string | undefined;
  source_id?: string | null | undefined;
  similarity_score?: number | undefined;
  /** Höchster dichter Kosinus des Dokuments, `null` wo keiner gemessen wurde (#3166). */
  dense_similarity_score?: number | null | undefined;
  relevant_content?: string | undefined;
  chunk_text?: string | undefined;
  // `| null` so a DocumentResult (whose chunk_index can be null) is structurally
  // assignable here without a cast — see _performSearch / _searchCollection.
  chunk_index?: number | null | undefined;
  // Real publication date from the Qdrant payload (web/scraped content) and
  // upload timestamp; carried through from DocumentResult so the notebook layer
  // can rank by recency and cite source dates. Absent on dateless sources.
  published_at?: string | null | undefined;
  created_at?: string | undefined;
}

export interface ExpandedChunkResult {
  document_id: string;
  source_url: string | null;
  source_id?: string | null | undefined;
  title: string;
  /** Short excerpt for the UI's citation list. */
  snippet: string;
  /**
   * Der ganze Chunk, wenn die Suchschicht ihn mitgeliefert hat. `snippet` ist
   * die Vorschau der Suche: bis zu `CONTENT_MAX_EXCERPT_LENGTH` Zeichen
   * (Standard 1500), bei einem Termtreffer um den Treffer zentriert
   * (`extractMatchedExcerpt`), sonst `extractRelevantExcerpt`. Für Antwort-
   * Prompt und Reranker gilt trotzdem dieses Feld — es ist der ungekürzte
   * Chunk. Das `cited_text` einer Notebook-Antwort ist wiederum der
   * anfragebezogene Ausschnitt daraus (siehe `validateAndInjectCitations`).
   */
  chunk_text?: string | undefined;
  filename: string | null;
  similarity: number;
  /**
   * Der dichte Kosinus hinter `similarity`, aus dem server-seitigen
   * Score-Join (#3166 Task 2) — NICHT einfach "wo die Suchschicht einen
   * gemessen hat": der Alt-Pfad misst pro Chunk ebenfalls einen Kosinus,
   * dieses Feld bleibt dort aber (Fix-Runde 1) bewusst leer, weil `similarity`
   * dort bereits Begriffstreffer-/Diversitäts-/Hybrid-Boni auf den Kosinus
   * addiert, die dieses Feld nicht kennt. Fehlt also auf dem Alt-Pfad UND bei
   * Dokumenten, deren Chunks nur aus der BM25-Lane kamen — Leser brauchen
   * deshalb IMMER den Rückfall `dense_similarity ?? similarity`.
   */
  dense_similarity?: number | null | undefined;
  chunk_index: number;
  page_number: number | null;
  chunk_type?: string | null | undefined;
  collection_id?: string | undefined;
  collection_name?: string | undefined;
  // Resolved real date of the source (published_at, else upload created_at),
  // or null when none. Used for recency ranking and source-date citation.
  date?: string | null | undefined;
  published_at?: string | null | undefined;
  created_at?: string | undefined;
}

export interface ReferenceData {
  title: string;
  /** Display excerpts for the UI's citation list. */
  snippets: string[][];
  /** The retrieved chunk in full — what the answer prompt must read. */
  chunk_text?: string | undefined;
  description: string | null;
  // Real source date (published_at, else upload date) or null when none.
  date: string | null;
  source: string;
  document_id: string;
  source_url: string | null;
  filename: string | null;
  similarity_score: number;
  chunk_index: number;
  page_number: number | null;
  chunk_type?: string | null | undefined;
  collection_id?: string | undefined;
  collection_name?: string | undefined;
}

export interface ReferencesMap {
  [id: string]: ReferenceData;
}

export interface Citation {
  index: string;
  cited_text: string;
  document_title: string;
  document_id: string;
  source_url: string | null;
  similarity_score: number;
  chunk_index: number;
  filename: string | null;
  page_number: number | null;
  collection_id?: string | undefined;
  collection_name?: string | undefined;
  // Real source date (or null) — mirrors ReferenceData.date. Strict producer
  // type; structurally assignable to the broad contract NotebookCitation.
  date: string | null;
}

export interface Source {
  document_id: string;
  document_title: string;
  source_url: string | null;
  chunk_text: string;
  similarity_score: number;
  date: string | null;
  citations: Citation[];
}

export interface ValidationResult {
  cleanDraft: string;
  citations: Citation[];
  sources: Source[];
  errors: string[] | null;
}

export interface FilterOptions {
  threshold?: number | undefined;
  limit?: number | undefined;
  // Recency ranking: `now` is injectable for deterministic tests; when
  // `allowCreatedAt` is set, upload `created_at` counts as a real date (user
  // collections only). Omit both to keep pure-similarity ordering.
  now?: Date | undefined;
  allowCreatedAt?: boolean | undefined;
}

export interface CollectionConfig {
  name: string;
  [key: string]: unknown;
}

export interface CollectionSources {
  name: string;
  sources: Source[];
  allSources: ExpandedChunkResult[];
}

export interface SourcesByCollection {
  [collectionId: string]: CollectionSources;
}

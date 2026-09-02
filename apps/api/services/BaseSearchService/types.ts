/**
 * BaseSearchService Type Definitions
 *
 * Provides TypeScript interfaces for search parameters, results, and scoring.
 */

import type { SearchPatternResult } from './keyword-extractor-types.js';

// ============ Search Parameters ============

export interface SearchFilters {
  documentType?: string | undefined;
  dateRange?: {
    start?: Date | undefined;
    end?: Date | undefined;
  };
  tags?: string[] | undefined;
  [key: string]: unknown;
}

export interface SearchOptions {
  limit?: number | undefined;
  threshold?: number | undefined;
  useCache?: boolean | undefined;
  vectorWeight?: number | undefined;
  textWeight?: number | undefined;
  useRRF?: boolean | undefined;
  rrfK?: number | undefined;
  recallLimit?: number | undefined;
  /** Siehe `MMROptions.rerankChunks` — von hier durchgereicht. */
  rerankChunks?: boolean | undefined;
  [key: string]: unknown;
}

export interface SearchParams {
  query: string;
  userId?: string | undefined;
  filters?: SearchFilters | undefined;
  options?: SearchOptions | undefined;
  /** Flat parameter support for backwards compatibility */
  limit?: number | undefined;
  group_id?: string | null | undefined;
  mode?: 'vector' | 'hybrid' | 'text' | 'keyword' | undefined;
}

export interface ValidatedSearchParams {
  query: string;
  userId: string | null;
  filters: SearchFilters;
  options: Required<Pick<SearchOptions, 'limit' | 'threshold' | 'useCache'>> & SearchOptions;
}

// ============ Chunk Data ============

export interface RawChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  chunk_text: string;
  similarity: number;
  token_count?: number | undefined;
  created_at?: string | undefined;
  published_at?: string | null | undefined;
  content_type?: string | undefined;
  page_number?: number | undefined;
  chunk_type?: string | undefined;
  url?: string | undefined;
  metadata?: {
    content_type?: string | undefined;
    page_number?: number | undefined;
    chunk_type?: string | undefined;
    [key: string]: unknown;
  };
  documents?: {
    id: string;
    title?: string | undefined;
    filename?: string | undefined;
    created_at?: string | undefined;
  };
  document_title?: string | undefined;
  document_filename?: string | undefined;
  document_created_at?: string | undefined;
}

export interface ChunkData {
  chunk_id: string;
  chunk_index: number;
  text: string;
  content_type?: string | null | undefined;
  page_number?: number | null | undefined;
  chunk_type?: string | null | undefined;
  similarity: number;
  similarity_adjusted?: number | undefined;
  has_term?: boolean | undefined;
  is_toc?: boolean | undefined;
  token_count?: number | undefined;
  quality_score?: number | undefined;
  searchMethod?: string | undefined;
  originalVectorScore?: number | null | undefined;
  originalTextScore?: number | null | undefined;
  /**
   * Dichter Kosinus dieses Chunks, aber NUR wenn er über den server-seitigen
   * Score-Join (#3166 Task 2) gemessen wurde — anders als
   * `originalVectorScore`, das auf JEDEM Pfad einen echten Kosinus trägt.
   * Der Alt-Pfad hat ebenfalls einen Kosinus, aber `similarity_score` trägt
   * dort Zuschläge (Begriffstreffer, Diversität, Hybrid-Bonus) oben drauf,
   * die dieses Feld nicht kennt — ein Schnitt dagegen würde die
   * Alt-Kontrollgruppe verschieben. Siehe Fix-Runde 1.
   */
  denseSimilarityScore?: number | null | undefined;
}

export interface TransformedChunk {
  id: string | number;
  document_id: string;
  chunk_index: number;
  chunk_text: string;
  similarity: number;
  token_count?: number | undefined;
  created_at?: string | undefined;
  published_at?: string | null | undefined;
  source_id?: string | null | undefined;
  url?: string | undefined;
  documents: {
    id: string;
    title?: string | undefined;
    filename?: string | undefined;
    created_at?: string | undefined;
  };
  searchMethod?: string | undefined;
  originalVectorScore?: number | null | undefined;
  originalTextScore?: number | null | undefined;
  /** Siehe `ChunkData.denseSimilarityScore` — dieselbe Gate-Bedingung. */
  denseSimilarityScore?: number | null | undefined;
}

// ============ Scoring ============

export interface EnhancedScore {
  finalScore: number;
  maxSimilarity: number;
  avgSimilarity: number;
  positionScore: number;
  diversityBonus: number;
  hybridBonus?: number | undefined;
  qualityAvg?: number | undefined;
}

export interface ScoringConfig {
  maxSimilarityWeight?: number | undefined;
  avgSimilarityWeight?: number | undefined;
  positionWeight?: number | undefined;
  minPositionWeight?: number | undefined;
  positionDecayRate?: number | undefined;
  maxDiversityBonus: number;
  diversityBonusRate: number;
  maxFinalScore?: number | undefined;
  [key: string]: unknown;
}

// ============ Document Results ============

export interface HybridMetadata {
  hasVectorMatch: boolean;
  hasTextMatch: boolean;
  searchMethods: Set<string>;
  vectorScores: number[];
  textScores: number[];
  /**
   * Dichte Kosinus-Werte NUR aus dem server-seitigen Score-Join (#3166 Task
   * 2), getrennt von `vectorScores` (das jeder Pfad füllt). Grundlage für
   * `DocumentResult.dense_similarity_score`.
   */
  denseJoinScores: number[];
}

export interface DocumentData {
  document_id: string;
  title?: string | undefined;
  filename?: string | undefined;
  created_at?: string | undefined;
  published_at?: string | null | undefined;
  source_url?: string | undefined;
  source_id?: string | null | undefined;
  chunks: ChunkData[];
  maxSimilarity: number;
  avgSimilarity: number;
  totalScore?: number | undefined;
  hybridMetadata?: HybridMetadata | undefined;
}

export interface TopChunk {
  chunk_index: number;
  content_type?: string | null | undefined;
  page_number?: number | null | undefined;
  chunk_type?: string | null | undefined;
  quality_score?: number | null | undefined;
  has_term?: boolean | undefined;
  /** Short excerpt for display in the UI's citation list. */
  preview: string;
  /**
   * The chunk as retrieved, untruncated.
   *
   * `preview` is display copy: it is cut to CONTENT_MAX_EXCERPT_LENGTH (300)
   * from the chunk's START unless the entire query appears in the chunk
   * verbatim, which for a natural-language question it never does. So on a
   * semantic hit the preview is the chunk's opening sentences and usually NOT
   * the passage that matched. Anything that has to reason over the hit — the
   * answer prompt, the reranker — must read this field instead.
   */
  text?: string | undefined;
}

export interface DocumentResult {
  document_id: string;
  title?: string | undefined;
  filename?: string | undefined;
  created_at?: string | undefined;
  published_at?: string | null | undefined;
  source_url?: string | undefined;
  source_id?: string | null | undefined;
  relevant_content: string;
  similarity_score: number;
  /**
   * Höchster GEMESSENER dichter Kosinus über die Chunks dieses Dokuments,
   * `null` wo keiner vorlag (#3166) — NUR aus dem server-seitigen Score-Join
   * (Task 2, `HYBRID_SERVER_SCORE_JOIN`), nie aus dem Alt-Pfad. Fix-Runde 1:
   * der Alt-Pfad hat pro Chunk ebenfalls einen echten Kosinus
   * (`originalVectorScore`), aber sein `similarity_score` trägt zusätzlich
   * Begriffstreffer-, Diversitäts- und Hybrid-Boni (zusammen bis zu ~0,33) auf
   * die Rohwerte — ein Schnitt gegen den unboosteten Kosinus hätte die 42
   * Alt-Kontrollfälle verschoben. Auf dem fusionierten Server-Pfad gilt das
   * nicht: dort ist `similarity_score` kein Kosinus mehr, sondern ein
   * Fusionswert (RRF ≈ 1,0 auf Rang 1, DBSF nahe 0), gegen den die
   * Notebook-Schwelle von 0,35 gar nicht gemessen ist.
   */
  dense_similarity_score?: number | null | undefined;
  max_similarity: number;
  avg_similarity: number;
  position_score?: number | undefined;
  diversity_bonus?: number | undefined;
  hybrid_bonus?: number | undefined;
  quality_avg?: number | null | undefined;
  chunk_index?: number | null | undefined;
  top_chunks: TopChunk[];
  chunk_count: number;
  /**
   * Abgerufene Chunks dieses Dokuments, die den Suchbegriff wörtlich tragen.
   * Zählt über ALLE Chunks des Dokuments im Trefferpool, nicht nur über die
   * `top_chunks` (die bei `CONTENT_MAX_CHUNKS_PER_DOC` abschneiden). Bei einer
   * semantischen Anfrage ohne wörtliche Treffer ist der Wert 0.
   *
   * Eine Untergrenze, keine Gesamtzahl: was das Recall-Fenster nicht geholt
   * hat, kann hier nicht mitgezählt werden. Wer die Zahl anzeigt, sagt das
   * dazu.
   */
  term_chunk_count: number;
  relevance_info: string;
  search_methods?: string[] | undefined;
  hybrid_metadata?: {
    hasVectorMatch: boolean;
    hasTextMatch: boolean;
    avgVectorScore: number | null;
    avgTextScore: number | null;
  };
}

// ============ Search Response ============

export interface SearchResponse {
  success: boolean;
  results: DocumentResult[];
  query: string;
  searchType: string;
  message: string;
  error?: string | undefined;
  code?: string | undefined;
  stats?: unknown;
  metadata?: {
    searchService?: string | undefined;
    totalChunks?: number | undefined;
    threshold?: number | undefined;
    cached?: boolean | undefined;
    searchPatterns?: string[] | undefined;
    hybridMethod?: string | undefined;
    processedDocuments?: number | undefined;
    /**
     * Der Chunk-Reranker war bestellt und ist ausgefallen (Anbieter aus,
     * Breaker offen, Zeitüberschreitung). KEIN Fehler: die Sortierung ist die
     * ohne Cross-Encoder. Das Feld existiert allein, damit der agentische Loop
     * einmal je Turn `rerank_degraded` senden kann. Es wird NICHT mitgecacht.
     */
    rerankDegraded?: boolean | undefined;
  };
}

// ============ Hybrid Search ============

export interface HybridOptions {
  vectorWeight?: number | undefined;
  textWeight?: number | undefined;
  useRRF?: boolean | undefined;
  rrfK?: number | undefined;
  recallLimit?: number | undefined;
}

export interface HybridChunkParams {
  embedding: number[];
  query: string;
  searchPatterns?: SearchPatternResult | undefined;
  userId?: string | null | undefined;
  filters?: SearchFilters | undefined;
  limit: number;
  threshold: number;
  hybridOptions: HybridOptions;
}

export interface SimilarChunkParams {
  embedding: number[];
  userId?: string | null | undefined;
  filters?: SearchFilters | undefined;
  limit: number;
  threshold: number;
  query?: string | undefined;
}

// ============ RPC Parameters ============

export interface RPCParams {
  query_embedding: string;
  user_id_filter?: string | null | undefined;
  similarity_threshold: number;
  match_count: number;
  [key: string]: unknown;
}

// ============ Cache ============

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
}

export interface Cache {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  clear(): void;
  getStats(): CacheStats;
}

// ============ Error Handler ============

export interface ErrorHandlerOptions {
  enableTelemetry?: boolean | undefined;
  logLevel?: string | undefined;
}

/**
 * ErrorHandler interface compatible with the class from utils/errors/handlers
 * The handle method can return any error-like response structure
 */
export interface ErrorHandler {
  handle(
    error: Error,
    context: {
      operation: string;
      query?: string | undefined;
      userId?: string | null | undefined;
      returnResponse?: boolean | undefined;
      [key: string]: unknown;
    }
  ): unknown;
}

// ============ Service Options ============

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface BaseSearchServiceOptions {
  serviceName?: string | undefined;
  defaultLimit?: number | undefined;
  defaultThreshold?: number | undefined;
  enableTelemetry?: boolean | undefined;
  logLevel?: LogLevel | undefined;
  cacheType?: string | undefined;
  cacheSize?: number | undefined;
  cacheTTL?: number | undefined;
}

// ============ MMR Options ============

export interface MMROptions {
  applyMMR?: boolean | undefined;
  mmrLambda?: number | undefined;
  dossierMode?: boolean | undefined;
  /**
   * Chunks vor der Gruppierung durch den Cross-Encoder schicken. Opt-in: die
   * Gruppierungsfunktion bedient alle Sammlungen, und nur der Anhang-Pfad hat
   * danach keine zweite Rerank-Stufe mehr, die es nachholen könnte.
   */
  rerankChunks?: boolean | undefined;
  /**
   * Ausgabe-Senke für den Fehlschlag des Cross-Encoders. Wird genau dann
   * gerufen, wenn `rerankChunks` bestellt war und `rerankPipeline` degradiert
   * hat. Ein Rückruf statt eines zweiten Rückgabewerts, weil
   * `groupAndRankHybridResults` `DocumentResult[]` an ein Dutzend Aufrufer
   * liefert und keiner davon ein Tupel erwartet.
   */
  onRerankDegraded?: (() => void) | undefined;
}

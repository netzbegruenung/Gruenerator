/**
 * Type definitions for Text Chunker
 * Defines interfaces for chunks, metadata, options, and segments
 */

/**
 * Chunk metadata containing structural and content information
 */
export interface ChunkMetadata {
  chunkingMethod?: string | undefined;
  page_number?: number | null | undefined;
  content_type?: string | undefined;
  markdown?: MarkdownMetadata | undefined;
  quality_score?: number | undefined;
  chapterTitle?: string | undefined;
  sectionTitle?: string | undefined;
  /**
   * `'text'` oder `'table'` auf dem Struktur-Pfad. Der tote hierarchische
   * Chunker schreibt in dasselbe Feld sechs andere Werte
   * (`detectChunkType`, structureAwareChunking.ts:275) — deshalb bleibt der
   * Typ breit; die Verengung auf zwei Werte passiert in `structurePayload`.
   */
  chunkType?: string | undefined;
  /** Überschriftenpfad des Abschnitts, z. B. `['Kapitel 3', '3.1 Förderung']`. */
  headingPath?: string[] | null | undefined;
  /** Letztes Element von `headingPath`, denormalisiert für Anzeige und Filter. */
  heading?: string | null | undefined;
  /**
   * Laufende Nummer des Abschnitts je Seite — `chunkStructured` läuft je
   * Seitenmarker, der Zähler beginnt auf jeder Seite neu.
   */
  sectionIndex?: number | null | undefined;
  isCompleteSentence?: boolean | undefined;
  hasOverlap?: boolean | undefined;
  prevChunkId?: string | undefined;
  nextChunkId?: string | undefined;
  relatedChunks?: string[] | undefined;
  semanticLevel?: number | undefined;
  startPosition?: number | undefined;
  endPosition?: number | undefined;
}

/**
 * Markdown structure metadata
 */
export interface MarkdownMetadata {
  headers?: number | undefined;
  lists?: number | undefined;
  tables?: number | undefined;
  code_blocks?: number | undefined;
}

/**
 * Chunk object with text and metadata
 */
export interface Chunk {
  text: string;
  index: number;
  tokens: number;
  metadata: ChunkMetadata;
}

/**
 * Sentence segment with position information
 */
export interface SentenceSegment {
  s: string;
  start: number;
  end: number;
}

/**
 * Text window for sliding window chunking
 */
export interface TextWindow {
  text: string;
  start: number;
  end: number;
}

/**
 * Page marker information
 */
export interface PageMarker {
  page: number;
  index: number;
  length?: number | undefined;
}

/**
 * Page range information
 */
export interface PageRange {
  page: number;
  start: number;
  end: number;
}

/**
 * Page with extracted text
 */
export interface PageWithText {
  pageNumber: number;
  textWithoutMarker: string;
}

/**
 * Chunking options
 */
export interface ChunkingOptions {
  chunkSize?: number | undefined;
  chunkOverlap?: number | undefined;
  preserveSentences?: boolean | undefined;
  removeEmptyChunks?: boolean | undefined;
  baseMetadata?: Record<string, unknown> | undefined;
}

/**
 * Paragraph chunker options
 */
export interface ParagraphChunkerOptions {
  chunkSize?: number | undefined;
  chunkOverlap?: number | undefined;
}

/**
 * Semantic boundary from structure detector
 */
export interface SemanticBoundary {
  position: number;
  type: string;
  level: number;
  title?: string | undefined;
  importance?: number | undefined;
}

/**
 * Document structure from structure detector
 */
export interface DocumentStructure {
  chapters: SemanticBoundary[];
  sections: SemanticBoundary[];
  lists: SemanticBoundary[];
  tables: SemanticBoundary[];
  hierarchy: SemanticBoundary[];
  metadata: {
    documentType: string;
    hasChapters: boolean;
    hasSections: boolean;
    complexity: number;
  };
}

/**
 * Chunk context for hierarchical chunking
 */
export interface ChunkContext {
  chapter?: string | undefined;
  section?: string | undefined;
  subsection?: string | undefined;
  level: number;
}

/**
 * Sentence overlap result
 */
export interface SentenceOverlap {
  overlapText: string;
  numSentences: number;
}

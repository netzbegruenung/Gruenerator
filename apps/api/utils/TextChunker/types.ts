/**
 * Type definitions for Text Chunker
 * Defines interfaces for chunks, metadata, options, and segments
 */

/**
 * Chunk metadata containing structural and content information
 */
export interface ChunkMetadata {
  chunkingMethod?: string;
  page_number?: number | null;
  content_type?: string;
  markdown?: MarkdownMetadata;
  quality_score?: number;
  chapterTitle?: string;
  sectionTitle?: string;
  chunkType?: string;
  isCompleteSentence?: boolean;
  hasOverlap?: boolean;
  prevChunkId?: string;
  nextChunkId?: string;
  relatedChunks?: string[];
  semanticLevel?: number;
  startPosition?: number;
  endPosition?: number;
}

/**
 * Markdown structure metadata
 */
export interface MarkdownMetadata {
  headers?: number;
  lists?: number;
  tables?: number;
  code_blocks?: number;
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
  length?: number;
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
  maxTokens?: number;
  overlapTokens?: number;
  chunkSize?: number;
  chunkOverlap?: number;
  preserveSentences?: boolean;
  removeEmptyChunks?: boolean;
  baseMetadata?: Record<string, any>;
}

/**
 * LangChain chunker options
 */
export interface LangChainChunkerOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

/**
 * Semantic boundary from structure detector
 */
export interface SemanticBoundary {
  position: number;
  type: string;
  level: number;
  title?: string;
  importance?: number;
}

/**
 * Document structure from structure detector
 */
export interface DocumentStructure {
  chapters: any[];
  sections: any[];
  lists: any[];
  tables: any[];
  hierarchy: any[];
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
  chapter?: string;
  section?: string;
  subsection?: string;
  level: number;
}

/**
 * Sentence overlap result
 */
export interface SentenceOverlap {
  overlapText: string;
  numSentences: number;
}

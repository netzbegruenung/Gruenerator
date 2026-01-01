/**
 * TextChunker Module Exports
 *
 * Barrel export file for TextChunker module.
 * Provides clean API surface for external consumers.
 */

// Main chunking functions
export { smartChunkDocument, smartChunkDocumentAsync } from './TextChunker.js';

// LangChain integration
export { LangChainChunker, langChainChunker } from './langchainIntegration.js';

// Structure-aware chunking
export { hierarchicalChunkDocument } from './structureAwareChunking.js';

// Sentence segmentation
export {
  sentenceSegments,
  findPageMarkers,
  createSentenceOverlap,
  resolvePageNumberForOffset
} from './sentenceSegmentation.js';

// Post-processing utilities
export {
  sentenceRepack,
  enrichChunkWithMetadata,
  createSlidingWindows
} from './chunkPostProcessing.js';

// Page marker processing
export { splitTextByPageMarkers, buildPageRangesFromRaw } from './pageMarkerProcessing.js';

// Validation and estimation
export {
  estimateTokens,
  validateChunkingOptions,
  prepareTextForEmbedding,
  isValidText,
  tokensToChars,
  estimateWords
} from './validation.js';

// German language rules
export { GERMAN_ABBREVIATIONS, GERMAN_SEPARATORS } from './germanLanguageRules.js';

// Re-export all type definitions
export type {
  Chunk,
  ChunkMetadata,
  ChunkingOptions,
  LangChainChunkerOptions,
  SentenceSegment,
  TextWindow,
  PageMarker,
  PageRange,
  PageWithText,
  SemanticBoundary,
  DocumentStructure,
  ChunkContext,
  SentenceOverlap,
  MarkdownMetadata
} from './types.js';

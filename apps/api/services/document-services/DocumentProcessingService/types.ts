/**
 * Type definitions for DocumentProcessingService
 * Defines interfaces for document processing operations
 */

/**
 * Chunking options
 */
export interface ChunkingOptions {
  maxTokens?: number;
  overlapTokens?: number;
  preserveSentences?: boolean;
}

/**
 * Chunk and embed result
 */
export interface ChunkAndEmbedResult {
  chunks: any[];
  embeddings: number[][];
  vectorCount: number;
}

/**
 * Processing result (generic)
 */
export interface ProcessingResult {
  id: string;
  title: string;
  vectorCount: number;
  sourceType: string;
}

/**
 * File upload result
 */
export interface FileUploadResult extends ProcessingResult {
  // Same as ProcessingResult
}

/**
 * Text processing result
 */
export interface TextProcessingResult extends ProcessingResult {
  // Same as ProcessingResult
}

/**
 * URL processing result
 */
export interface UrlProcessingResult extends ProcessingResult {
  sourceUrl: string;
  status: string;
  created_at: string;
}

/**
 * File upload object
 */
export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

/**
 * OCR extraction result
 */
export interface OcrExtractionResult {
  text: string;
}

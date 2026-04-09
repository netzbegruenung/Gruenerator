/**
 * Type definitions for DocumentProcessingService
 * Defines interfaces for document processing operations
 */

import type { Chunk } from '../TextChunker/types.js';

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
  chunks: Chunk[];
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
export type FileUploadResult = ProcessingResult;

/**
 * Text processing result
 */
export type TextProcessingResult = ProcessingResult;

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

/**
 * Minimal interface for PostgresDocumentService used by processing functions
 */
export interface PostgresDocumentServiceLike {
  saveDocumentMetadata: (
    userId: string,
    metadata: {
      title: string;
      filename?: string | null;
      sourceType?: string;
      vectorCount?: number;
      fileSize?: number;
      status?: string;
      additionalMetadata?: Record<string, unknown> | null;
      [key: string]: unknown;
    }
  ) => Promise<{ id: string; title: string; [key: string]: unknown }>;
  updateDocumentMetadata: (
    documentId: string,
    userId: string,
    updates: {
      title?: string;
      status?: string;
      vectorCount?: number;
      additionalMetadata?: Record<string, unknown>;
      [key: string]: unknown;
    }
  ) => Promise<unknown>;
  getDocumentById: (
    documentId: string,
    userId: string
  ) => Promise<{
    id: string;
    title: string;
    filename?: string | null;
    source_type: string;
    metadata?: Record<string, unknown> | string | null;
    [key: string]: unknown;
  } | null>;
}

/**
 * Minimal interface for QdrantDocumentService used by processing functions
 */
export interface QdrantDocumentServiceLike {
  storeDocumentVectors: (
    userId: string,
    documentId: string,
    chunks: Array<{ text: string; tokens?: number }>,
    embeddings: number[][],
    metadata: Record<string, unknown>
  ) => Promise<unknown>;
}

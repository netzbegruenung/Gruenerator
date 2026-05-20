/**
 * Type definitions for DocumentProcessingService
 * Defines interfaces for document processing operations
 */

import type { Chunk } from '../TextChunker/types.js';

/**
 * Chunking options
 */
export interface ChunkingOptions {
  maxTokens?: number | undefined;
  overlapTokens?: number | undefined;
  preserveSentences?: boolean | undefined;
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
      filename?: string | null | undefined;
      sourceType?: string | undefined;
      vectorCount?: number | undefined;
      fileSize?: number | undefined;
      status?: string | undefined;
      additionalMetadata?: Record<string, unknown> | null | undefined;
      [key: string]: unknown;
    }
  ) => Promise<{ id: string; title: string; [key: string]: unknown }>;
  updateDocumentMetadata: (
    documentId: string,
    userId: string,
    updates: {
      title?: string | undefined;
      status?: string | undefined;
      vectorCount?: number | undefined;
      additionalMetadata?: Record<string, unknown> | undefined;
      [key: string]: unknown;
    }
  ) => Promise<unknown>;
  getDocumentById: (
    documentId: string,
    userId: string
  ) => Promise<{
    id: string;
    title: string;
    filename?: string | null | undefined;
    source_type: string;
    metadata?: Record<string, unknown> | string | null | undefined;
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
    metadata: Record<string, unknown>,
    onBatchUpserted?: (upserted: number, total: number) => Promise<void> | void
  ) => Promise<unknown>;
}

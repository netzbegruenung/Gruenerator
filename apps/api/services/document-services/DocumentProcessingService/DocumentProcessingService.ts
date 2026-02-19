/**
 * DocumentProcessingService - Main orchestration class
 * Centralizes common document processing logic for upload, text addition, and URL crawling
 */

import { getQdrantDocumentService } from '../DocumentSearchService/index.js';
import { getPostgresDocumentService } from '../PostgresDocumentService/index.js';

// Import module functions

import { chunkAndEmbedText } from './chunkingPipeline.js';
import { processFileUpload } from './fileProcessing.js';
import { extractTextFromFile, generateContentPreview } from './textExtraction.js';
import { processTextContent } from './textProcessing.js';
import { processUrlContent } from './urlProcessing.js';

import type {
  UploadedFile,
  FileUploadResult,
  TextProcessingResult,
  UrlProcessingResult,
  ChunkingOptions,
  ChunkAndEmbedResult,
} from './types.js';

/**
 * Main DocumentProcessingService class
 * Delegates operations to specialized modules
 */
export class DocumentProcessingService {
  private postgresDocumentService: any;
  private qdrantDocumentService: any;

  constructor() {
    this.postgresDocumentService = getPostgresDocumentService();
    this.qdrantDocumentService = getQdrantDocumentService();
  }

  // ========================================
  // Text Extraction
  // ========================================

  /**
   * Generate a short, sentence-aware content preview
   */
  generateContentPreview(text: string, limit: number = 600): string {
    return generateContentPreview(text, limit);
  }

  /**
   * Extract text from file buffer based on MIME type
   */
  async extractTextFromFile(file: UploadedFile): Promise<string> {
    return extractTextFromFile(file);
  }

  // ========================================
  // Chunking Pipeline
  // ========================================

  /**
   * Process text content into chunks and embeddings
   */
  async chunkAndEmbedText(text: string, options?: ChunkingOptions): Promise<ChunkAndEmbedResult> {
    return chunkAndEmbedText(text, options);
  }

  // ========================================
  // Processing Pipelines
  // ========================================

  /**
   * Process a file upload (handles extraction and processing)
   */
  async processFileUpload(
    userId: string,
    file: UploadedFile,
    title: string,
    sourceType: string = 'manual'
  ): Promise<FileUploadResult> {
    return processFileUpload(
      this.postgresDocumentService,
      this.qdrantDocumentService,
      userId,
      file,
      title,
      sourceType
    );
  }

  /**
   * Process text content directly (no file upload)
   */
  async processTextContent(
    userId: string,
    title: string,
    content: string,
    sourceType: string = 'manual'
  ): Promise<TextProcessingResult> {
    return processTextContent(
      this.postgresDocumentService,
      this.qdrantDocumentService,
      userId,
      title,
      content,
      sourceType
    );
  }

  /**
   * Process crawled URL content
   */
  async processUrlContent(
    userId: string,
    url: string,
    title: string,
    content: string,
    sourceType: string = 'manual'
  ): Promise<UrlProcessingResult> {
    return processUrlContent(
      this.postgresDocumentService,
      this.qdrantDocumentService,
      userId,
      url,
      title,
      content,
      sourceType
    );
  }
}

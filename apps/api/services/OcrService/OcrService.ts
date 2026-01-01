/**
 * OCR Service - Main orchestration class
 * Extracts text from PDFs, DOCX, and images using Mistral OCR and PDF.js
 * Handles document processing, embedding generation, and database updates
 */

import path from 'path';
import { mistralEmbeddingService } from '../mistral/index.js';
import { smartChunkDocument } from '../document-services/textChunker.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getQdrantInstance } from '../../database/services/QdrantService.js';
import { vectorConfig } from '../../config/vectorConfig.js';

// Import module functions
import { validateDocumentLimits as validateLimits, getMediaType } from './validation.js';
import {
  getPdfJs as loadPdfJs,
  openPdfDocument as openPdf,
  getPDFInfo as getPdfInfo,
  canExtractTextDirectly as checkParseability,
  extractTextDirectlyFromPDF as extractDirect,
  extractPageTextDirectly as extractPage,
  extractTextFromBase64PDF as extractBase64
} from './pdfOperations.js';
import { extractTextWithMistralOCR as extractMistral } from './mistralIntegration.js';
import {
  applyMarkdownFormatting as formatMarkdown,
  isLikelyHeading,
  determineHeadingLevel
} from './textFormatting.js';
import {
  updateDocumentStatus as updateStatus,
  updateDocumentWithResults as updateResults,
  generateAndStoreEmbeddings as generateEmbeddings
} from './databaseOperations.js';

import type {
  DocumentLimits,
  ParseabilityCheck,
  ExtractionResult,
  DocumentExtractionResult,
  PageExtractionResult,
  PDFInfo,
  EmbeddingGenerationResult,
  ProcessingMetadata
} from './types.js';

/**
 * OCR Service class
 * Provides document text extraction and embedding generation
 */
export class OCRService {
  private isProcessing: Map<string, boolean>;
  private maxPages: number;
  private postgres: any;
  private qdrant: any;
  private _pdfjsLib: any | undefined;

  constructor() {
    this.isProcessing = new Map();
    this.maxPages = 1000; // Increased limit for political documents and large PDFs
    this.postgres = getPostgresInstance();
    this.qdrant = getQdrantInstance();
  }

  /**
   * Get PDF.js library (lazy loading with caching)
   */
  async getPdfJs(): Promise<any> {
    if (this._pdfjsLib) return this._pdfjsLib;

    const pdfjsLib = await loadPdfJs();

    // Configure worker path
    const workerPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
    );
    pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${workerPath}`;

    this._pdfjsLib = pdfjsLib;
    return pdfjsLib;
  }

  /**
   * Open PDF document with PDF.js
   */
  async openPdfDocument(pdfPath: string): Promise<any> {
    const pdfjsLib = await this.getPdfJs();
    return await openPdf(pdfPath, pdfjsLib);
  }

  /**
   * Process text directly (no file storage)
   */
  async processText(
    userId: string,
    documentId: string,
    text: string,
    metadata: ProcessingMetadata = {}
  ): Promise<void> {
    if (this.isProcessing.get(documentId)) {
      console.log(`[OCRService] Document ${documentId} is already being processed`);
      return;
    }

    this.isProcessing.set(documentId, true);
    console.log(`[OCRService] Starting text processing for document ${documentId}`);

    try {
      // Update status to processing
      await this.updateDocumentStatus(documentId, 'processing');

      const extractionInfo = {
        method: 'direct_text',
        textLength: text.length,
        processingTime: 0
      };

      console.log(`[OCRService] Successfully processed text document ${documentId}:`, extractionInfo);

      // Update document with results and generate vectors
      await this.updateDocumentWithResults(documentId, text, 1, extractionInfo);
      await this.generateAndStoreEmbeddings(userId, documentId, text, metadata);

      // Mark as completed
      await this.updateDocumentStatus(documentId, 'completed');
    } catch (error) {
      console.error(`[OCRService] Error processing document ${documentId}:`, error);
      await this.updateDocumentStatus(documentId, 'failed');
      throw error;
    } finally {
      this.isProcessing.delete(documentId);
    }
  }

  /**
   * Validate document limits before processing
   */
  async validateDocumentLimits(
    filePath: string,
    fileExtension: string
  ): Promise<DocumentLimits> {
    return await validateLimits(
      filePath,
      fileExtension,
      this.openPdfDocument.bind(this),
      this.maxPages
    );
  }

  /**
   * Extract text from documents using Mistral OCR exclusively
   */
  async extractTextFromDocument(filePath: string): Promise<DocumentExtractionResult> {
    const startTime = Date.now();
    const fileExtension = path.extname(filePath).toLowerCase();
    console.log(`[OCRService] Starting document text extraction with Mistral OCR: ${filePath} (${fileExtension})`);

    try {
      // Validate document limits first
      await this.validateDocumentLimits(filePath, fileExtension);

      // Optional parseability check for PDFs only (for telemetry)
      let parseCheck: ParseabilityCheck | null = null;
      if (fileExtension === '.pdf') {
        parseCheck = await this.canExtractTextDirectly(filePath);
      }

      // Always use Mistral OCR - supports PDF, DOCX, PPTX, images
      console.log(`[OCRService] Using Mistral OCR for ${fileExtension} document`);
      const result = await this.extractTextWithMistralOCR(filePath);
      const totalTime = Date.now() - startTime;

      console.log(`[OCRService] Mistral OCR completed successfully in ${totalTime}ms`);

      return {
        ...result,
        extractionMethod: 'mistral-ocr',
        fileType: fileExtension,
        parseabilityStats: parseCheck?.stats || null,
        totalProcessingTimeMs: totalTime
      };
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`[OCRService] Mistral OCR extraction failed after ${totalTime}ms:`, error);
      throw error;
    }
  }

  /**
   * Use Mistral OCR to extract text as markdown
   */
  async extractTextWithMistralOCR(filePath: string): Promise<ExtractionResult> {
    return await extractMistral(filePath, getMediaType);
  }

  /**
   * Check if PDF text can be extracted directly
   */
  async canExtractTextDirectly(pdfPath: string): Promise<ParseabilityCheck> {
    return await checkParseability(pdfPath, this.openPdfDocument.bind(this));
  }

  /**
   * Extract text directly from PDF using PDF.js
   */
  async extractTextDirectlyFromPDF(pdfPath: string): Promise<ExtractionResult> {
    return await extractDirect(
      pdfPath,
      this.openPdfDocument.bind(this),
      this.applyMarkdownFormatting.bind(this),
      this.maxPages
    );
  }

  /**
   * Extract text from a single PDF page
   */
  async extractPageTextDirectly(
    pdfDoc: any,
    pageNum: number
  ): Promise<PageExtractionResult> {
    return await extractPage(pdfDoc, pageNum, this.applyMarkdownFormatting.bind(this));
  }

  /**
   * Get PDF information (page count)
   */
  async getPDFInfo(pdfPath: string): Promise<PDFInfo> {
    return await getPdfInfo(pdfPath, this.getPdfJs.bind(this));
  }

  /**
   * Extract text from base64-encoded PDF
   */
  async extractTextFromBase64PDF(
    base64Data: string,
    filename: string = 'unknown.pdf'
  ): Promise<ExtractionResult> {
    return await extractBase64(base64Data, filename, this.getPdfJs.bind(this));
  }

  /**
   * Apply markdown formatting to plain text
   */
  applyMarkdownFormatting(text: string): string {
    return formatMarkdown(text);
  }

  /**
   * Check if line is likely a heading
   */
  isLikelyHeading(line: string): boolean {
    return isLikelyHeading(line);
  }

  /**
   * Determine heading level (H1/H2/H3)
   */
  determineHeadingLevel(line: string, index: number, allLines: string[]): number {
    return determineHeadingLevel(line, index, allLines);
  }

  /**
   * Update document status in PostgreSQL
   */
  async updateDocumentStatus(documentId: string, status: string): Promise<void> {
    return await updateStatus(documentId, status, this.postgres);
  }

  /**
   * Update document with extraction results
   */
  async updateDocumentWithResults(
    documentId: string,
    text: string,
    pageCount: number,
    extractionInfo: any
  ): Promise<void> {
    return await updateResults(documentId, text, pageCount, extractionInfo, this.postgres);
  }

  /**
   * Generate and store embeddings for document text
   */
  async generateAndStoreEmbeddings(
    userId: string,
    documentId: string,
    text: string,
    metadata: ProcessingMetadata = {}
  ): Promise<EmbeddingGenerationResult> {
    return await generateEmbeddings(
      userId,
      documentId,
      text,
      metadata,
      smartChunkDocument,
      mistralEmbeddingService,
      this.qdrant,
      this.postgres,
      vectorConfig
    );
  }

  /**
   * Get all currently processing documents
   */
  getProcessingDocuments(): string[] {
    return Array.from(this.isProcessing.keys());
  }
}

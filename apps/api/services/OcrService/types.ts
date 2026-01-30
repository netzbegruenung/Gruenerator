/**
 * Type definitions for OCR Service
 * Defines interfaces for PDF processing, OCR operations, and document extraction
 */

export interface DocumentLimits {
  pageCount?: number;
  fileSizeMB: number;
}

export interface ParseabilityCheck {
  isParseable: boolean;
  confidence: number;
  sampleText: string;
  stats: {
    totalPages?: number;
    sampledPages?: number;
    pagesWithText?: number;
    textDensity?: number;
    pageSuccessRate?: number;
    processingTimeMs?: number;
    error?: string;
  };
}

export interface ExtractionResult {
  text: string;
  pageCount: number;
  method: 'mistral-ocr' | 'docling' | 'direct' | 'pdfjs-dist';
  confidence?: number;
  stats?: {
    pages?: number;
    successfulPages?: number;
    processingTimeMs?: number;
    method?: string;
  };
}

export interface DocumentExtractionResult extends ExtractionResult {
  extractionMethod: string;
  fileType: string;
  parseabilityStats: ParseabilityCheck['stats'] | null;
  totalProcessingTimeMs: number;
}

export interface PageExtractionResult {
  success: boolean;
  text: string;
  error?: string;
}

export interface PDFInfo {
  pageCount: number;
}

export interface EmbeddingGenerationResult {
  chunksProcessed: number;
  embeddings: number;
}

export interface MistralOCRResponse {
  pages?: Array<{
    markdown?: string;
    text?: string;
  }>;
  confidence?: number;
}

export interface MistralFileUploadResult {
  id?: string;
  file?: { id?: string };
  data?: { id?: string };
}

export interface ProcessingMetadata {
  method?: string;
  textLength?: number;
  processingTime?: number;
  sourceType?: string;
  title?: string | null;
  filename?: string | null;
}

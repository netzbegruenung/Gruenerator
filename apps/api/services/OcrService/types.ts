/**
 * Type definitions for OCR Service
 * Defines interfaces for PDF processing, OCR operations, and document extraction
 */

export interface DocumentLimits {
  pageCount?: number | undefined;
  fileSizeMB: number;
}

export interface ParseabilityCheck {
  isParseable: boolean;
  confidence: number;
  sampleText: string;
  stats: {
    totalPages?: number | undefined;
    sampledPages?: number | undefined;
    pagesWithText?: number | undefined;
    textDensity?: number | undefined;
    pageSuccessRate?: number | undefined;
    processingTimeMs?: number | undefined;
    error?: string | undefined;
  };
}

export interface ExtractionResult {
  text: string;
  pageCount: number;
  method: 'mistral-ocr' | 'docling' | 'direct' | 'pdfjs-dist';
  confidence?: number | undefined;
  stats?: {
    pages?: number | undefined;
    successfulPages?: number | undefined;
    processingTimeMs?: number | undefined;
    method?: string | undefined;
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
  error?: string | undefined;
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
    markdown?: string | undefined;
    text?: string | undefined;
  }>;
  confidence?: number | undefined;
}

export interface MistralFileUploadResult {
  id?: string | undefined;
  file?: { id?: string };
  data?: { id?: string };
}

export interface ProcessingMetadata {
  method?: string | undefined;
  textLength?: number | undefined;
  processingTime?: number | undefined;
  sourceType?: string | undefined;
  title?: string | null | undefined;
  filename?: string | null | undefined;
}

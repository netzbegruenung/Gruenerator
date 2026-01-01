/**
 * PDF processing utilities
 * Handles PDF download and text extraction via Mistral OCR
 */

import type { PdfProcessingOptions } from '../types.js';

/**
 * PDF extraction result
 */
export interface PdfExtractionResult {
  /** Extracted text content */
  text: string;
  /** Number of pages processed */
  pageCount?: number;
  /** PDF metadata */
  metadata?: Record<string, unknown>;
  /** Success status */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Extract text from PDF URL using Mistral OCR
 * Note: This is a wrapper that will use the mistralClient for OCR
 */
export async function extractPdfText(
  pdfUrl: string,
  options: PdfProcessingOptions = {}
): Promise<PdfExtractionResult> {
  try {
    // Import mistralClient dynamically to avoid circular dependencies
    const mistralClient = (await import('../../../workers/mistralClient.js')).default;

    // Note: This is a placeholder - actual PDF extraction should use PdfProcessor classes
    // This function is currently unused but kept for potential future use
    const text = `PDF extraction placeholder for ${pdfUrl}`;

    return {
      text,
      success: true,
    };
  } catch (error) {
    return {
      text: '',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if URL points to a PDF
 */
export function isPdfUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    return pathname.endsWith('.pdf') || urlObj.searchParams.has('pdf');
  } catch (e) {
    return url.toLowerCase().endsWith('.pdf');
  }
}

/**
 * Extract date from PDF filename (common patterns)
 */
export function extractDateFromFilename(filename: string): string | null {
  // Pattern: YYYY-MM-DD
  const isoDateMatch = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoDateMatch) {
    return `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`;
  }

  // Pattern: DD.MM.YYYY or DD_MM_YYYY
  const germanDateMatch = filename.match(/(\d{2})[._](\d{2})[._](\d{4})/);
  if (germanDateMatch) {
    return `${germanDateMatch[3]}-${germanDateMatch[2]}-${germanDateMatch[1]}`;
  }

  // Pattern: YYYYMMDD
  const compactDateMatch = filename.match(/(\d{4})(\d{2})(\d{2})/);
  if (compactDateMatch) {
    return `${compactDateMatch[1]}-${compactDateMatch[2]}-${compactDateMatch[3]}`;
  }

  return null;
}

/**
 * Check if PDF is older than a specific date based on filename
 */
export function isPdfOlderThan(filename: string, cutoffDate: Date): boolean {
  const extractedDate = extractDateFromFilename(filename);
  if (!extractedDate) return false;

  try {
    const pdfDate = new Date(extractedDate);
    return pdfDate < cutoffDate;
  } catch (e) {
    return false;
  }
}

/**
 * Sanitize PDF filename for use as document ID
 */
export function sanitizePdfFilename(filename: string): string {
  return filename
    .replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9äöüßÄÖÜ_-]/g, '_')
    .replace(/_+/g, '_')
    .trim();
}

/**
 * Extract PDF filename from URL
 */
export function extractPdfFilename(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop() || 'document.pdf';
    return decodeURIComponent(filename);
  } catch (e) {
    return 'document.pdf';
  }
}

/**
 * Validate PDF processing options
 */
export function validatePdfOptions(options: PdfProcessingOptions): boolean {
  if (options.maxPages !== undefined && options.maxPages < 1) {
    return false;
  }
  if (options.skipOlderThan !== undefined && !(options.skipOlderThan instanceof Date)) {
    return false;
  }
  return true;
}

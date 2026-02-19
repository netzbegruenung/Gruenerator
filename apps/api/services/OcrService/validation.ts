/**
 * Document validation utilities
 * Validates file sizes, page counts, and media types
 */

import { promises as fs } from 'fs';

import type { DocumentLimits } from './types.js';

/**
 * Validate document limits before processing
 */
export async function validateDocumentLimits(
  filePath: string,
  fileExtension: string,
  openPdfDocument: (path: string) => Promise<any>,
  maxPages: number = 1000
): Promise<DocumentLimits> {
  try {
    // Check file size (50MB limit for all files)
    const stats = await fs.stat(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    const maxSizeMB = 50;

    if (fileSizeMB > maxSizeMB) {
      throw new Error(
        `Das Dokument ist zu groß. Maximale Dateigröße: ${maxSizeMB}MB. ` +
          `Ihre Datei: ${fileSizeMB.toFixed(1)}MB.`
      );
    }

    // Check page count only for PDFs (1000 pages limit)
    if (fileExtension === '.pdf') {
      const pdfDoc = await openPdfDocument(filePath);
      const pageCount = pdfDoc.numPages;

      if (pageCount > maxPages) {
        throw new Error(
          `Das Dokument hat zu viele Seiten. Maximum: ${maxPages} Seiten. ` +
            `Ihr Dokument: ${pageCount} Seiten.`
        );
      }

      console.log(
        `[OCRService] Document validation passed: ${pageCount} pages, ${fileSizeMB.toFixed(1)}MB`
      );
      return { pageCount, fileSizeMB };
    }

    console.log(`[OCRService] Document validation passed: ${fileSizeMB.toFixed(1)}MB`);
    return { fileSizeMB };
  } catch (error) {
    console.error(`[OCRService] Document validation failed:`, (error as Error).message);
    throw error;
  }
}

/**
 * Get media type for file extension
 */
export function getMediaType(ext: string): string {
  const e = (ext || '').toLowerCase();
  if (e === '.pdf') return 'application/pdf';
  if (e === '.png') return 'image/png';
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
  if (e === '.webp') return 'image/webp';
  if (e === '.avif') return 'image/avif';
  if (e === '.docx')
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (e === '.pptx')
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  return 'application/octet-stream';
}

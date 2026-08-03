/**
 * Text extraction operations
 * Handles OCR extraction and content preview generation
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { ocrService } from '../../OcrService/index.js';

import type { UploadedFile } from './types.js';

/**
 * Upper bound for the full text kept on the document row. Web articles and
 * ordinary PDFs stay far below it; only outliers like plenary protocols get
 * truncated, and those are served by the Qdrant chunks anyway.
 */
export const MAX_STORED_TEXT_CHARS = 500_000;

/** Full extracted text as persisted alongside the document, size-capped. */
export function capStoredText(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  return text.length > MAX_STORED_TEXT_CHARS ? text.slice(0, MAX_STORED_TEXT_CHARS) : text;
}

/**
 * Generate a short, sentence-aware content preview
 */
export function generateContentPreview(text: string, limit: number = 600): string {
  if (!text || typeof text !== 'string') return '';
  if (text.length <= limit) return text;

  const truncated = text.slice(0, limit);
  const sentenceEnd = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?')
  );

  if (sentenceEnd > limit * 0.5) {
    return truncated.slice(0, sentenceEnd + 1);
  }

  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > limit * 0.6 ? `${truncated.slice(0, lastSpace)}...` : `${truncated}...`;
}

/**
 * Extract text from file buffer based on MIME type
 */
export async function extractTextFromFile(file: UploadedFile): Promise<string> {
  const supportedMistralTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/avif',
  ];

  if (supportedMistralTypes.includes(file.mimetype)) {
    const tempDir = os.tmpdir();
    const tempFileName = `manual_upload_${Date.now()}_${file.originalname}`;
    const tempFilePath = path.join(tempDir, tempFileName);

    await fs.writeFile(tempFilePath, file.buffer);

    try {
      const ocrResult = await ocrService.extractTextFromDocument(tempFilePath);
      return ocrResult.text;
    } catch (validationError: unknown) {
      if (
        validationError instanceof Error &&
        (validationError.message.includes('zu groß') ||
          validationError.message.includes('zu viele Seiten'))
      ) {
        throw validationError;
      }
      throw validationError;
    } finally {
      await fs.unlink(tempFilePath);
    }
  } else if (file.mimetype.startsWith('text/')) {
    return file.buffer.toString('utf-8');
  } else {
    throw new Error(
      `Dateityp nicht unterstützt: ${file.mimetype}. Unterstützt werden: PDF, Word (DOCX), PowerPoint (PPTX), Bilder (PNG, JPG, AVIF) und Textdateien.`
    );
  }
}

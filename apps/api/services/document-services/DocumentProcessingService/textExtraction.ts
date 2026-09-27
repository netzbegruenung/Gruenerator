/**
 * Text extraction operations
 * Handles OCR extraction and content preview generation
 */

import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { DOCUMENT_UPLOAD_FORMAT_HINT, resolveDocumentUploadFormat } from '@gruenerator/contracts';

import { ocrService } from '../../OcrService/index.js';
import { stripPageMarkers, type PageMarkerOptions } from '../../OcrService/pageMarkers.js';

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
  text = stripPageMarkers(text);
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

export interface FileExtraction {
  text: string;
  /** Aus der OCR-Kette; `null` für Textformate, die keine Seiten kennen. */
  pageCount: number | null;
  /** `pdfjs-direct`, `mistral-ocr`, `docling`; `null` für Textformate. */
  extractionMethod: string | null;
}

/** Nur der Text — für Aufrufer, die ihn Menschen oder dem Modell zeigen. */
export async function extractTextFromFile(file: UploadedFile): Promise<string> {
  return (await extractDocumentFromFile(file)).text;
}

/**
 * Extract text from a file buffer.
 *
 * The format is resolved from the filename first (see
 * `resolveDocumentUploadFormat`) — deciding on the mimetype alone used to fail
 * `.md` uploads, because browsers send those as an empty type and the deferred
 * pipeline then widens that to `application/octet-stream`.
 */
export async function extractDocumentFromFile(
  file: UploadedFile,
  options: PageMarkerOptions = {}
): Promise<FileExtraction> {
  const format = resolveDocumentUploadFormat(file.originalname, file.mimetype);

  if (format?.kind === 'ocr') {
    // The upload name never enters the path. `originalname` comes straight from
    // the client — `../../…` in it escaped os.tmpdir() and let a caller pick the
    // file that gets written and then unlinked. The extension still has to be
    // right (OcrService dispatches on it), so it comes from the closed format
    // registry, not from the name.
    const tempFileName = `manual_upload_${randomUUID()}${format.extension}`;
    const tempFilePath = path.join(os.tmpdir(), tempFileName);

    await fs.writeFile(tempFilePath, file.buffer);

    try {
      const ocrResult = await ocrService.extractTextFromDocument(tempFilePath, undefined, options);
      return {
        text: ocrResult.text,
        pageCount: typeof ocrResult.pageCount === 'number' ? ocrResult.pageCount : null,
        extractionMethod: ocrResult.extractionMethod ?? null,
      };
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
  } else if (format?.kind === 'text' || file.mimetype.startsWith('text/')) {
    return { text: file.buffer.toString('utf-8'), pageCount: null, extractionMethod: null };
  } else {
    const ext = path
      .extname(file.originalname || '')
      .toUpperCase()
      .replace('.', '');
    throw new Error(
      `${ext ? `${ext}-Dateien` : 'Dieser Dateityp'} können nicht gelesen werden. Unterstützt werden: ${DOCUMENT_UPLOAD_FORMAT_HINT}. Speichere das Dokument als PDF oder DOCX und lade es erneut hoch.`
    );
  }
}

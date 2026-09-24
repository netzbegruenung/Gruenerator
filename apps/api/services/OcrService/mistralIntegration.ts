/**
 * Mistral OCR API integration
 * Uses Mistral Document AI OCR 4 processor (mistral-ocr-4-0)
 *
 * Two entry points:
 * - extractTextWithMistralOCR(filePath) — reads file from disk
 * - extractBase64WithMistralOCR(base64, filename, mimeType) — accepts base64 directly (chat attachments)
 *
 * KEIN `tableFormat`. Die Antwort trägt Tabellen sonst NICHT im Markdown,
 * sondern als eigenes Asset in `page.tables[]` — im Markdown bleibt nur ein
 * Verweis `[tbl-0.html](tbl-0.html)`. Wir lesen aber ausschliesslich
 * `page.markdown`, also fiel jede Tabelle still unter den Tisch. Gemessen am
 * 24.08.2026 an einer Seite mit der Löschfristen-Tabelle: mit der Option 202
 * Zeichen und keine einzige Zelle, ohne sie 632 Zeichen mit der vollständigen
 * Tabelle als Markdown.
 *
 * Sie kam am 01.03.2026 herein („for OCR 3's improved table extraction") und
 * hat das Gegenteil bewirkt, weil der Leser nie nachgezogen wurde. Wer sie
 * wiederhaben will, muss zuerst `page.tables` einlesen und an der Stelle des
 * Verweises einsetzen — vorher ist sie ein stiller Datenverlust.
 */

import { promises as fs } from 'fs';
import path from 'path';

import { sanitizeFilename } from '../../utils/validation/security.js';

import { joinPagesWithMarkers, type PageMarkerOptions } from './pageMarkers.js';

import type { ExtractionResult } from './types.js';
import type { Mistral } from '@mistralai/mistralai';
import type {
  DocumentURLChunk,
  ImageURLChunk,
} from '@mistralai/mistralai/models/components/index.js';

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.tiff',
  '.bmp',
  '.heic',
  '.heif',
]);

/**
 * Mit `pageMarkers` trägt jede Seite ihre Nummer aus `page.index` — nicht
 * ihre Position unter den nicht-leeren Seiten, sonst rückte nach einer leeren
 * Seite jede weitere um eins nach vorn.
 */
function joinOcrPages(
  pages: ReadonlyArray<{ index: number; markdown: string }>,
  options: PageMarkerOptions
): string {
  if (options.pageMarkers) {
    return joinPagesWithMarkers(pages.map((p) => ({ page: p.index + 1, text: p.markdown })));
  }
  return pages
    .map((page) => page.markdown)
    .filter((text) => text.trim())
    .join('\n\n---\n\n');
}

/**
 * Extract text from document using Mistral OCR 4 API
 */
export async function extractTextWithMistralOCR(
  filePath: string,
  getMediaTypeFn: (ext: string) => string,
  options: PageMarkerOptions = {}
): Promise<ExtractionResult> {
  const startTime = Date.now();

  try {
    console.log(`[OcrService] Starting Mistral OCR 4 extraction for: ${filePath}`);

    const mod = await import('../ai/mistralClient.js');
    const mistralClient: Mistral = mod.default || mod;

    const fileBuffer = await fs.readFile(filePath);
    const base64Data = fileBuffer.toString('base64');
    const fileExtension = path.extname(filePath).toLowerCase();
    const mediaType = getMediaTypeFn(fileExtension);

    console.log(
      `[OcrService] Processing with Mistral OCR 4 (${(fileBuffer.length / 1024).toFixed(1)}KB, ${mediaType})`
    );

    const dataUri = `data:${mediaType};base64,${base64Data}`;

    const document: ImageURLChunk | DocumentURLChunk = IMAGE_EXTENSIONS.has(fileExtension)
      ? ({ type: 'image_url', imageUrl: dataUri } satisfies ImageURLChunk)
      : ({ type: 'document_url', documentUrl: dataUri } satisfies DocumentURLChunk);

    const ocrResponse = await mistralClient.ocr.process({
      model: 'mistral-ocr-4-0',
      document,
      includeImageBase64: false,
    });

    if (!ocrResponse.pages || ocrResponse.pages.length === 0) {
      throw new Error('No pages returned from Mistral OCR');
    }

    const allText = joinOcrPages(ocrResponse.pages, options);

    if (!allText.trim()) {
      throw new Error('No text extracted from document');
    }

    const processingTimeMs = Date.now() - startTime;
    console.log(
      `[OcrService] Mistral OCR 4 completed in ${processingTimeMs}ms: ${ocrResponse.pages.length} pages, ${allText.length} characters`
    );

    return {
      text: allText.trim(),
      pageCount: ocrResponse.pages.length,
      method: 'mistral-ocr',
      confidence: 0.95,
      stats: {
        pages: ocrResponse.pages.length,
        successfulPages: ocrResponse.usageInfo.pagesProcessed,
        method: ocrResponse.model || 'mistral-ocr-4-0',
      },
    };
  } catch (error) {
    const errorMessage = (error as Error).message;
    console.error('[OcrService] Mistral OCR failed:', errorMessage);
    throw new Error(`Mistral OCR extraction failed: ${errorMessage}`);
  }
}

const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/tiff',
  'image/bmp',
  'image/heic',
  'image/heif',
]);

/**
 * Extract text from base64-encoded document using Mistral OCR 4 API.
 * Accepts the base64 data directly (no file system read needed).
 * Used by the chat attachment pipeline where files arrive as base64.
 */
export async function extractBase64WithMistralOCR(
  base64Data: string,
  filename: string,
  mimeType: string,
  options: PageMarkerOptions = {}
): Promise<ExtractionResult> {
  filename = sanitizeFilename(filename, 'document');
  const startTime = Date.now();

  try {
    const sizeKB = (Math.ceil((base64Data.length * 3) / 4) / 1024).toFixed(1);
    console.log(
      `[OcrService] Starting Mistral OCR 4 base64 extraction for: ${filename} (~${sizeKB}KB, ${mimeType})`
    );

    const mod = await import('../ai/mistralClient.js');
    const mistralClient: Mistral = mod.default || mod;

    const dataUri = `data:${mimeType};base64,${base64Data}`;

    const document: ImageURLChunk | DocumentURLChunk = IMAGE_MIME_TYPES.has(mimeType)
      ? ({ type: 'image_url', imageUrl: dataUri } satisfies ImageURLChunk)
      : ({ type: 'document_url', documentUrl: dataUri } satisfies DocumentURLChunk);

    const ocrResponse = await mistralClient.ocr.process({
      model: 'mistral-ocr-4-0',
      document,
      includeImageBase64: false,
    });

    if (!ocrResponse.pages || ocrResponse.pages.length === 0) {
      throw new Error('No pages returned from Mistral OCR');
    }

    const allText = joinOcrPages(ocrResponse.pages, options);

    if (!allText.trim()) {
      throw new Error('No text extracted from document');
    }

    const processingTimeMs = Date.now() - startTime;
    console.log(
      `[OcrService] Mistral OCR 4 base64 completed in ${processingTimeMs}ms: ${ocrResponse.pages.length} pages, ${allText.length} characters`
    );

    return {
      text: allText.trim(),
      pageCount: ocrResponse.pages.length,
      method: 'mistral-ocr',
      confidence: 0.95,
      stats: {
        pages: ocrResponse.pages.length,
        successfulPages: ocrResponse.usageInfo.pagesProcessed,
        method: ocrResponse.model || 'mistral-ocr-4-0',
      },
    };
  } catch (error) {
    const errorMessage = (error as Error).message;
    const safeFilename = sanitizeFilename(filename, 'unknown');
    console.error('[OcrService] Mistral OCR base64 failed for %s: %s', safeFilename, errorMessage);
    throw new Error(`Mistral OCR extraction failed: ${errorMessage}`);
  }
}

/**
 * Liest nur ausgewählte Seiten einer PDF mit Mistral OCR — für Tabellenseiten,
 * deren pdfjs-Text die Spalten verliert. `pages` ist 1-basiert wie die
 * Seitenmarken; die API zählt ab 0 und gibt in `page.index` die Seite im
 * Dokument zurück, nicht die Position in der Auswahl (live geprüft am
 * 24.09.2026: `pages: [2, 3]` → `index` 2 und 3). Abgerechnet werden nur die
 * angefragten Seiten.
 */
export async function extractPagesWithMistralOCR(
  base64Data: string,
  mimeType: string,
  pages: readonly number[]
): Promise<Map<number, string>> {
  const mod = await import('../ai/mistralClient.js');
  const mistralClient: Mistral = mod.default || mod;

  const ocrResponse = await mistralClient.ocr.process({
    model: 'mistral-ocr-4-0',
    document: {
      type: 'document_url',
      documentUrl: `data:${mimeType};base64,${base64Data}`,
    } satisfies DocumentURLChunk,
    includeImageBase64: false,
    pages: pages.map((p) => p - 1),
  });

  return new Map((ocrResponse.pages ?? []).map((p) => [p.index + 1, p.markdown]));
}

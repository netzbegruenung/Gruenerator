/**
 * Mistral OCR API integration
 * Uses Mistral Document AI OCR 3 processor (mistral-ocr-latest / mistral-ocr-2512)
 */

import { promises as fs } from 'fs';
import path from 'path';

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
 * Extract text from document using Mistral OCR 3 API
 */
export async function extractTextWithMistralOCR(
  filePath: string,
  getMediaTypeFn: (ext: string) => string
): Promise<ExtractionResult> {
  const startTime = Date.now();

  try {
    console.log(`[OcrService] Starting Mistral OCR 3 extraction for: ${filePath}`);

    const mod = await import('../../workers/mistralClient.js');
    const mistralClient: Mistral = mod.default || mod;

    const fileBuffer = await fs.readFile(filePath);
    const base64Data = fileBuffer.toString('base64');
    const fileExtension = path.extname(filePath).toLowerCase();
    const mediaType = getMediaTypeFn(fileExtension);

    console.log(
      `[OcrService] Processing with Mistral OCR 3 (${(fileBuffer.length / 1024).toFixed(1)}KB, ${mediaType})`
    );

    const dataUri = `data:${mediaType};base64,${base64Data}`;

    const document: ImageURLChunk | DocumentURLChunk = IMAGE_EXTENSIONS.has(fileExtension)
      ? ({ type: 'image_url', imageUrl: dataUri } satisfies ImageURLChunk)
      : ({ type: 'document_url', documentUrl: dataUri } satisfies DocumentURLChunk);

    const ocrResponse = await mistralClient.ocr.process({
      model: 'mistral-ocr-latest',
      document,
      includeImageBase64: false,
      tableFormat: 'html',
    });

    if (!ocrResponse.pages || ocrResponse.pages.length === 0) {
      throw new Error('No pages returned from Mistral OCR');
    }

    const allText = ocrResponse.pages
      .map((page) => page.markdown)
      .filter((text) => text.trim())
      .join('\n\n---\n\n');

    if (!allText.trim()) {
      throw new Error('No text extracted from document');
    }

    const processingTimeMs = Date.now() - startTime;
    console.log(
      `[OcrService] Mistral OCR 3 completed in ${processingTimeMs}ms: ${ocrResponse.pages.length} pages, ${allText.length} characters`
    );

    return {
      text: allText.trim(),
      pageCount: ocrResponse.pages.length,
      method: 'mistral-ocr',
      confidence: 0.95,
      stats: {
        pages: ocrResponse.pages.length,
        successfulPages: ocrResponse.usageInfo.pagesProcessed,
        method: ocrResponse.model || 'mistral-ocr-latest',
      },
    };
  } catch (error) {
    const errorMessage = (error as Error).message;
    console.error('[OcrService] Mistral OCR failed:', errorMessage);
    throw new Error(`Mistral OCR extraction failed: ${errorMessage}`);
  }
}

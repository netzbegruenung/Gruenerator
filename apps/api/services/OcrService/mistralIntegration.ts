/**
 * Mistral OCR API integration
 * Uses the dedicated Mistral Document AI OCR processor (mistral-ocr-latest)
 */

import { promises as fs } from 'fs';
import path from 'path';

import type { ExtractionResult } from './types.js';

/**
 * Extract text from document using Mistral OCR API
 */
export async function extractTextWithMistralOCR(
  filePath: string,
  getMediaTypeFn: (ext: string) => string
): Promise<ExtractionResult> {
  const startTime = Date.now();

  try {
    console.log(`[OcrService] Starting Mistral OCR extraction for: ${filePath}`);

    // Dynamic import of Mistral client
    // @ts-expect-error - mistralClient is a JavaScript module without type declarations
    const mod = await import('../../workers/mistralClient.js');
    const mistralClient = mod.default || mod;

    // Read file and encode as base64
    const fileBuffer = await fs.readFile(filePath);
    const base64Data = fileBuffer.toString('base64');
    const fileExtension = path.extname(filePath).toLowerCase();
    const mediaType = getMediaTypeFn(fileExtension);

    console.log(
      `[OcrService] Processing with Mistral OCR (${(fileBuffer.length / 1024).toFixed(1)}KB, ${mediaType})`
    );

    // Determine document type based on file extension
    const isPdf = fileExtension === '.pdf';
    const isImage = [
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
    ].includes(fileExtension);
    const isDocument = ['.docx', '.pptx', '.txt', '.epub', '.rtf', '.odt'].includes(fileExtension);

    let document: { type: string; documentUrl?: string; imageUrl?: string };

    if (isImage) {
      // Use image_url for images
      document = {
        type: 'image_url',
        imageUrl: `data:${mediaType};base64,${base64Data}`,
      };
    } else {
      // Use document_url for PDFs and other documents
      document = {
        type: 'document_url',
        documentUrl: `data:${mediaType};base64,${base64Data}`,
      };
    }

    // Call Mistral OCR API
    const ocrResponse = await mistralClient.ocr.process({
      model: 'mistral-ocr-latest',
      document,
      includeImageBase64: false,
    });

    // Extract text from all pages
    if (!ocrResponse?.pages || ocrResponse.pages.length === 0) {
      throw new Error('No pages returned from Mistral OCR');
    }

    const allText = ocrResponse.pages
      .map((page: { markdown?: string; index: number }) => page.markdown || '')
      .filter((text: string) => text.trim())
      .join('\n\n---\n\n');

    if (!allText.trim()) {
      throw new Error('No text extracted from document');
    }

    const processingTimeMs = Date.now() - startTime;
    console.log(
      `[OcrService] Mistral OCR completed in ${processingTimeMs}ms: ${ocrResponse.pages.length} pages, ${allText.length} characters`
    );

    return {
      text: allText.trim(),
      pageCount: ocrResponse.pages.length,
      method: 'mistral-ocr',
      confidence: 0.95,
      stats: {
        pages: ocrResponse.pages.length,
        method: ocrResponse.model || 'mistral-ocr-latest',
        pagesProcessed: ocrResponse.usage_info?.pages_processed,
        docSizeBytes: ocrResponse.usage_info?.doc_size_bytes,
      },
    };
  } catch (error) {
    const errorMessage = (error as Error).message;
    console.error('[OcrService] Mistral OCR failed:', errorMessage);
    throw new Error(`Mistral OCR extraction failed: ${errorMessage}`);
  }
}

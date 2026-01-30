/**
 * Docling-Serve integration
 * Calls the self-hosted docling-serve sidecar container for document-to-markdown conversion.
 * See: https://github.com/docling-project/docling-serve
 */

import { promises as fs } from 'fs';
import path from 'path';

import type { ExtractionResult } from './types.js';

const DOCLING_BASE_URL = process.env.DOCLING_URL || 'http://ocr:5001';

/**
 * Extract text from a document using the Docling-Serve sidecar.
 * Sends the file as multipart/form-data to /v1/convert/file and
 * requests Markdown output (matching the format Mistral OCR produces).
 */
export async function extractTextWithDocling(filePath: string): Promise<ExtractionResult> {
  const startTime = Date.now();

  try {
    console.log(`[DoclingOCR] Starting extraction:`, { filePath });

    const fileBuffer = await fs.readFile(filePath);
    const fileName = path.basename(filePath);

    // Build multipart form with the file and conversion options
    const formData = new FormData();
    formData.append('files', new Blob([fileBuffer]), fileName);

    // Request markdown output to match the existing pipeline format
    const optionsPayload = JSON.stringify({
      to_formats: ['md'],
      image_export_mode: 'placeholder',
      do_ocr: true,
      force_ocr: false,
    });
    formData.append('options', new Blob([optionsPayload], { type: 'application/json' }));

    console.log(
      `[DoclingOCR] Sending to ${DOCLING_BASE_URL}/v1/convert/file (${fileBuffer.length} bytes)`
    );

    const response = await fetch(`${DOCLING_BASE_URL}/v1/convert/file`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown');
      throw new Error(`Docling API returned ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    // docling-serve returns { document: { md_content, filename, ... }, status, processing_time }
    const documents = result?.document ?? result?.documents ?? [result];
    const markdownParts: string[] = [];
    let totalPages = 0;

    for (const doc of Array.isArray(documents) ? documents : [documents]) {
      // The markdown content can be in different fields depending on the version
      const md = doc?.md_content ?? doc?.markdown ?? doc?.md ?? doc?.text ?? '';
      if (md.trim()) {
        markdownParts.push(md.trim());
      }
      totalPages += doc?.num_pages ?? doc?.page_count ?? 1;
    }

    const allText = markdownParts.join('\n\n---\n\n');

    if (!allText.trim()) {
      throw new Error('Docling returned no text content');
    }

    const processingTimeMs = Date.now() - startTime;
    console.log(
      `[DoclingOCR] Extraction completed in ${processingTimeMs}ms: ${totalPages} pages, ${allText.length} characters`
    );

    return {
      text: allText.trim(),
      pageCount: totalPages,
      method: 'docling',
      confidence: 0.9,
      stats: {
        pages: totalPages,
        successfulPages: totalPages,
        processingTimeMs,
        method: 'docling-serve',
      },
    };
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[DoclingOCR] Extraction FAILED after ${elapsed}ms:`, {
      errorMessage: error?.message,
      errorType: error?.constructor?.name,
      filePath,
    });
    throw new Error(`Docling extraction failed: ${error?.message}`);
  }
}

/**
 * Check if the Docling-Serve sidecar is healthy and reachable.
 */
export async function isDoclingAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${DOCLING_BASE_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

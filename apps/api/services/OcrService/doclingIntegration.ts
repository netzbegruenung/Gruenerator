/**
 * Docling-Serve integration
 * Calls the self-hosted docling-serve sidecar container for document-to-markdown conversion.
 * See: https://github.com/docling-project/docling-serve
 *
 * Two entry points:
 * - extractTextWithDocling(filePath) — reads file from disk
 * - extractBase64WithDocling(base64Data, filename) — accepts base64 directly (chat attachments)
 */

import { promises as fs } from 'fs';
import path from 'path';

import type { ExtractionResult } from './types.js';

const DOCLING_BASE_URL = process.env.DOCLING_URL || 'http://ocr:5001';

/**
 * Shared core: send a buffer to Docling-Serve and parse the markdown response.
 */
async function sendBufferToDocling(
  fileBuffer: Buffer,
  fileName: string,
  logPrefix: string
): Promise<ExtractionResult> {
  const startTime = Date.now();

  try {
    const formData = new FormData();
    formData.append('files', new Blob([new Uint8Array(fileBuffer)]), fileName);

    const optionsPayload = JSON.stringify({
      to_formats: ['md'],
      image_export_mode: 'placeholder',
      do_ocr: true,
      force_ocr: false,
    });
    formData.append('parameters', new Blob([optionsPayload], { type: 'application/json' }));

    console.log(
      `${logPrefix} Sending to ${DOCLING_BASE_URL}/v1/convert/file (${fileBuffer.length} bytes)`
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
      `${logPrefix} Completed in ${processingTimeMs}ms: ${totalPages} pages, ${allText.length} characters`
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
    console.error(`${logPrefix} FAILED after ${elapsed}ms:`, {
      errorMessage: error?.message,
      errorType: error?.constructor?.name,
      fileName,
    });
    throw new Error(`Docling extraction failed: ${error?.message}`);
  }
}

/**
 * Extract text from a file on disk using Docling-Serve.
 */
export async function extractTextWithDocling(filePath: string): Promise<ExtractionResult> {
  console.log(`[DoclingOCR] Starting extraction:`, { filePath });
  const fileBuffer = await fs.readFile(filePath);
  const fileName = path.basename(filePath);
  return sendBufferToDocling(fileBuffer, fileName, '[DoclingOCR]');
}

/**
 * Extract text from a base64-encoded document using Docling-Serve.
 * Used by the chat attachment pipeline where files arrive as base64.
 */
export async function extractBase64WithDocling(
  base64Data: string,
  filename: string
): Promise<ExtractionResult> {
  const sizeKB = (Math.ceil((base64Data.length * 3) / 4) / 1024).toFixed(1);
  console.log(`[DoclingOCR:base64] Starting extraction for: ${filename} (~${sizeKB}KB)`);
  const fileBuffer = Buffer.from(base64Data, 'base64');
  return sendBufferToDocling(fileBuffer, filename, '[DoclingOCR:base64]');
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

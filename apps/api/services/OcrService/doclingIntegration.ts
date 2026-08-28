/**
 * Docling document conversion via GreenPT's hosted Documents API.
 *
 * Same engine as before (Docling), different host: the self-hosted
 * `docling-serve` sidecar was replaced by `api.greenpt.ai/v1/tools/documents`.
 * That removes the 8 GB OCR container from every deployment and the async
 * submit → long-poll → fetch-result dance with it — GreenPT answers the
 * conversion synchronously on one request.
 *
 * Two entry points:
 * - extractTextWithDocling(filePath) — reads file from disk
 * - extractBase64WithDocling(base64Data, filename) — accepts base64 directly (chat attachments)
 */

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import { env } from '../../config/env.js';

import type { ExtractionResult } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const GREENPT_DOCUMENTS_URL = 'https://api.greenpt.ai/v1/tools/documents/convert/file';

interface DoclingDoc {
  md_content?: string;
  markdown?: string;
  md?: string;
  text?: string;
  num_pages?: number;
  page_count?: number;
}

interface DoclingResponse {
  document?: DoclingDoc;
  documents?: DoclingDoc[];
  status?: string;
  errors?: unknown[];
  processing_time?: number;
  md_content?: string;
  markdown?: string;
  md?: string;
  text?: string;
  num_pages?: number;
  page_count?: number;
}

/**
 * Shared core: POST a buffer to the GreenPT Documents API and parse the
 * markdown response. Bounded by DOCLING_MAX_WAIT_MS.
 */
async function sendBufferToDocling(
  fileBuffer: Buffer,
  fileName: string,
  logPrefix: string
): Promise<ExtractionResult> {
  const startTime = Date.now();
  const maxWaitMs = env.DOCLING_MAX_WAIT_MS;

  // process.env at call time, so tests that unset the key take effect against
  // the import-time-cached `env` module.
  const apiKey = process.env.GREENPT_API_KEY;
  if (!apiKey) {
    throw new Error('Docling extraction failed: GREENPT_API_KEY is not configured');
  }

  try {
    const formData = new FormData();
    formData.append('files', new Blob([new Uint8Array(fileBuffer)]), fileName);
    // Flat form fields, not a `parameters` JSON blob — the GreenPT endpoint
    // reads each option as its own multipart field.
    formData.append('to_formats', 'md');
    formData.append('image_export_mode', 'placeholder');
    formData.append('do_ocr', 'true');
    formData.append('force_ocr', 'false');
    formData.append('do_table_structure', 'true');
    formData.append('table_mode', 'accurate');

    console.log(
      `${logPrefix} Converting via ${GREENPT_DOCUMENTS_URL} (${fileBuffer.length} bytes, deadline=${maxWaitMs}ms)`
    );

    const res = await fetch(GREENPT_DOCUMENTS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(maxWaitMs),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'unknown');
      throw new Error(`GreenPT documents API returned ${res.status}: ${errorText.slice(0, 500)}`);
    }

    const result = (await res.json()) as DoclingResponse;

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
      // The API reports per-document failures in `errors` while still answering
      // 200 — without this they would surface as an empty document.
      const errors = Array.isArray(result?.errors) ? JSON.stringify(result.errors) : '';
      throw new Error(
        `Docling returned no text content (status=${result?.status ?? 'unknown'})${errors ? `: ${errors.slice(0, 500)}` : ''}`
      );
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
        method: 'greenpt-docling',
      },
    };
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`${logPrefix} FAILED after ${elapsed}ms:`, {
      errorMessage: errMsg,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      fileName,
    });
    throw new Error(`Docling extraction failed: ${errMsg}`);
  }
}

/**
 * Extract text from a file on disk using Docling.
 */
export async function extractTextWithDocling(filePath: string): Promise<ExtractionResult> {
  const allowedBases = [
    path.resolve(os.tmpdir()),
    path.resolve(__dirname, '../../uploads'),
    path.resolve(__dirname, '../../storage'),
  ];
  let safePath: string | null = null;
  for (const base of allowedBases) {
    const resolved = path.resolve(base, path.relative(base, path.resolve(filePath)));
    if (resolved.startsWith(base + path.sep)) {
      safePath = resolved;
      break;
    }
  }
  if (!safePath) {
    throw new Error('File path outside allowed directories');
  }

  console.log(`[DoclingOCR] Starting extraction:`, { filePath: safePath });
  const fileBuffer = await fs.readFile(safePath);
  const fileName = path.basename(safePath);
  return sendBufferToDocling(fileBuffer, fileName, '[DoclingOCR]');
}

/**
 * Extract text from a base64-encoded document using Docling.
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
 * Whether Docling extraction can be attempted at all.
 *
 * A key check, not a network probe: the old sidecar needed one because a
 * container can be up-but-unhealthy, whereas the only local precondition for
 * the hosted API is the credential. A probe request would cost a round-trip
 * before every conversion and still not predict the real one.
 */
export async function isDoclingAvailable(): Promise<boolean> {
  return Boolean(process.env.GREENPT_API_KEY);
}

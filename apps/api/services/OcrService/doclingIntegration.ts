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
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import { env } from '../../config/env.js';

import type { ExtractionResult } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCLING_BASE_URL = env.DOCLING_URL ?? 'http://ocr:5001';

// Long-poll window per status request. Docling-serve blocks server-side up to this
// long and returns early on terminal state, so short jobs don't pay polling latency
// and long jobs cost ~1 HTTP round-trip per POLL_WAIT_SECONDS.
const POLL_WAIT_SECONDS = 5;

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
  processing_time?: number;
  md_content?: string;
  markdown?: string;
  md?: string;
  text?: string;
  num_pages?: number;
  page_count?: number;
}

type TaskStatus = 'pending' | 'started' | 'success' | 'failure';

interface TaskStatusResponse {
  task_id?: string;
  task_status?: TaskStatus;
}

interface AsyncSubmitResponse {
  task_id?: string;
  task_status?: TaskStatus;
}

/**
 * Submit an async conversion job. Returns the task_id assigned by docling-serve.
 */
async function submitAsyncJob(formData: FormData, signal: AbortSignal): Promise<string> {
  const res = await fetch(`${DOCLING_BASE_URL}/v1/convert/file/async`, {
    method: 'POST',
    body: formData,
    signal,
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => 'unknown');
    throw new Error(`Docling async submit returned ${res.status}: ${errorText}`);
  }
  const body = (await res.json()) as AsyncSubmitResponse;
  if (!body.task_id) {
    throw new Error('Docling async submit response missing task_id');
  }
  return body.task_id;
}

/**
 * Long-poll the task status until terminal, then fetch and return the conversion result.
 * The shared AbortSignal lets the outer deadline cancel an in-flight long-poll immediately.
 */
async function pollUntilDone(
  taskId: string,
  deadlineMs: number,
  signal: AbortSignal,
  logPrefix: string
): Promise<DoclingResponse> {
  while (Date.now() < deadlineMs) {
    const statusRes = await fetch(
      `${DOCLING_BASE_URL}/v1/status/poll/${taskId}?wait=${POLL_WAIT_SECONDS}`,
      { signal }
    );
    if (!statusRes.ok) {
      const errorText = await statusRes.text().catch(() => 'unknown');
      throw new Error(`Docling status poll returned ${statusRes.status}: ${errorText}`);
    }
    const status = (await statusRes.json()) as TaskStatusResponse;

    if (status.task_status === 'success') {
      const resultRes = await fetch(`${DOCLING_BASE_URL}/v1/result/${taskId}`, { signal });
      if (!resultRes.ok) {
        const errorText = await resultRes.text().catch(() => 'unknown');
        throw new Error(`Docling result fetch returned ${resultRes.status}: ${errorText}`);
      }
      return (await resultRes.json()) as DoclingResponse;
    }
    if (status.task_status === 'failure') {
      throw new Error(`Docling task ${taskId} reported failure`);
    }
    console.log(`${logPrefix} task=${taskId} status=${status.task_status ?? 'unknown'}, polling`);
  }
  throw new Error(`Docling task ${taskId} exceeded client deadline`);
}

/**
 * Shared core: submit a buffer to Docling-Serve via the async API, poll until the
 * conversion finishes, then parse the markdown response. Bounded by DOCLING_MAX_WAIT_MS.
 */
async function sendBufferToDocling(
  fileBuffer: Buffer,
  fileName: string,
  logPrefix: string
): Promise<ExtractionResult> {
  const startTime = Date.now();
  const maxWaitMs = env.DOCLING_MAX_WAIT_MS;
  const deadlineMs = startTime + maxWaitMs;
  const abort = new AbortController();
  const deadlineTimer = setTimeout(() => abort.abort(), maxWaitMs);

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
      `${logPrefix} Submitting async job to ${DOCLING_BASE_URL}/v1/convert/file/async (${fileBuffer.length} bytes, deadline=${maxWaitMs}ms)`
    );

    const taskId = await submitAsyncJob(formData, abort.signal);
    console.log(`${logPrefix} task=${taskId} submitted, polling`);

    const result = await pollUntilDone(taskId, deadlineMs, abort.signal, logPrefix);

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
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`${logPrefix} FAILED after ${elapsed}ms:`, {
      errorMessage: errMsg,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      fileName,
    });
    throw new Error(`Docling extraction failed: ${errMsg}`);
  } finally {
    clearTimeout(deadlineTimer);
  }
}

/**
 * Extract text from a file on disk using Docling-Serve.
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

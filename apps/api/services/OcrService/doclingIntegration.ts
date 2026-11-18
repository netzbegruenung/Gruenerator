/**
 * Docling document conversion via GreenPT's hosted Documents API.
 *
 * Same engine as before (Docling), different host: the self-hosted
 * `docling-serve` sidecar was replaced by `api.greenpt.ai/v1/tools/documents`.
 * That removes the 8 GB OCR container from every deployment and the async
 * submit → long-poll → fetch-result dance with it — GreenPT answers the
 * conversion synchronously on one request.
 *
 * Entry points:
 * - extractTextWithDocling(filePath) — reads file from disk
 * - extractBase64WithDocling(base64Data, filename) — accepts base64 directly (chat attachments)
 * - extractPagesWithDocling(buffer, filename, pages) — einzelne Seiten mit
 *   Seitenzuordnung, für Tabellenseiten und Scans im Scraper-Ingest
 */

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import { PDFDocument } from 'pdf-lib';

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
class DoclingHttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

async function sendBufferToDocling(
  fileBuffer: Buffer,
  fileName: string,
  logPrefix: string,
  extraFields: ReadonlyArray<[string, string]> = []
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
    for (const [key, value] of extraFields) formData.append(key, value);

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
      throw new DoclingHttpError(
        res.status,
        `GreenPT documents API returned ${res.status}: ${errorText.slice(0, 500)}`
      );
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
    if (error instanceof DoclingHttpError) {
      throw new DoclingHttpError(error.status, `Docling extraction failed: ${errMsg}`);
    }
    throw new Error(`Docling extraction failed: ${errMsg}`);
  }
}

/**
 * Seitenweise Umwandlung für den Scraper-Ingest: Tabellenseiten und Seiten
 * ohne Textschicht, die sonst an Mistral OCR gingen.
 *
 * Bei PDFs mit Textschicht liest Docling (`force_ocr=false`) die Werte aus
 * der Textschicht und baut nur die Tabellenstruktur — gemessen an 34
 * Tabellenseiten aus PARDOK (04.11.2026): keine einzige Zahl, die nicht im PDF
 * steht, und verloren gingen nur Kopf- und Fusszeilen.
 *
 * Aufeinanderfolgende Seiten gehen als ein Lauf in eine Anfrage. Hochgeladen
 * wird nur der Lauf: die Seiten werden lokal in ein eigenes kleines PDF
 * geschnitten — sonst ginge die ganze Datei je Lauf hoch (200 MB für eine
 * Seite, und Dateien über GreenPTs 125-MB-Grenze wären gar nicht lesbar, #5358).
 * Kann pdf-lib die Datei nicht öffnen, geht wie früher die ganze Datei mit
 * `page_range` hoch. Die Antwort wird an `md_page_break_placeholder` wieder
 * in Seiten zerlegt. Stimmt die Zahl der Teile nicht mit der Zahl der Seiten
 * überein, fällt der Lauf weg und die Seiten behalten ihren pdfjs-Text — eine
 * falsch zugeordnete Seite wäre schlimmer als eine Tabelle als Fliesstext.
 *
 * GreenPTs Kontingent (600 Anfragen je 15 min) gilt je Konto und teilt sich
 * mit Websuche und Reranking der Produktion. Deshalb höchstens eine Anfrage
 * je `GREENPT_DOCLING_INTERVAL_MS` in diesem Prozess (Vorgabe 3 s = die
 * Hälfte des Kontingents), und ein 429 wartet, statt die Seiten aufzugeben.
 */
const PAGE_BREAK = '<!-- gruenerator-page-break -->';
/** Grössere Läufe werden geteilt: eine Anfrage bleibt so unter dem Zeitlimit. */
const MAX_PAGES_PER_REQUEST = 25;
/** Unter 1,5 s wäre das ganze Kontingent weg — dann bliebe der Produktion nichts. */
const FLOOR_REQUEST_INTERVAL_MS = 1_500;
const RATE_LIMIT_WAITS_MS = [60_000, 120_000, 300_000];

let nextRequestAt = 0;

async function takeRequestSlot(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextRequestAt);
  nextRequestAt = at + Math.max(env.GREENPT_DOCLING_INTERVAL_MS, FLOOR_REQUEST_INTERVAL_MS);
  if (at > now) await new Promise((resolve) => setTimeout(resolve, at - now));
}

/** Aufeinanderfolgende Seiten zu Läufen, jeder höchstens `MAX_PAGES_PER_REQUEST` lang. */
export function pageRuns(pages: readonly number[]): number[][] {
  const runs: number[][] = [];
  for (const page of [...new Set(pages)].sort((a, b) => a - b)) {
    const run = runs[runs.length - 1];
    if (run && page === run[run.length - 1] + 1 && run.length < MAX_PAGES_PER_REQUEST) {
      run.push(page);
    } else {
      runs.push([page]);
    }
  }
  return runs;
}

/**
 * Docling füllt Tabellenzellen mit Leerzeichen auf Spaltenbreite auf. Das
 * kostet bei breiten Tabellen ein Vielfaches an Zeichen, und die Zerlegung
 * hält eine Tabelle nur bis 1800 Zeichen zusammen.
 */
export function compactMarkdownTables(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return line;
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim());
      const separator = cells.every((cell) => /^:?-+:?$/.test(cell));
      return `| ${cells.map((cell) => (separator ? '---' : cell)).join(' | ')} |`;
    })
    .join('\n');
}

/** Die Seiten des Laufs (1-basiert) als eigenes PDF. */
async function cutRun(source: PDFDocument, run: readonly number[]): Promise<Buffer> {
  const cut = await PDFDocument.create();
  const copied = await cut.copyPages(
    source,
    run.map((page) => page - 1)
  );
  for (const page of copied) cut.addPage(page);
  return Buffer.from(await cut.save());
}

async function convertRun(
  fileBuffer: Buffer,
  source: PDFDocument | null,
  fileName: string,
  run: readonly number[]
): Promise<string> {
  const upload = source ? await cutRun(source, run) : fileBuffer;
  const fields: Array<[string, string]> = [['md_page_break_placeholder', PAGE_BREAK]];
  if (!source) {
    fields.push(['page_range', String(run[0])], ['page_range', String(run[run.length - 1])]);
  }
  for (let attempt = 0; ; attempt++) {
    await takeRequestSlot();
    try {
      const result = await sendBufferToDocling(upload, fileName, '[DoclingOCR:pages]', fields);
      return result.text ?? '';
    } catch (error: unknown) {
      const wait = RATE_LIMIT_WAITS_MS[attempt];
      if (!(error instanceof DoclingHttpError && error.status === 429) || wait === undefined) {
        throw error;
      }
      console.warn(`[DoclingOCR:pages] 429 from GreenPT, waiting ${wait / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

async function loadPdf(fileBuffer: Buffer, fileName: string): Promise<PDFDocument | null> {
  try {
    return await PDFDocument.load(fileBuffer, { ignoreEncryption: true, updateMetadata: false });
  } catch (error: unknown) {
    console.warn(
      '[DoclingOCR:pages] %s: pdf-lib cannot open the file, uploading it whole with page_range:',
      fileName,
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

/**
 * Markdown je Seite (1-basiert) für genau diese Seiten. Scheitert eine Anfrage,
 * wirft die Funktion — der Aufrufer entscheidet, ob der pdfjs-Text bleibt.
 */
export async function extractPagesWithDocling(
  fileBuffer: Buffer,
  fileName: string,
  pages: readonly number[]
): Promise<Map<number, string>> {
  const byPage = new Map<number, string>();
  const source = await loadPdf(fileBuffer, fileName);
  for (const run of pageRuns(pages)) {
    const parts = (await convertRun(fileBuffer, source, fileName, run)).split(PAGE_BREAK);
    if (parts.length !== run.length) {
      console.warn(
        `[DoclingOCR:pages] ${fileName} pages ${run[0]}-${run[run.length - 1]}: ${parts.length} parts for ${run.length} pages, keeping pdfjs text`
      );
      continue;
    }
    run.forEach((page, i) => byPage.set(page, compactMarkdownTables(parts[i].trim())));
  }
  return byPage;
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

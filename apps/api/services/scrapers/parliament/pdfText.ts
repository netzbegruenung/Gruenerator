/**
 * PDF eines Parlamentsdokuments holen und mit Seitenmarken auslesen — derselbe
 * Weg für jeden Landtag, damit „OCR nur wo nötig" und der Rückfall bei einem
 * OCR-Ausfall an einer Stelle stehen.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { BRAND } from '../../../utils/domainUtils.js';
import { createLogger } from '../../../utils/logger.js';
import { ocrService } from '../../OcrService/index.js';
import { recordExtraction } from '../extractionRecorder.js';

import { type PoliteGate } from './concurrency.js';

const log = createLogger('parliamentPdf');

const PDF_TIMEOUT_MS = 120_000;
const DOWNLOAD_ATTEMPTS = 3;
/** Pause vor dem zweiten Ausleseversuch — Mistral OCR antwortet zeitweise mit 503. */
const EXTRACTION_RETRY_MS = 15_000;

/** `BaseScraper.fetchWithRetry`, von außen hereingereicht. */
export type Fetcher = (
  url: string,
  options: { timeout?: number; userAgent?: string; headers?: Record<string, string> }
) => Promise<Response>;

export interface PdfText {
  text: string;
  method: string;
  pageCount: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * `fetchWithRetry` wiederholt nur den Verbindungsaufbau. Reißt die Verbindung
 * beim Lesen des Inhalts ab („terminated"), käme das als endgültiger Fehler
 * an — deshalb wird hier der ganze Abruf samt Inhalt wiederholt.
 */
export async function downloadPdf(
  gate: PoliteGate,
  fetcher: Fetcher,
  url: string
): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      const buffer = await gate.run(async () => {
        const res = await fetcher(url, {
          timeout: PDF_TIMEOUT_MS,
          userAgent: BRAND.botUserAgent,
          headers: { Accept: 'application/pdf' },
        });
        return Buffer.from(await res.arrayBuffer());
      });
      if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
        throw new Error(`not a PDF (${buffer.length} bytes)`);
      }
      return buffer;
    } catch (error: unknown) {
      if (attempt >= DOWNLOAD_ATTEMPTS) throw error;
      await sleep(2000 * attempt);
    }
  }
}

/**
 * PDF.js liest jede Seite; nur Tabellenseiten und Scans gehen an Mistral OCR
 * (`OcrService.applyTablePages`). Die Seitenmarken braucht es dafür und für
 * `page_number` je Chunk.
 *
 * Scheitert das zweimal — Mistral OCR antwortet zeitweise mit 503 und nimmt
 * keine Datei über 50 MB (Antworten mit eingescannten Anlagen erreichen
 * 100 MB) —, bleibt der Text, den PDF.js allein findet. Ein Teil des Textes
 * ist besser als ein Dokument, das bei jedem Lauf erneut scheitert;
 * `extraction_method: 'pdfjs-fallback'` macht solche Dokumente für eine
 * spätere Nachbearbeitung mit `--force` auffindbar.
 */
export async function extractPdfText(buffer: Buffer, label: string): Promise<PdfText> {
  const tempPath = path.join(
    os.tmpdir(),
    `parliament_${crypto.randomBytes(8).toString('hex')}.pdf`
  );
  fs.writeFileSync(tempPath, buffer);
  try {
    const result = await extractWithFallback(tempPath, label);
    recordExtraction({ method: result.method, pages: result.pageCount });
    return result;
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

async function extractWithFallback(pdfPath: string, label: string): Promise<PdfText> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await ocrService.extractTextFromDocument(pdfPath, undefined, {
        pageMarkers: true,
      });
      return {
        text: result.text ?? '',
        method: result.extractionMethod,
        pageCount: result.pageCount,
      };
    } catch (error: unknown) {
      lastError = error;
      if (attempt === 1) await sleep(EXTRACTION_RETRY_MS);
    }
  }

  const { getPdfJs, openPdfDocument, extractTextDirectlyFromPDF } =
    await import('../../OcrService/pdfOperations.js');
  const { applyMarkdownFormatting } = await import('../../OcrService/textFormatting.js');
  const pdfjsLib: unknown = await getPdfJs();
  const direct = await extractTextDirectlyFromPDF(
    pdfPath,
    (p: string) => openPdfDocument(p, pdfjsLib),
    applyMarkdownFormatting,
    undefined,
    { pageMarkers: true }
  );
  if (!direct.text?.trim()) throw lastError;
  log.warn(
    `${label}: extraction failed (${lastError instanceof Error ? lastError.message.split('\n')[0] : String(lastError)}), kept PDF.js text only`
  );
  return { text: direct.text, method: 'pdfjs-fallback', pageCount: direct.pageCount };
}

/**
 * In-process counter for document extraction during a content-sync run.
 *
 * Extraction — PDF.js parse, and for scans a Mistral-OCR run billed per page —
 * is the expensive step of the sync. Whether the fingerprint gates in
 * `utils/binaryFingerprint.ts` actually keep a PDF from being read a second
 * time is not visible in `stored/updated/skipped`: a document skipped *after*
 * extraction and one skipped *before* it look identical there, while only the
 * second one costs nothing.
 *
 * So the counters split exactly along that line:
 *   - `documents` / `pages` — what was read this run (`ocr*`: the paid part).
 *   - `redundant` — read, and the text turned out unchanged. Work that bought
 *     nothing; this is the number the gates exist to drive toward zero.
 *   - `skipped` — kept out of extraction, by which gate.
 *
 * Recorded at the scraper call sites, not inside OcrService: the same service
 * serves chat uploads and notebook ingest, and in the long-lived API process
 * those would otherwise be counted as sync work.
 *
 * Draining is mandatory — see the same contract in `syncEventRecorder.ts`.
 */

/** Which gate kept a document out of extraction. */
export type ExtractionGate =
  /** HTTP 304 — the server confirmed the stored ETag/Last-Modified. */
  | 'not_modified'
  /** The downloaded bytes hash to the stored `file_hash`. */
  | 'same_bytes'
  /** Layer-1 age/recency gate; the document was never fetched at all. */
  | 'freshly_indexed';

const GATES: ExtractionGate[] = ['not_modified', 'same_bytes', 'freshly_indexed'];

export interface ExtractionStats {
  /** Documents whose content was extracted in this run. */
  documents: number;
  /** Pages behind `documents` — the unit OCR is billed in. */
  pages: number;
  /** Subset of `documents` that went through the paid OCR path. */
  ocrDocuments: number;
  /** Subset of `pages` that went through the paid OCR path. */
  ocrPages: number;
  /** Extracted, then found textually unchanged — the extraction bought nothing. */
  redundant: number;
  /** Documents kept out of extraction, by gate. */
  skipped: Record<ExtractionGate, number>;
}

function emptyStats(): ExtractionStats {
  return {
    documents: 0,
    pages: 0,
    ocrDocuments: 0,
    ocrPages: 0,
    redundant: 0,
    skipped: { not_modified: 0, same_bytes: 0, freshly_indexed: 0 },
  };
}

let stats = emptyStats();

/**
 * A document was read. `method` is the extractor's own label; everything
 * containing "ocr" counts as the paid path, so a new provider label does not
 * silently drop out of the cost figure.
 */
export function recordExtraction(input: { method: string; pages?: number | undefined }): void {
  const pages = Number.isFinite(input.pages) ? Math.max(0, input.pages as number) : 0;
  stats.documents += 1;
  stats.pages += pages;
  if (input.method.toLowerCase().includes('ocr')) {
    stats.ocrDocuments += 1;
    stats.ocrPages += pages;
  }
}

/** The text of an already-extracted document turned out to be unchanged. */
export function recordRedundantExtraction(): void {
  stats.redundant += 1;
}

/** A gate kept a document out of extraction. */
export function recordExtractionSkip(gate: ExtractionGate): void {
  stats.skipped[gate] += 1;
}

/** Returns the current counters and resets them. */
export function drainExtractionStats(): ExtractionStats {
  const drained = stats;
  stats = emptyStats();
  return drained;
}

/** Sum several runs' counters (matrix jobs each write their own summary). */
export function mergeExtractionStats(parts: (ExtractionStats | undefined)[]): ExtractionStats {
  return parts.filter((p): p is ExtractionStats => !!p).reduce(addStats, emptyStats());
}

function addStats(acc: ExtractionStats, part: ExtractionStats): ExtractionStats {
  acc.documents += part.documents;
  acc.pages += part.pages;
  acc.ocrDocuments += part.ocrDocuments;
  acc.ocrPages += part.ocrPages;
  acc.redundant += part.redundant;
  for (const gate of GATES) {
    acc.skipped[gate] += part.skipped?.[gate] ?? 0;
  }
  return acc;
}

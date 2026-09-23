/**
 * The PDF branch's third gate (#3576), mirroring the HTML branch's
 * rejectedUrlGate usage (LandesverbandScraper.ts ~647-685): a PDF
 * DocumentProcessor already rejected as too_old is remembered so it is not
 * downloaded and OCRed again on every run.
 *
 * Own module so the partitioning rule can be tested without loading the
 * scraper — see resultSamples.ts for the same reasoning.
 *
 * `gated` re-decides the remembered rejection against the source's *current*
 * maxAgeYears rather than trusting it as a static blocklist, so widening the
 * limit brings the PDF back on the next run instead of needing the table
 * purged by hand (see rejectedUrlGate.ts).
 */
import { DateExtractor } from './extractors/DateExtractor.js';

import type { DateExtractionResult, PdfLink } from './types.js';

/** A PdfLink after DateExtractor.extractDateFromPdfInfo has run over it. */
export type DatedPdfLink = PdfLink & { dateInfo: DateExtractionResult };

export interface PdfAgePartition {
  /** Remembered as too_old in a previous run and still too old under maxAgeYears — skipped before any fetch. */
  gated: DatedPdfLink[];
  /** Dated this run and older than maxAgeYears (not previously remembered). */
  tooOld: DatedPdfLink[];
  /** No date could be extracted from URL/title/context. */
  undated: DatedPdfLink[];
  /** Recent enough — eligible for download/OCR. */
  candidates: DatedPdfLink[];
}

export function partitionPdfLinksByAge(
  pdfLinks: readonly DatedPdfLink[],
  rejectedUrls: ReadonlyMap<string, string>,
  maxAgeYears: number
): PdfAgePartition {
  const partition: PdfAgePartition = { gated: [], tooOld: [], undated: [], candidates: [] };

  for (const pdf of pdfLinks) {
    const rejectedPublishedAt = rejectedUrls.get(pdf.url);
    if (
      rejectedPublishedAt &&
      DateExtractor.isDateTooOld(new Date(rejectedPublishedAt), maxAgeYears)
    ) {
      partition.gated.push(pdf);
      continue;
    }

    if (pdf.dateInfo.isTooOld === true) partition.tooOld.push(pdf);
    else if (pdf.dateInfo.isTooOld === null) partition.undated.push(pdf);
    else partition.candidates.push(pdf);
  }

  return partition;
}

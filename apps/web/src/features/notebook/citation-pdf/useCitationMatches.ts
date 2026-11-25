import { useEffect, useRef, useState } from 'react';

import { matchPassageOnPage, type PassageMatch } from './passageMatch';
import { loadPageTextContent, textItemsOf } from './pdfDocument';

import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface PdfMarkInput {
  /** Page the ingest recorded for the chunk; often missing (e.g. Landesverband PDFs). */
  page: number | null;
  /** Texts to look for, most precise first (the quoted words, then the chunk). */
  texts: string[];
}

export type MarkLocation =
  | { status: 'searching' }
  | { status: 'found'; page: number; match: PassageMatch }
  /** The page is known, the passage is not on it (or the page has no text layer). */
  | { status: 'page-only'; page: number; reason: 'not-found' | 'no-text' }
  | { status: 'missing' };

/** Pages a file is searched across when the chunk names none. */
const MAX_SCAN_PAGES = 400;

function candidatePages(page: number | null, numPages: number): number[] {
  if (page && page >= 1 && page <= numPages) {
    // Chunk page numbers can be off by one where a passage straddles a break.
    return [page, page + 1, page - 1].filter((p) => p >= 1 && p <= numPages);
  }
  return Array.from({ length: Math.min(numPages, MAX_SCAN_PAGES) }, (_, i) => i + 1);
}

/**
 * Locates each citation of one document in the PDF. Known pages are checked
 * first and alone; a full scan only runs for chunks without a page, stops at
 * the first hit, and shares the per-page text cache with the text layer.
 */
export function useCitationMatches(
  doc: PDFDocumentProxy | null,
  marks: PdfMarkInput[],
  /** Searched first, so the citation on screen is not waiting behind the others. */
  activeIndex: number
): MarkLocation[] {
  const key = JSON.stringify(marks);
  const activeRef = useRef(activeIndex);
  useEffect(() => {
    activeRef.current = activeIndex;
  }, [activeIndex]);
  // Results belong to one document and one set of marks; anything else reads
  // as still searching, so a stale result never shows for a new citation set.
  const [result, setResult] = useState<{
    doc: PDFDocumentProxy | null;
    key: string;
    locations: MarkLocation[];
  } | null>(null);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    const parsed = JSON.parse(key) as PdfMarkInput[];
    const searching = (): MarkLocation[] => parsed.map(() => ({ status: 'searching' }));
    const update = (fn: (locations: MarkLocation[]) => MarkLocation[]) =>
      setResult((prev) => ({
        doc,
        key,
        locations: fn(prev && prev.doc === doc && prev.key === key ? prev.locations : searching()),
      }));

    void (async () => {
      const first = Math.min(Math.max(activeRef.current, 0), parsed.length - 1);
      const order = [first, ...parsed.keys()].filter((i, pos, all) => all.indexOf(i) === pos);
      for (const i of order) {
        const mark = parsed[i]!;
        let location: MarkLocation = { status: 'missing' };
        let noTextOnly = true;
        for (const p of candidatePages(mark.page, doc.numPages)) {
          const items = textItemsOf(await loadPageTextContent(doc, p));
          if (cancelled) return;
          for (const text of mark.texts) {
            const result = matchPassageOnPage(items, text);
            if (result.kind === 'found') {
              location = { status: 'found', page: p, match: result.match };
              break;
            }
            if (result.kind === 'not-found') noTextOnly = false;
          }
          if (location.status === 'found') break;
        }
        if (location.status === 'missing' && mark.page && mark.page <= doc.numPages) {
          location = {
            status: 'page-only',
            page: mark.page,
            reason: noTextOnly ? 'no-text' : 'not-found',
          };
        }
        const settled = location;
        update((prev) => prev.map((l, j) => (j === i ? settled : l)));
      }
    })().catch(() => {
      if (!cancelled) update((prev) => prev.map(() => ({ status: 'missing' })));
    });

    return () => {
      cancelled = true;
    };
  }, [doc, key]);

  if (result && result.doc === doc && result.key === key) return result.locations;
  return marks.map(() => ({ status: 'searching' }));
}

/**
 * Finds a cited passage in the text layer of one PDF page.
 *
 * The passage comes from our chunk text, which is not the PDF's text: the
 * ingest turns headings into `#` lines, leaves `<!-- image -->` markers where
 * pictures were, and joins hyphenated line breaks. The PDF text layer has the
 * raw line breaks, hyphens and ligatures. Both sides are therefore reduced to
 * letters and digits before comparing, and a miss on the whole passage falls
 * back to matching its pieces in order.
 *
 * A weak match marks nothing: highlighting the wrong lines is worse than
 * showing the page without a mark.
 */

export interface PdfTextItem {
  str: string;
}

/** Inclusive range of text item indices on the page. */
export interface PassageMatch {
  start: number;
  end: number;
}

export type PageMatchResult =
  | { kind: 'found'; match: PassageMatch }
  | { kind: 'not-found' }
  /** The page carries (almost) no text: a scan without a text layer. */
  | { kind: 'no-text' };

const PIECE = 24;
const MIN_NEEDLE = 12;
/** Share of pieces that must be found, in order, for a partial match. */
const MIN_PIECE_SHARE = 0.5;
/** A partial match may not spread wider than this multiple of the passage. */
const MAX_SPREAD = 1.6;
const MIN_PAGE_TEXT = 20;

const KEEP = /[\p{L}\p{N}]/u;

function foldChar(ch: string): string {
  // NFKD splits ligatures (ﬁ → fi) and keeps umlauts comparable either way.
  return ch.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Letters and digits only, lowercased — the form both sides are compared in. */
export function normalizePassage(text: string): string {
  const cleaned = text
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^#{1,6}\s+/gm, ' ')
    .replace(/\*\*|__/g, ' ');
  let out = '';
  for (const ch of cleaned) {
    for (const f of foldChar(ch)) if (KEEP.test(f)) out += f;
  }
  return out;
}

/** The page's normalized text with, per character, the text item it came from. */
function normalizePage(items: PdfTextItem[]): { text: string; owner: number[] } {
  let text = '';
  const owner: number[] = [];
  items.forEach((item, index) => {
    for (const ch of item.str) {
      for (const f of foldChar(ch)) {
        if (!KEEP.test(f)) continue;
        text += f;
        owner.push(index);
      }
    }
  });
  return { text, owner };
}

function toItems(owner: number[], from: number, toExclusive: number): PassageMatch {
  return { start: owner[from]!, end: owner[toExclusive - 1]! };
}

function partialMatch(hay: string, needle: string): [number, number] | null {
  const pieces: string[] = [];
  for (let i = 0; i + PIECE <= needle.length; i += PIECE) pieces.push(needle.slice(i, i + PIECE));
  if (pieces.length < 2) return null;

  // Try each occurrence of a piece as the anchor; keep the run that finds the
  // most pieces in order within the allowed spread.
  let best: { found: number; from: number; to: number } | null = null;
  const limit = needle.length * MAX_SPREAD;
  for (let p = 0; p < pieces.length; p++) {
    let anchor = hay.indexOf(pieces[p]!);
    while (anchor !== -1) {
      let found = 1;
      let cursor = anchor + PIECE;
      let to = cursor;
      for (let q = p + 1; q < pieces.length; q++) {
        const at = hay.indexOf(pieces[q]!, cursor);
        if (at === -1 || at + PIECE - anchor > limit) continue;
        found++;
        cursor = at + PIECE;
        to = cursor;
      }
      if (!best || found > best.found) best = { found, from: anchor, to };
      anchor = hay.indexOf(pieces[p]!, anchor + 1);
    }
  }
  if (!best || best.found / pieces.length < MIN_PIECE_SHARE) return null;
  return [best.from, best.to];
}

export function matchPassageOnPage(items: PdfTextItem[], passage: string): PageMatchResult {
  const { text, owner } = normalizePage(items);
  if (text.length < MIN_PAGE_TEXT) return { kind: 'no-text' };

  const needle = normalizePassage(passage);
  if (needle.length < MIN_NEEDLE) return { kind: 'not-found' };

  const exact = text.indexOf(needle);
  if (exact !== -1) {
    return { kind: 'found', match: toItems(owner, exact, exact + needle.length) };
  }
  const partial = partialMatch(text, needle);
  if (partial) return { kind: 'found', match: toItems(owner, partial[0], partial[1]) };
  return { kind: 'not-found' };
}

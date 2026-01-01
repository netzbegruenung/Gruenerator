/**
 * Page marker processing utilities
 * Handles splitting text by page markers and building page ranges
 */

import type { PageWithText, PageRange, PageMarker } from './types.js';

/**
 * Split text by page markers (## Seite N)
 * Returns array of pages with their text
 */
export function splitTextByPageMarkers(text: string): PageWithText[] {
  // Match page markers anywhere; robust even if line breaks were collapsed
  const regex = /##\s*Seite\s+(\d+)/gi;
  const pages: PageWithText[] = [];

  const markers: PageMarker[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    markers.push({
      page: parseInt(match[1], 10),
      index: match.index,
      length: match[0].length
    });
  }

  if (markers.length === 0) return [];

  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    const nextStart = (i + 1 < markers.length) ? markers[i + 1].index : text.length;
    const segment = text.slice(m.index + (m.length || 0), nextStart);
    pages.push({
      pageNumber: m.page,
      textWithoutMarker: segment.trim()
    });
  }

  return pages;
}

/**
 * Build page ranges from raw text
 * Returns start/end positions for each page
 */
export function buildPageRangesFromRaw(text: string): PageRange[] {
  const ranges: PageRange[] = [];
  if (!text) return ranges;

  const re = /##\s*Seite\s+(\d+)/gi;
  const matches: PageMarker[] = [];
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    matches.push({
      page: parseInt(m[1], 10),
      index: m.index,
      length: m[0].length
    });
  }

  if (matches.length === 0) return ranges;

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + (matches[i].length || 0);
    const end = (i + 1 < matches.length) ? matches[i + 1].index : text.length;
    ranges.push({
      page: matches[i].page,
      start,
      end
    });
  }

  return ranges;
}

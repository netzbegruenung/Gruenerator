/**
 * Turn document HTML into a plain-text excerpt for native previews.
 *
 * Document content arrives as raw HTML (the web renders it directly via the DOM).
 * React Native has no DOM, so we strip tags and decode the common entities to get a
 * lightweight text snippet — used by both the start-page "Zuletzt" cards and the
 * Docs tab grid.
 */
export function htmlToExcerpt(html: string, max = 180): string {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    // Decode &amp; LAST so e.g. "&amp;lt;" stays literal "&lt;" (avoids double-unescaping).
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export interface DocPreviewContent {
  heading: string | null;
  body: string;
}

/**
 * Recover lightweight structure from document HTML for a native preview: the first
 * heading (h1–h6) becomes a title, the remaining text the body. Lets the preview
 * render with visual hierarchy instead of one flat block of text.
 */
export function parseDocPreview(html: string): DocPreviewContent {
  const headingMatch = html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  const heading = headingMatch ? htmlToExcerpt(headingMatch[1], 80) : '';

  let body = htmlToExcerpt(html, 260);
  // The full-text strip includes the heading; drop it so the body doesn't repeat it.
  if (heading && body.startsWith(heading)) {
    body = body.slice(heading.length).trim();
  }

  return { heading: heading || null, body };
}

/** Tag-free, entity-decoded, whitespace-collapsed text of an HTML fragment. */
function cellText(html: string): string {
  return htmlToExcerpt(html, Number.POSITIVE_INFINITY);
}

/**
 * The leading rows of a table preview — the `<table data-preview="sheet">` the
 * Hocuspocus server writes for sheets, or a legacy 'tabelle' document's own
 * table. Regex, not DOM: React Native has none. A table cut off by the list
 * endpoint's excerpt limit keeps its complete rows.
 */
export function parseTablePreview(html: string, maxRows = 5, maxCols = 4): string[][] {
  const table = /<table\b[^>]*>([\s\S]*?)(?:<\/table>|$)/i.exec(html)?.[1];
  if (!table) return [];

  const rows: string[][] = [];
  for (const [, row] of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    if (rows.length >= maxRows) break;
    const cells = Array.from(row.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi))
      .slice(0, maxCols)
      .map(([, cell]) => cellText(cell));
    if (cells.length > 0) rows.push(cells);
  }

  return rows.some((row) => row.some((cell) => cell.length > 0)) ? rows : [];
}

/**
 * Slide titles from a presentation's preview — the server writes
 * `<ol data-preview="slides" data-total="N"><li>…</li></ol>` on every store.
 */
export function parseSlidesPreview(html: string): { titles: string[]; total: number } {
  const list = /<ol\b([^>]*\bdata-preview="slides"[^>]*)>([\s\S]*?)(?:<\/ol>|$)/i.exec(html);
  if (!list) return { titles: [], total: 0 };
  const titles = Array.from(list[2].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)).map(([, li]) =>
    cellText(li)
  );
  const total = Number(/\bdata-total="(\d+)"/.exec(list[1])?.[1]) || titles.length;
  return { titles, total };
}

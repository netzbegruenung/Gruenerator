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
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
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

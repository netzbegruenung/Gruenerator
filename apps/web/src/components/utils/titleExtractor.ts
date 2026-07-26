/**
 * Utility functions for extracting titles and generating filenames from HTML content
 */

/**
 * Extract a clean title from HTML content (first H2 header)
 * @param content - HTML content to extract from
 * @param fallbackTitle - Fallback title if no H2 found
 * @returns Clean title suitable for display
 */
export const extractTitleFromContent = (
  content: string | null | undefined,
  fallbackTitle = 'Unbenanntes Dokument'
): string => {
  const h2Match = content?.match(/<h2[^>]*>(.*?)<\/h2>/i);
  if (h2Match && h2Match[1]) {
    const title = h2Match[1]
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .trim();

    if (title.length > 0) {
      return title;
    }
  }

  return fallbackTitle;
};

/**
 * Only the characters a filesystem rejects. Spaces survive: the title path
 * always kept them, and "Antrag Radverkehr.pdf" reads better than the
 * underscores the content path used to produce.
 */
const sanitizeFilename = (name: string): string =>
  name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 80)
    .replace(/^[_.\s]+|[_.\s]+$/g, '');

/**
 * Name the download after the document, not after whatever heading happens to
 * come first.
 *
 * The H2 used to win over the title the caller passed, so a document called
 * "Social-Media-Trendscout" whose first section reads "🔥 Aktuelle virale
 * Themen" downloaded as the latter. The title is the name a user gave the
 * thing; the H2 is only a guess for content that never had one (generator
 * output, pasted text).
 *
 * `fallback` counts as "no title": callers pass `docData.title || 'Dokument'`,
 * so an untitled document arrives here as the fallback string itself and should
 * still get the H2 rather than being called "Dokument".
 *
 * Sanitising now covers both sources. It did not before — a title went out raw,
 * so a slash in it produced a broken download.
 *
 * @param content - HTML content, searched for an H2 when there is no title
 * @param title - The document's own title; wins when set
 * @param fallback - Used when neither exists
 * @returns Sanitized filename (without extension)
 */
export const extractFilenameFromContent = (
  content: string | null | undefined,
  title?: string,
  fallback = 'Dokument'
): string => {
  const named = title?.trim();
  const chosen =
    named && named !== fallback ? named : extractTitleFromContent(content, named || fallback);

  return sanitizeFilename(chosen) || fallback;
};

/**
 * Strip HTML tags from a string and decode common HTML entities.
 * Works in both Node.js and browser environments (regex-based, no DOM dependency).
 *
 * Replaces 10+ duplicate implementations across the codebase.
 */
export function stripHtmlTags(html: string | null | undefined): string {
  if (!html) return '';

  return (
    html
      // Convert <br> to newline before stripping tags
      .replace(/<br\s*\/?>/gi, '\n')
      // Strip all HTML tags
      .replace(/<[^>]+>/g, '')
      // Decode common HTML entities (order matters: &amp; last to prevent double-decoding)
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#34;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&ldquo;/gi, '\u201C')
      .replace(/&rdquo;/gi, '\u201D')
      .replace(/&amp;/gi, '&')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

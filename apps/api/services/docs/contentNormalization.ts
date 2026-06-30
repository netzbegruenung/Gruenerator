import { MarkdownService } from '../markdown/MarkdownService.js';

// A leading paragraph whose entire content is a single bold run — e.g.
// `<p><strong>PRESSEMITTEILUNG</strong></p>`. The `\s*<\/p>` tail (no text after
// the bold) keeps this to bold-ONLY paragraphs, so an emphasised word at the
// start of a sentence is never mistaken for a heading. Backreference \1 forbids
// mismatched <strong>…</b>. Anchored at `^` so only the document's first block
// is eligible.
const LEADING_BOLD_PARAGRAPH =
  /^\s*<p(?:\s[^>]*)?>\s*<(strong|b)(?:\s[^>]*)?>([\s\S]*?)<\/\1>\s*<\/p>/i;

/**
 * Promotes a faux-heading to a real `<h1>`. AI generators (and pasted content)
 * sometimes lead with a bold run instead of a heading element; stored as-is it
 * seeds a plain paragraph, leaving the editor outline, exports, and the recent-
 * docs preview with no heading to anchor on (the bold collapses into the body and
 * glues onto the next block). When the content has NO heading at all, rewrite a
 * leading bold-only paragraph as `<h1>` so the headline is structural everywhere.
 *
 * The Yjs block injector only recognises `h1`–`h3`, so promote to `<h1>`.
 */
export function promoteLeadingBoldToHeading(html: string): string {
  if (/<h[1-6][\s/>]/i.test(html)) return html;
  return html.replace(LEADING_BOLD_PARAGRAPH, (match, _tag, inner: string) =>
    inner.trim() ? `<h1>${inner.trim()}</h1>` : match
  );
}

/**
 * Normalizes free-form content (HTML, markdown, or plain prose) to HTML
 * suitable for storage in `collaborative_documents.content` and for seeding
 * Yjs state via `seedYjsState`.
 *
 * Plain prose is treated as valid markdown — `marked` wraps it as `<p>prose</p>`,
 * which is exactly what the Yjs HTML-block injector needs.
 */
export function ensureHtml(content: string): string {
  if (!content?.trim()) return '';
  const html = content.trim().startsWith('<')
    ? content
    : new MarkdownService().markdownToHtml(content);
  return promoteLeadingBoldToHeading(html);
}

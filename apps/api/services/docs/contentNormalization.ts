import { MarkdownService } from '../markdown/MarkdownService.js';

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
  if (content.trim().startsWith('<')) return content;
  return new MarkdownService().markdownToHtml(content);
}

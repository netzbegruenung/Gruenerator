import { type Document } from './docsApi';

/**
 * Which shape of document row you are holding.
 *
 * `/docs?preview=true` answers with `content_excerpt` and no `content`; the
 * single-document endpoint answers with `content` and no excerpt; and a backend
 * that predates the flag answers the list with full `content` too. So "is this
 * row complete?" cannot be read off the endpoint it came from — only off the
 * row.
 *
 * Type-only import of `Document`, which keeps this module free of `docsApi`'s
 * native dependencies (expo-file-system, expo-sharing) and therefore testable.
 */

/**
 * True when the row carries the document's actual body.
 *
 * The one question that matters before handing a row to anything that reads its
 * content: a preview row would satisfy an `id` lookup while carrying nothing but
 * a truncated excerpt, and an editor that saved that back would destroy the
 * document.
 */
export function isFullDocument(doc: Document | undefined | null): doc is Document {
  return doc != null && doc.content != null;
}

/**
 * The HTML a card preview should render, or undefined when there is none.
 *
 * Excerpt first, body as the fallback — the fallback is what keeps a build that
 * ships ahead of the backend deploy (mobile updates over the air) from losing
 * every document preview on the Arbeiten tab.
 */
export function docPreviewHtml(doc: Document): string | undefined {
  return doc.content_excerpt ?? doc.content;
}

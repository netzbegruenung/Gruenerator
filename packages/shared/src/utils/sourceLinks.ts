/**
 * Source links: `[Titel](quelle:N)` — a markdown link whose target is the
 * answer's citation N, not a URL.
 *
 * The chat model writes it when it names a document by its title (listing
 * sources, "welche Titel gibt es"). It never sees the URL, so it cannot invent
 * one; the renderer resolves N through the answer's citations and opens the
 * in-app reader, the chunk panel or the original URL. The backend renumbers N
 * together with `[N]` markers, so both forms stay attached to the same source.
 *
 * Shared by the API (renumbering, out-of-range strip, prompt) and every
 * renderer (web, mobile, copy/export) — one wire format, one definition.
 */

export const SOURCE_LINK_SCHEME = 'quelle';

// Label: no `]` or newline, bounded. N: a citation id, bounded like the
// `[N]` marker renderer's MAX_CITATION_ID.
const SOURCE_LINK_SOURCE = `\\[([^\\]\\n]{1,300})\\]\\(${SOURCE_LINK_SCHEME}:(\\d{1,3})\\)`;

/** Fresh regex per use — the `g` flag makes shared instances stateful.
 *  Groups: 1 = label, 2 = citation id. */
export function sourceLinkRegex(): RegExp {
  return new RegExp(SOURCE_LINK_SOURCE, 'g');
}

/** The citation id a link target points at, or `null` for any other href. */
export function parseSourceLinkHref(href: string | null | undefined): number | null {
  if (!href) return null;
  const match = new RegExp(`^${SOURCE_LINK_SCHEME}:(\\d{1,3})$`).exec(href.trim());
  if (!match) return null;
  const id = Number(match[1]);
  return id >= 1 ? id : null;
}

/** `[Titel](quelle:3)` → `Titel [3]` — for plain-text surfaces (copy, export)
 *  that understand citation markers but not the link form. */
export function sourceLinksToCitations(text: string): string {
  return text.replace(sourceLinkRegex(), (_whole, label: string, id: string) => `${label} [${id}]`);
}

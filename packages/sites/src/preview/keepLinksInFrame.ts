/**
 * A srcdoc frame resolves every href against the app's URL, so a default navigation would load
 * the app (or a 404) inside the frame. In-page anchors scroll the frame instead; every other
 * link does nothing in the preview.
 */
export function keepLinksInFrame(doc: Document, event: Event): void {
  const anchor = (event.target as Element | null)?.closest?.('a[href]');
  if (!anchor) return;
  event.preventDefault();
  const href = anchor.getAttribute('href') ?? '';
  if (!href.startsWith('#') || href.length < 2) return;
  doc.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ block: 'start' });
}

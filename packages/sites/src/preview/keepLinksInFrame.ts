/**
 * A srcdoc frame resolves every href against the app's URL, so a default navigation would load
 * the app (or a 404) inside the frame. In-page anchors scroll the frame instead; every other
 * link does nothing in the preview. Inside a field edited in place, no link is followed.
 */
export function keepLinksInFrame(doc: Document, event: Event): void {
  const anchor = (event.target as Element | null)?.closest?.('a[href]');
  if (!anchor) return;
  event.preventDefault();
  // A click into a field edited in place (a link text, an e-mail, a phone number) places the
  // caret; following the link, even within the page, would jump away from it.
  if ((event.target as Element | null)?.closest?.('[data-inline-edit]')) return;
  const href = anchor.getAttribute('href') ?? '';
  if (!href.startsWith('#') || href.length < 2) return;
  doc.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ block: 'start' });
}

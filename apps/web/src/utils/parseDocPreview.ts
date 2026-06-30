// Recover lightweight structure from document HTML for previews: the first
// heading (h1–h6) becomes the title, the remaining text the body — mirroring the
// mobile DocPreview so all surfaces show the same legible excerpt instead of a
// shrunken raw render. We have a real DOM here, so removing the heading node
// before reading textContent keeps the body from repeating the title.
export const parseDocPreview = (html: string): { heading: string | null; body: string } => {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

  // Prefer a semantic heading (h1–h6). Many docs — notably AI-generated press
  // releases — instead lead with a bold run (<strong>) used as a faux-heading,
  // so fall back to that: a leading bold whose text the body starts with. Without
  // it the faux-heading collapses into the grey body (textContent strips <strong>)
  // and glues onto the next block with no separating space.
  let headingEl = tmp.querySelector<HTMLElement>('h1, h2, h3, h4, h5, h6');
  if (!headingEl) {
    const boldEl = tmp.querySelector<HTMLElement>('strong, b');
    const boldText = norm(boldEl?.textContent);
    if (boldEl && boldText && norm(tmp.textContent).startsWith(boldText)) {
      headingEl = boldEl;
    }
  }

  const heading = norm(headingEl?.textContent);
  headingEl?.remove();
  const body = norm(tmp.textContent);
  return { heading: heading || null, body };
};

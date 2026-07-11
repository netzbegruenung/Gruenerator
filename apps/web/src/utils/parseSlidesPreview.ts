// Recover slide titles from a presentation's preview HTML — the Hocuspocus
// server writes `<ol data-preview="slides" data-total="N"><li>…</li></ol>`
// into `content` on every store (same approach as parseTablePreview).
export const parseSlidesPreview = (html: string): { titles: string[]; total: number } => {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const list = tmp.querySelector('ol[data-preview="slides"]');
  if (!list) return { titles: [], total: 0 };
  const titles = Array.from(list.querySelectorAll('li')).map((li) =>
    (li.textContent ?? '').replace(/\s+/g, ' ').trim()
  );
  const total = Number(list.getAttribute('data-total')) || titles.length;
  return { titles, total };
};

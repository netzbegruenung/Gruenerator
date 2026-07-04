// Recover a small grid of cell text from a "tabelle" document's HTML for the
// recent-card preview. Docs store TipTap HTML, so the first <table> holds the
// data; we read it with a real DOM (same approach as parseDocPreview) and clamp
// to a preview-sized window. Returns [] when there's no usable table, letting
// the caller fall back to an empty-grid schematic.
export const parseTablePreview = (html: string, maxRows = 5, maxCols = 4): string[][] => {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  const table = tmp.querySelector('table');
  if (!table) return [];

  const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

  const rows: string[][] = [];
  for (const tr of Array.from(table.querySelectorAll('tr')).slice(0, maxRows)) {
    const cells = Array.from(tr.querySelectorAll('th, td'))
      .slice(0, maxCols)
      .map((cell) => norm(cell.textContent));
    if (cells.length > 0) rows.push(cells);
  }

  // Drop entirely-empty rows so the schematic fallback triggers for blank tables.
  return rows.some((row) => row.some((cell) => cell.length > 0)) ? rows : [];
};

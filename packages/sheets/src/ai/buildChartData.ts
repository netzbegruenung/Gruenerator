/** Chart config stored as the float-DOM `data` payload (Serializable, persisted
 * in the workbook snapshot). Rendered by SheetChartFloat with Recharts. */
export interface SheetChartData {
  chartType: 'bar' | 'line' | 'area' | 'pie' | 'donut';
  title: string;
  /** Field name used for the x-axis / slice labels (first column header). */
  categoryKey: string;
  /** Numeric series (the remaining column headers). */
  seriesKeys: string[];
  /** Recharts rows: `{ [categoryKey]: label, [seriesKey]: number, ... }`. */
  rows: Array<Record<string, string | number>>;
}

type Cell = string | number | boolean | null;

function toLabel(v: Cell | undefined, fallback: string): string {
  if (v === null || v === undefined || v === '') return fallback;
  return String(v);
}

function toNumber(v: Cell | undefined): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  // Tolerate localized/formatted strings ("1.234,50", "1,234.50", "25%").
  const cleaned = String(v ?? '')
    .replace(/[%\s€$£]/g, '')
    .replace(/\.(?=\d{3}\b)/g, '')
    .replace(',', '.');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Turn a rectangular range (row 0 = headers, column 0 = category labels, the
 * rest = numeric series) into a Recharts-ready chart config. Pure and
 * Univer-free so it is unit-testable; the caller passes LOGICAL cell values
 * (getCellDatas().v), not display strings.
 */
export function buildChartData(
  values: Cell[][],
  chartType: SheetChartData['chartType'],
  title: string
): SheetChartData {
  const header = values[0] ?? [];
  const categoryKey = toLabel(header[0], 'Kategorie');
  const rawSeries = header.slice(1).map((h, i) => toLabel(h, `Reihe ${i + 1}`));
  // De-duplicate series names so Recharts keys stay unique.
  const seen = new Map<string, number>();
  const seriesKeys = rawSeries.map((name) => {
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    return n === 0 ? name : `${name} (${n + 1})`;
  });

  const rows: Array<Record<string, string | number>> = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r] ?? [];
    const label = toLabel(row[0], `Zeile ${r}`);
    const entry: Record<string, string | number> = { [categoryKey]: label };
    seriesKeys.forEach((key, i) => {
      entry[key] = toNumber(row[i + 1] ?? null);
    });
    rows.push(entry);
  }

  return { chartType, title, categoryKey, seriesKeys, rows };
}

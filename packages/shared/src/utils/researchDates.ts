export interface DateRange {
  date_from?: string;
  date_to?: string;
}

export interface DatePreset {
  label: string;
  range: DateRange;
}

export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Local calendar day `n` days before `now`, as ISO date. */
export const daysAgo = (now: Date, n: number) =>
  isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n));

/** The time-range presets of the results toolbar — shared with the query parser. */
export function datePresets(now: Date): DatePreset[] {
  const year = now.getFullYear();
  return [
    { label: 'Jederzeit', range: {} },
    { label: 'Letzte 30 Tage', range: { date_from: daysAgo(now, 30) } },
    { label: 'Letzte 12 Monate', range: { date_from: daysAgo(now, 365) } },
    { label: String(year), range: { date_from: `${year}-01-01`, date_to: `${year}-12-31` } },
    {
      label: String(year - 1),
      range: { date_from: `${year - 1}-01-01`, date_to: `${year - 1}-12-31` },
    },
  ];
}

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y: y!, m: m!, d: d! };
};

const monthName = (m: number, y: number) =>
  new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('de-DE', { month: 'long', timeZone: 'UTC' });

/** "13.–15. November 2026", "30. Oktober – 2. November 2026", "13. November 2026". */
export function formatDateRange(startsOn: string, endsOn: string): string {
  const a = parse(startsOn);
  const b = parse(endsOn);
  if (a.y === b.y && a.m === b.m) {
    return a.d === b.d
      ? `${a.d}. ${monthName(a.m, a.y)} ${a.y}`
      : `${a.d}.–${b.d}. ${monthName(a.m, a.y)} ${a.y}`;
  }
  if (a.y === b.y) {
    return `${a.d}. ${monthName(a.m, a.y)} – ${b.d}. ${monthName(b.m, b.y)} ${a.y}`;
  }
  return `${a.d}. ${monthName(a.m, a.y)} ${a.y} – ${b.d}. ${monthName(b.m, b.y)} ${b.y}`;
}

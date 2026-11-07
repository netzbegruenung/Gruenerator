/** „vor 2 Std." / „vor 1 Tag" — leer, wenn das Datum fehlt oder nicht lesbar ist. */
export function timeAgo(iso: string | null, now: number = Date.now()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const min = Math.max(1, Math.round((now - t) / 60000));
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return d === 1 ? 'vor 1 Tag' : `vor ${d} Tagen`;
}

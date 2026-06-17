/**
 * Format a date string to relative German format ("Gestern", "Vor 3 Tagen",
 * "12.01.2025"). Ported from web's `apps/web/src/utils/dateFormatter.ts` so the
 * notebook "Zuletzt hinzugefügt" cards read the same on mobile.
 */
export function formatRelativeDate(dateString: string | Date): string {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'Gerade eben';
  if (diffMinutes < 60) return `Vor ${diffMinutes} ${diffMinutes === 1 ? 'Minute' : 'Minuten'}`;
  if (diffHours < 24) return `Vor ${diffHours} ${diffHours === 1 ? 'Stunde' : 'Stunden'}`;
  if (diffDays === 1) return 'Gestern';
  if (diffDays < 7) return `Vor ${diffDays} ${diffDays === 1 ? 'Tag' : 'Tagen'}`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `Vor ${weeks} ${weeks === 1 ? 'Woche' : 'Wochen'}`;
  }
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

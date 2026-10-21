/** Unsplash allows the shared key 50 searches an hour; below this the count is shown. */
const LOW_REMAINING = 10;

function clockTime(date: Date): string {
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/** Says why the Unsplash search stopped and when it works again. */
export function UnsplashLimitNotice({ retryAt }: { retryAt: Date }) {
  return (
    <div
      role="status"
      className="flex flex-col gap-1 rounded-lg px-3 py-2.5 bg-[var(--editor-tile)] text-xs text-[var(--editor-text)]"
    >
      <strong className="text-[13px]">Unsplash-Suche gerade ausgeschöpft</strong>
      <span className="text-[var(--editor-text-muted)] [text-wrap:pretty]">
        Der Grünerator teilt sich 50 Unsplash-Suchen pro Stunde. Wieder möglich ab ca.{' '}
        {clockTime(retryAt)} Uhr. Die eingebauten Fotos funktionieren weiter.
      </span>
    </div>
  );
}

/** A quiet hint once the hourly Unsplash budget runs low. */
export function UnsplashRemaining({ remaining }: { remaining: number | null }) {
  if (remaining === null || remaining > LOW_REMAINING) return null;
  return (
    <p className="m-0 text-[11px] text-[var(--editor-text-muted)]">
      Noch {remaining} {remaining === 1 ? 'Unsplash-Suche' : 'Unsplash-Suchen'} in dieser Stunde
    </p>
  );
}

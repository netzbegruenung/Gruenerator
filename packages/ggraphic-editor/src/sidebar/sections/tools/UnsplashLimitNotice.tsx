// SPDX-License-Identifier: MPL-2.0
import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import { useMessages } from '@ggraphic/editor/i18n/messages';

/** Unsplash allows the shared key 50 searches an hour; below this the count is shown. */
const LOW_REMAINING = 10;

function clockTime(date: Date): string {
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/** Says why the Unsplash search stopped and when it works again. */
export function UnsplashLimitNotice({ retryAt }: { retryAt: Date }) {
  const t = useMessages().sidebar.tools.unsplashLimit;
  const { unsplashQuotaOwner = t.defaultOwner } = useCanvasEditorServices();
  return (
    <div
      role="status"
      className="flex flex-col gap-1 rounded-lg px-3 py-2.5 bg-[var(--editor-tile)] text-xs text-[var(--editor-text)]"
    >
      <strong className="text-[13px]">{t.title}</strong>
      <span className="text-[var(--editor-text-muted)] [text-wrap:pretty]">
        {t.body(unsplashQuotaOwner, clockTime(retryAt))}
      </span>
    </div>
  );
}

/** A quiet hint once the hourly Unsplash budget runs low. */
export function UnsplashRemaining({ remaining }: { remaining: number | null }) {
  const t = useMessages().sidebar.tools.unsplashLimit;
  if (remaining === null || remaining > LOW_REMAINING) return null;
  return (
    <p className="m-0 text-[11px] text-[var(--editor-text-muted)]">{t.remaining(remaining)}</p>
  );
}

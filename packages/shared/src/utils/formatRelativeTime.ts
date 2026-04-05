/**
 * Shared German relative time formatter.
 * Replaces 7 duplicate implementations across apps/web, apps/mobile, packages/docs.
 */

export interface FormatRelativeTimeOptions {
  /** Max days before falling back to absolute date. Default: 30 */
  maxDays?: number;
  /** Intl.DateTimeFormat options for the absolute date fallback */
  dateFallback?: Intl.DateTimeFormatOptions;
}

const DEFAULT_DATE_FALLBACK: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
};

export function formatRelativeTime(
  input: string | number | Date | undefined | null,
  options?: FormatRelativeTimeOptions
): string {
  if (input == null) return '';

  const date = input instanceof Date ? input : new Date(input);
  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 0) return date.toLocaleDateString('de-DE', DEFAULT_DATE_FALLBACK);

  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Min.`;

  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;

  const diffD = Math.floor(diffH / 24);
  const maxDays = options?.maxDays ?? 30;
  if (diffD < maxDays) return `vor ${diffD} ${diffD === 1 ? 'Tag' : 'Tagen'}`;

  return date.toLocaleDateString('de-DE', options?.dateFallback ?? DEFAULT_DATE_FALLBACK);
}

import { HiXMark } from 'react-icons/hi2';

import type { JSX, ReactNode } from 'react';

/** Removable pill summarizing one applied filter. */
export function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}): JSX.Element {
  const quotedLabel = label.startsWith('„') && label.endsWith('“') ? label : `„${label}“`;

  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1 rounded-full bg-primary-500/10 py-1 pl-3 pr-2 text-xs font-medium text-primary-600 transition-colors hover:bg-primary-500/20 dark:text-primary-400"
      aria-label={`Filter ${quotedLabel} entfernen`}
    >
      {label}
      <HiXMark className="size-3.5" aria-hidden="true" />
    </button>
  );
}

/** "N Dinge" followed by the active filter chips and, if any, a reset link. */
export function GalleryCountRow({
  count,
  onReset,
  children,
}: {
  count: ReactNode;
  /** Shown only when given — pass it while any filter is active. */
  onReset?: () => void;
  children?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-foreground-muted">{count}</span>
      {children}
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="text-foreground-muted underline-offset-2 transition-colors hover:text-primary-500 hover:underline"
        >
          Zurücksetzen
        </button>
      )}
    </div>
  );
}

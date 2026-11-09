import { memo } from 'react';
import { IoHeart, IoHeartOutline } from 'react-icons/io5';

import { cn } from '@/utils/cn';

export interface LikeButtonProps {
  liked: boolean;
  count: number;
  onToggle: () => void;
  loading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  /** Show the "Liken" / "Gefällt mir" text label next to the icon. */
  showLabel?: boolean;
  /** `'lg'` renders a prominent, bordered action-bar button. */
  size?: 'sm' | 'lg';
  className?: string;
}

export const LikeButton = memo(function LikeButton({
  liked,
  count,
  onToggle,
  loading = false,
  disabled = false,
  disabledReason,
  showLabel = false,
  size = 'sm',
  className,
}: LikeButtonProps) {
  const interactive = !disabled && !loading;
  const visibleLabel = liked ? 'Gefällt mir' : 'Liken';
  const actionLabel = liked ? 'Like entfernen' : 'Liken';
  // WCAG 2.5.3: the visible label and count must be part of the accessible name.
  const ariaLabel = [showLabel ? visibleLabel : actionLabel, count > 0 ? count : null]
    .filter((part) => part !== null)
    .join(', ');
  const isLarge = size === 'lg';

  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={disabled && disabledReason ? disabledReason : ariaLabel}
      title={disabled && disabledReason ? disabledReason : ariaLabel}
      disabled={!interactive}
      onClick={(e) => {
        e.stopPropagation();
        if (interactive) onToggle();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
        }
      }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center transition-colors',
        isLarge
          ? 'gap-1.5 rounded-lg border border-grey-200 px-3 py-2 text-sm font-medium dark:border-grey-700'
          : 'gap-1 rounded-md px-1.5 py-1 text-xs',
        interactive
          ? 'cursor-pointer text-grey-500 hover:bg-grey-100 hover:text-red-500 dark:text-grey-400 dark:hover:bg-grey-800'
          : 'cursor-not-allowed text-grey-400 dark:text-grey-600',
        liked && interactive && 'text-red-500 dark:text-red-400',
        liked && interactive && isLarge && 'border-red-500/40',
        loading && 'opacity-60',
        className
      )}
    >
      {liked ? (
        <IoHeart className={isLarge ? 'text-lg' : 'text-base'} aria-hidden />
      ) : (
        <IoHeartOutline className={isLarge ? 'text-lg' : 'text-base'} aria-hidden />
      )}
      {showLabel ? <span>{visibleLabel}</span> : null}
      {/* Whitespace between flex items does not render, but keeps the visible text word-separated for WCAG 2.5.3 checks. */}
      {showLabel && count > 0 ? ' ' : null}
      {count > 0 ? <span className="tabular-nums">{count}</span> : null}
    </button>
  );
});

export default LikeButton;

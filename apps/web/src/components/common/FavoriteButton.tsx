import { memo } from 'react';
import { PiStar, PiStarFill } from 'react-icons/pi';

import { cn } from '@/utils/cn';

export interface FavoriteButtonProps {
  favorited: boolean;
  onToggle: () => void;
  loading?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  /** Show the "Favorit" / "Gemerkt" text label next to the icon. */
  showLabel?: boolean;
  /** `'lg'` renders a prominent, bordered action-bar button. */
  size?: 'sm' | 'lg';
  className?: string;
}

export const FavoriteButton = memo(function FavoriteButton({
  favorited,
  onToggle,
  loading = false,
  disabled = false,
  disabledReason,
  showLabel = false,
  size = 'sm',
  className,
}: FavoriteButtonProps) {
  const interactive = !disabled && !loading;
  const ariaLabel = favorited ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen';
  const isLarge = size === 'lg';

  return (
    <button
      type="button"
      aria-pressed={favorited}
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
          ? 'cursor-pointer text-grey-500 hover:bg-grey-100 hover:text-amber-500 dark:text-grey-400 dark:hover:bg-grey-800'
          : 'cursor-not-allowed text-grey-400 dark:text-grey-600',
        favorited && interactive && 'text-amber-500 dark:text-amber-400',
        favorited && interactive && isLarge && 'border-amber-500/40',
        loading && 'opacity-60',
        className
      )}
    >
      {favorited ? (
        <PiStarFill className={isLarge ? 'text-lg' : 'text-base'} aria-hidden />
      ) : (
        <PiStar className={isLarge ? 'text-lg' : 'text-base'} aria-hidden />
      )}
      {showLabel ? <span>{favorited ? 'Gemerkt' : 'Merken'}</span> : null}
    </button>
  );
});

export default FavoriteButton;

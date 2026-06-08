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
  className?: string;
}

export const FavoriteButton = memo(function FavoriteButton({
  favorited,
  onToggle,
  loading = false,
  disabled = false,
  disabledReason,
  showLabel = false,
  className,
}: FavoriteButtonProps) {
  const interactive = !disabled && !loading;
  const ariaLabel = favorited ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen';

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
        'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors',
        interactive
          ? 'cursor-pointer text-grey-500 hover:bg-grey-100 hover:text-amber-500 dark:text-grey-400 dark:hover:bg-grey-800'
          : 'cursor-not-allowed text-grey-400 dark:text-grey-600',
        favorited && interactive && 'text-amber-500 dark:text-amber-400',
        loading && 'opacity-60',
        className
      )}
    >
      {favorited ? (
        <PiStarFill className="text-base" aria-hidden />
      ) : (
        <PiStar className="text-base" aria-hidden />
      )}
      {showLabel ? <span>{favorited ? 'Gemerkt' : 'Merken'}</span> : null}
    </button>
  );
});

export default FavoriteButton;

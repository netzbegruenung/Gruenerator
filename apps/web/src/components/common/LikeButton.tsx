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
  className?: string;
}

export const LikeButton = memo(function LikeButton({
  liked,
  count,
  onToggle,
  loading = false,
  disabled = false,
  disabledReason,
  className,
}: LikeButtonProps) {
  const interactive = !disabled && !loading;
  const ariaLabel = liked ? 'Like entfernen' : 'Liken';

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
        'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors',
        interactive
          ? 'cursor-pointer text-grey-500 hover:bg-grey-100 hover:text-red-500 dark:text-grey-400 dark:hover:bg-grey-800'
          : 'cursor-not-allowed text-grey-400 dark:text-grey-600',
        liked && interactive && 'text-red-500 dark:text-red-400',
        loading && 'opacity-60',
        className
      )}
    >
      {liked ? (
        <IoHeart className="text-base" aria-hidden />
      ) : (
        <IoHeartOutline className="text-base" aria-hidden />
      )}
      {count > 0 ? <span className="tabular-nums">{count}</span> : null}
    </button>
  );
});

export default LikeButton;

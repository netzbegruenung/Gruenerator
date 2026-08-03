import React, { memo } from 'react';
import { PiStar, PiStarFill } from 'react-icons/pi';

import useSidebarFavouritesStore, { useIsFavourite } from '../../stores/sidebarFavouritesStore';

import { cn } from '@/utils/cn';

interface FavouriteStarProps {
  id: string;
  size?: number;
  className?: string;
}

const FavouriteStar: React.FC<FavouriteStarProps> = memo(({ id, size = 14, className }) => {
  const starred = useIsFavourite(id);
  const toggleFavourite = useSidebarFavouritesStore((s) => s.toggleFavourite);

  return (
    <button
      type="button"
      className={cn(
        // `relative z-10` keeps the star above a sibling stretched-link overlay so it
        // stays independently clickable/focusable; the focus ring makes its own tab
        // stop visible (the card grid relies on it being a distinct, reachable target).
        'relative z-10 flex items-center justify-center size-6 rounded-full transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
        starred
          ? 'text-primary-600 hover:text-primary-700'
          : // Hidden until hover, but revealed on keyboard focus (the tile's or the
            // star's own) so keyboard users can discover and reach the toggle.
            'text-grey-400 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:text-primary-600',
        className
      )}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleFavourite(id);
      }}
      aria-label={starred ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
    >
      {starred ? <PiStarFill size={size} /> : <PiStar size={size} />}
    </button>
  );
});

FavouriteStar.displayName = 'FavouriteStar';

export default FavouriteStar;

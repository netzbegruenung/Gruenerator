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
        'flex items-center justify-center size-6 rounded-full transition-colors shrink-0',
        starred
          ? 'text-primary-600 hover:text-primary-700'
          : 'text-grey-400 opacity-0 group-hover:opacity-100 hover:text-primary-600 transition-opacity duration-200',
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

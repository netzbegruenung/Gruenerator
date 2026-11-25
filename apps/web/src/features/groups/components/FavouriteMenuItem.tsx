import { DropdownMenuItem, toast } from '@gruenerator/ui';
import { PiStar, PiStarFill } from 'react-icons/pi';

import useSidebarFavouritesStore, {
  useIsFavourite,
  useIsFavouritesFull,
} from '../../../stores/sidebarFavouritesStore';

/** „Zu Favoriten" im „…"-Menü einer Kachel: heftet sie in der Seitenleiste an. */
export function FavouriteMenuItem({ favouriteId }: { favouriteId: string }) {
  const isFavourite = useIsFavourite(favouriteId);
  const favouritesFull = useIsFavouritesFull();
  const toggleFavourite = useSidebarFavouritesStore((s) => s.toggleFavourite);
  return (
    <DropdownMenuItem
      onClick={() => {
        if (!isFavourite && favouritesFull) {
          toast.error('Die Favoriten sind voll. Entferne zuerst einen.');
          return;
        }
        toggleFavourite(favouriteId);
      }}
    >
      {isFavourite ? <PiStarFill /> : <PiStar />}
      {isFavourite ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}
    </DropdownMenuItem>
  );
}

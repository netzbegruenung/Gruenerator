import { CardActionsMenu, DropdownMenuItem } from '@gruenerator/ui';
import { memo } from 'react';
import { PiStar, PiStarFill } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import useSidebarFavouritesStore, { useIsFavourite } from '../../../stores/sidebarFavouritesStore';
import NotebookGalleryCard from '../../notebook/components/NotebookGalleryCard';

import type { IconType } from 'react-icons';

export interface NotebookCardModel {
  id: string;
  title: string;
  /** Source-count badge, e.g. "3 Programme", "542 Artikel", "Archiv". */
  meta: string;
  path: string;
  icon?: IconType;
  /** Member-owned notebook → exposes share/delete; system notebooks don't. */
  isUser: boolean;
}

const NotebookCard = memo(
  ({
    item,
    onShare,
    onDelete,
  }: {
    item: NotebookCardModel;
    onShare?: (id: string) => void;
    onDelete?: (id: string) => void;
  }) => {
    const navigate = useNavigate();
    const starred = useIsFavourite(item.id);
    const toggleFavourite = useSidebarFavouritesStore((s) => s.toggleFavourite);

    return (
      <NotebookGalleryCard
        title={item.title}
        meta={item.meta}
        icon={item.icon}
        onActivate={() => void navigate(item.path)}
        menu={
          <CardActionsMenu
            {...(item.isUser && onShare ? { onShare: () => onShare(item.id) } : {})}
            {...(item.isUser && onDelete ? { onDelete: () => onDelete(item.id) } : {})}
          >
            <DropdownMenuItem onClick={() => toggleFavourite(item.id)}>
              {starred ? <PiStarFill className="text-primary-600" /> : <PiStar />}
              {starred ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}
            </DropdownMenuItem>
          </CardActionsMenu>
        }
      />
    );
  }
);

NotebookCard.displayName = 'NotebookCard';

export default NotebookCard;

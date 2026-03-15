import { FiStar } from 'react-icons/fi';

import useWolkePreferencesStore from '../stores/wolkePreferencesStore';

import { cn } from '@gruenerator/ui';

const FolderStarButton = ({
  shareLinkId,
  folderPath,
  folderName,
  className,
}: {
  shareLinkId: string;
  folderPath: string;
  folderName: string;
  className?: string;
}) => {
  const starred = useWolkePreferencesStore((s) =>
    s.favourites.some((f) => f.shareLinkId === shareLinkId && f.folderPath === folderPath)
  );
  const toggleFavourite = useWolkePreferencesStore((s) => s.toggleFavourite);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleFavourite({ shareLinkId, folderPath, folderName });
      }}
      className={cn(
        'shrink-0 transition-all',
        starred ? 'text-yellow-500' : 'text-grey-300 dark:text-grey-600',
        className
      )}
      title={starred ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
    >
      <FiStar className={cn('w-3.5 h-3.5', starred && 'fill-current')} />
    </button>
  );
};

export default FolderStarButton;

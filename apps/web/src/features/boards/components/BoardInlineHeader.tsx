import { useCollaborators } from '@gruenerator/collab';
import { EditableTitle } from '@gruenerator/shared/components/EditableTitle';
import { memo } from 'react';
import { FiArrowLeft } from 'react-icons/fi';
import { PiStar, PiStarFill } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import useSidebarFavouritesStore, { useIsFavourite } from '../../../stores/sidebarFavouritesStore';

import { BoardDropdown } from './BoardDropdown';
import { PresenceAvatars } from './PresenceAvatars';

import type { BoardSettingsSection } from './board-overview/settings/BoardSettingsOverlay';
import type { HocuspocusProvider } from '@hocuspocus/provider';

interface BoardInlineHeaderProps {
  title: string;
  boardId: string;
  isConnected: boolean;
  isSynced: boolean;
  isArchived: boolean;
  expertMode: boolean;
  provider: HocuspocusProvider | null;
  onDelete: () => void;
  onArchiveToggle: () => void;
  onExpertModeToggle: () => void;
  onRename: (title: string) => void;
  onOpenSettings?: () => void;
  onOpenActivity?: () => void;
  onDuplicate?: () => void;
  onOpenFullSettings?: (section: BoardSettingsSection) => void;
  compact?: boolean;
}

export const BoardInlineHeader = memo(function BoardInlineHeader({
  title,
  boardId,
  isConnected,
  isSynced,
  isArchived,
  expertMode,
  provider,
  onDelete,
  onArchiveToggle,
  onExpertModeToggle,
  onRename,
  onOpenSettings,
  onOpenActivity,
  onDuplicate,
  onOpenFullSettings,
  compact,
}: BoardInlineHeaderProps) {
  const navigate = useNavigate();
  const collaborators = useCollaborators(provider);
  const isFavourite = useIsFavourite(boardId);
  const toggleFavourite = useSidebarFavouritesStore((s) => s.toggleFavourite);

  const showStatusDot = !isConnected || !isSynced;
  const statusClass = !isConnected ? 'bg-red-500' : 'bg-yellow-500';

  return (
    <div
      className={`z-10 flex w-full items-center justify-between ${compact ? 'px-sm py-xs' : 'flex-col sm:flex-row p-md sm:p-lg'}`}
    >
      <div className={`flex items-center gap-sm ${compact ? '' : 'order-2 sm:order-1'}`}>
        <button
          onClick={() => navigate('/workplace')}
          className="flex items-center text-grey-500 hover:text-foreground transition-colors bg-transparent border-none cursor-pointer p-1 rounded-md hover:bg-grey-100 dark:hover:bg-[#2a2a2a]"
          aria-label="Zurück zur Board-Liste"
        >
          <FiArrowLeft size={compact ? 16 : 18} />
        </button>
        <EditableTitle
          as="h1"
          title={title}
          editable
          activateOn="doubleClick"
          onTitleChange={onRename}
          className={`${compact ? 'text-sm' : 'text-xl sm:text-2xl'} font-bold tracking-tight text-foreground-heading m-0 truncate`}
          inputClassName={`${compact ? 'text-sm' : 'text-xl sm:text-2xl'} font-bold tracking-tight text-foreground-heading m-0 bg-transparent border-none outline-none`}
          editableClassName="cursor-pointer"
        />
        {showStatusDot && <div className={`w-2 h-2 rounded-full shrink-0 ${statusClass}`} />}
      </div>

      <div
        className={`flex items-center justify-end gap-sm ${compact ? '' : 'order-1 sm:order-2 mb-sm sm:mb-0'}`}
      >
        <PresenceAvatars collaborators={collaborators} />
        <button
          onClick={() => toggleFavourite(boardId)}
          aria-label={isFavourite ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}
          title={isFavourite ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}
          className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-grey-100 dark:hover:bg-[#2a2a2a] bg-transparent border-none cursor-pointer transition-colors"
        >
          {isFavourite ? (
            <PiStarFill size={16} className="text-primary-600" />
          ) : (
            <PiStar size={16} className="text-grey-400" />
          )}
        </button>
        <BoardDropdown
          boardId={boardId}
          title={title}
          isArchived={isArchived}
          expertMode={expertMode}
          onDelete={onDelete}
          onArchiveToggle={onArchiveToggle}
          onExpertModeToggle={onExpertModeToggle}
          onRename={onRename}
          onOpenSettings={onOpenSettings}
          onOpenActivity={onOpenActivity}
          onDuplicate={onDuplicate}
          onOpenFullSettings={onOpenFullSettings}
        />
      </div>
    </div>
  );
});

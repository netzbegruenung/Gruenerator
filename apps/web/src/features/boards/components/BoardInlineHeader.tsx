import { useCollaborators } from '@gruenerator/collab';
import { memo } from 'react';
import { FiArrowLeft } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { BoardDropdown } from './BoardDropdown';
import { PresenceAvatars } from './PresenceAvatars';

import type { HocuspocusProvider } from '@hocuspocus/provider';

interface BoardInlineHeaderProps {
  title: string;
  boardId: string;
  isConnected: boolean;
  isSynced: boolean;
  isArchived: boolean;
  provider: HocuspocusProvider | null;
  onDelete: () => void;
  onArchiveToggle: () => void;
  compact?: boolean;
}

export const BoardInlineHeader = memo(function BoardInlineHeader({
  title,
  boardId,
  isConnected,
  isSynced,
  isArchived,
  provider,
  onDelete,
  onArchiveToggle,
  compact,
}: BoardInlineHeaderProps) {
  const navigate = useNavigate();
  const collaborators = useCollaborators(provider);

  const showStatusDot = !isConnected || !isSynced;
  const statusClass = !isConnected ? 'bg-red-500' : 'bg-yellow-500';

  return (
    <div
      className={`z-10 flex w-full items-center justify-between ${compact ? 'px-sm py-xs' : 'flex-col sm:flex-row p-md sm:p-lg'}`}
    >
      <div className={`flex items-center gap-sm ${compact ? '' : 'order-2 sm:order-1'}`}>
        <button
          onClick={() => navigate('/boards')}
          className="flex items-center text-grey-500 hover:text-foreground transition-colors bg-transparent border-none cursor-pointer p-1 rounded-md hover:bg-grey-100 dark:hover:bg-[#2a2a2a]"
          aria-label="Zurück zur Board-Liste"
        >
          <FiArrowLeft size={compact ? 16 : 18} />
        </button>
        <h1
          className={`${compact ? 'text-sm' : 'text-xl sm:text-2xl'} font-bold tracking-tight text-foreground-heading m-0 truncate`}
        >
          {title}
        </h1>
        {showStatusDot && <div className={`w-2 h-2 rounded-full shrink-0 ${statusClass}`} />}
      </div>

      <div
        className={`flex items-center justify-end gap-sm ${compact ? '' : 'order-1 sm:order-2 mb-sm sm:mb-0'}`}
      >
        <PresenceAvatars collaborators={collaborators} />
        <BoardDropdown
          boardId={boardId}
          isArchived={isArchived}
          onDelete={onDelete}
          onArchiveToggle={onArchiveToggle}
        />
      </div>
    </div>
  );
});

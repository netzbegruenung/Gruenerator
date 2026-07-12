import { cn } from '@gruenerator/ui';
import { memo, useCallback } from 'react';
import { PiKanban, PiPencilLine } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import { BoardPreviewBody } from '../../components/common/SchematicPreviews';
import { formatRelativeDate } from '../../utils/dateFormatter';
import { type Board, getBoardPreview, getBoardType } from '../boards/types';

import { CardActionMenu } from './CardActionMenu';

export const BoardCard = memo(function BoardCard({
  board,
  onDelete,
  onRename,
}: {
  board: Board;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRename: (board: { id: string; title: string }, e: React.MouseEvent) => void;
}) {
  const navigate = useNavigate();
  const isWhiteboard = getBoardType(board) === 'whiteboard';
  const handleClick = useCallback(() => {
    void navigate(`/boards/${board.id}`);
  }, [navigate, board.id]);

  const BoardIcon = isWhiteboard ? PiPencilLine : PiKanban;

  return (
    <div
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-grey-200/80 bg-background',
        'transition-[box-shadow,border-color,transform] duration-150',
        'hover:-translate-y-0.5 hover:border-secondary-300 hover:shadow-md',
        'dark:border-grey-700/60 dark:hover:border-secondary-700'
      )}
      onClick={handleClick}
    >
      <div className="h-48 overflow-hidden border-b border-grey-100 bg-grey-50 p-4 dark:border-grey-700/60 dark:bg-grey-800/40">
        <BoardPreviewBody
          boardType={isWhiteboard ? 'whiteboard' : 'kanban'}
          preview={getBoardPreview(board)}
        />
      </div>

      <div className="flex items-start gap-2 px-3 py-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="m-0 flex items-center gap-1.5 min-w-0 truncate text-sm font-medium text-foreground-heading">
            <BoardIcon size={14} className="shrink-0 text-secondary-600 dark:text-secondary-400" />
            <span className="truncate">{board.title}</span>
          </h3>
          <p className="m-0 truncate text-xs text-grey-500 dark:text-grey-400">
            {formatRelativeDate(board.updated_at)}
            {board.creator_name && ` · ${board.creator_name}`}
          </p>
        </div>
        <CardActionMenu
          ariaLabel="Boardoptionen"
          onRename={(e) => onRename(board, e)}
          onDelete={(e) => onDelete(board.id, e)}
        />
      </div>
    </div>
  );
});

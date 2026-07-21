import { cn } from '@gruenerator/ui';
import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { BoardPreviewBody } from '../../components/common/SchematicPreviews';
import { formatRelativeDate } from '../../utils/dateFormatter';
import { type Board, getBoardPreview, getBoardType } from '../boards/types';

import { CardActionMenu } from './CardActionMenu';

export const BoardCard = memo(function BoardCard({
  board,
  onDelete,
  onRename,
  onShare,
}: {
  board: Board;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRename: (board: { id: string; title: string }, e: React.MouseEvent) => void;
  onShare?: (board: { id: string; title: string }, e: React.MouseEvent) => void;
}) {
  const navigate = useNavigate();
  const isWhiteboard = getBoardType(board) === 'whiteboard';
  const handleClick = useCallback(() => {
    void navigate(`/boards/${board.id}`);
  }, [navigate, board.id]);

  const boardPreview = getBoardPreview(board);
  const cardCount = boardPreview?.columns?.reduce((sum, col) => sum + col.count, 0) ?? 0;
  const scope = !isWhiteboard && cardCount > 0 ? `${cardCount} Karten` : null;
  const sharedSuffix = board.creator_name ? ` · ${board.creator_name}` : '';
  const metaLine =
    [isWhiteboard ? 'Whiteboard' : 'Board', scope, formatRelativeDate(board.updated_at)]
      .filter(Boolean)
      .join(' · ') + sharedSuffix;

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
      <div className="h-[210px] overflow-hidden border-b border-grey-100 bg-grey-50 p-4 dark:border-grey-700/60 dark:bg-grey-800/40">
        <BoardPreviewBody
          boardType={isWhiteboard ? 'whiteboard' : 'kanban'}
          preview={boardPreview}
        />
      </div>

      <div className="flex items-start gap-2 px-4 pb-4 pt-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="m-0 min-w-0 truncate text-[16px] font-semibold text-foreground-heading">
            {board.title}
          </h3>
          <p className="m-0 truncate text-[13px] text-grey-500 dark:text-grey-400">{metaLine}</p>
        </div>
        <CardActionMenu
          ariaLabel="Boardoptionen"
          onRename={(e) => onRename(board, e)}
          onDelete={(e) => onDelete(board.id, e)}
          {...(onShare ? { onShare: (e: React.MouseEvent) => onShare(board, e) } : {})}
        />
      </div>
    </div>
  );
});

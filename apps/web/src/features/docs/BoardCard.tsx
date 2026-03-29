import { cn } from '@gruenerator/ui';
import { memo } from 'react';
import { PiKanban, PiPencilLine } from 'react-icons/pi';

import { type Board, getBoardType } from '../boards/types';

import { CardActionMenu } from './CardActionMenu';

export const BoardCard = memo(function BoardCard({
  board,
  onClick,
  onDelete,
  onRename,
}: {
  board: Board;
  onClick: () => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRename: (board: { id: string; title: string }, e: React.MouseEvent) => void;
}) {
  const isWhiteboard = getBoardType(board) === 'whiteboard';

  return (
    <div
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-grey-200 bg-background',
        'aspect-[4/4.5] transition-[box-shadow,border-color,transform] duration-150',
        'hover:shadow-md hover:border-secondary-300 dark:hover:border-secondary-500',
        'dark:border-grey-700',
        'md:hover:-translate-y-0.5',
        'max-sm:aspect-[4/3]'
      )}
      onClick={onClick}
    >
      <div className="flex flex-1 items-center justify-center pb-10 bg-secondary-50 dark:bg-secondary-900/20">
        {isWhiteboard ? (
          <PiPencilLine size={32} className="text-secondary-600 dark:text-secondary-400" />
        ) : (
          <PiKanban size={32} className="text-secondary-600 dark:text-secondary-400" />
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 backdrop-blur-md bg-white/70 dark:bg-grey-900/70 px-2.5 py-2 border-t border-white/50 dark:border-grey-700/50">
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-xs font-semibold text-foreground">{board.title}</h3>
            <div className="mt-0.5 flex items-center gap-1 text-[10px] text-grey-500 dark:text-grey-400">
              <span>
                {new Date(board.updated_at).toLocaleDateString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
              </span>
              {board.creator_name && (
                <>
                  <span>·</span>
                  <span>{board.creator_name}</span>
                </>
              )}
            </div>
          </div>
          <CardActionMenu
            ariaLabel="Boardoptionen"
            onRename={(e) => onRename(board, e)}
            onDelete={(e) => onDelete(board.id, e)}
          />
        </div>
      </div>
    </div>
  );
});

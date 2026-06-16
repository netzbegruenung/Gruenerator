import { cn } from '@gruenerator/ui';
import { memo } from 'react';
import { FiPlus } from 'react-icons/fi';

export interface NotebookCreateCardProps {
  onClick: () => void;
  className?: string;
}

/**
 * The "create new notebook" tile. Mirrors {@link NotebookGalleryCard}'s outer
 * footprint (one grid cell, `aspect-[5/4]` body + footer) so it sits flush with
 * the notebook cards, but styled as a dashed primary "add" affordance — the same
 * palette as `ManageAllCard`.
 */
const NotebookCreateCard = memo(({ onClick, className }: NotebookCreateCardProps) => {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label="Neues Notebook erstellen"
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border border-dashed border-primary-400 bg-primary-50 text-left no-underline',
        'cursor-pointer transition-all duration-200 ease-out',
        'hover:-translate-y-0.5 hover:border-primary-500 hover:shadow-md',
        'dark:border-primary-700 dark:bg-primary-950/30 dark:hover:border-primary-500',
        className
      )}
    >
      <div className="flex aspect-[5/4] items-center justify-center">
        <FiPlus className="size-9 text-primary-500 transition-transform duration-200 ease-out group-hover:scale-110 dark:text-primary-300" />
      </div>

      <div className="flex items-center justify-center border-t border-dashed border-primary-300/70 px-3 py-2.5 dark:border-primary-700/70">
        <span className="truncate text-sm font-medium text-primary-700 dark:text-primary-200">
          Neues Notebook
        </span>
      </div>
    </div>
  );
});

NotebookCreateCard.displayName = 'NotebookCreateCard';

export default NotebookCreateCard;

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
 * the notebook cards, but styled as a dashed pink "add" affordance to match the
 * accented notebook cards on the "Wissen" surface.
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
        'group relative flex flex-col overflow-hidden rounded-xl border border-dashed border-[#E9A9C8] bg-[#FDF2F8] text-left no-underline',
        'cursor-pointer transition-all duration-200 ease-out',
        'hover:-translate-y-0.5 hover:border-[#D6006E] hover:shadow-md',
        'dark:border-[#5A2A44] dark:bg-[#2A1B24] dark:hover:border-[#EC5AA0]',
        className
      )}
    >
      <div className="flex aspect-[5/4] items-center justify-center">
        <FiPlus className="size-9 text-[#D6006E] transition-transform duration-200 ease-out group-hover:scale-110 dark:text-[#EC5AA0]" />
      </div>

      <div className="flex items-center justify-center border-t border-dashed border-[#EFC9DD] px-3 py-2.5 dark:border-[#4A2A3B]">
        <span className="truncate text-sm font-medium text-[#B4005C] dark:text-[#F2A9CE]">
          Neues Notebook
        </span>
      </div>
    </div>
  );
});

NotebookCreateCard.displayName = 'NotebookCreateCard';

export default NotebookCreateCard;

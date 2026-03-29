import { type Presentation } from '@gruenerator/slides';
import { cn } from '@gruenerator/ui';
import { memo, useCallback } from 'react';
import { FiMonitor } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { formatRelativeDate } from '../../utils/dateFormatter';

import { CardActionMenu } from './CardActionMenu';

export const PresentationCard = memo(function PresentationCard({
  presentation,
  onDelete,
  onRename,
}: {
  presentation: Presentation;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRename: (pres: { id: string; title: string }, e: React.MouseEvent) => void;
}) {
  const navigate = useNavigate();
  const handleClick = useCallback(() => {
    navigate(`/docs/presentation/${presentation.id}`);
  }, [navigate, presentation.id]);

  return (
    <div
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-grey-200 bg-background',
        'aspect-[4/4.5] transition-[box-shadow,border-color,transform] duration-150',
        'hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-500',
        'dark:border-grey-700',
        'md:hover:-translate-y-0.5',
        'max-sm:aspect-[4/3]'
      )}
      onClick={handleClick}
    >
      <div className="flex flex-1 items-center justify-center pb-10 bg-indigo-50 dark:bg-indigo-900/20">
        <FiMonitor size={32} className="text-indigo-500 dark:text-indigo-400" />
      </div>

      <div className="absolute inset-x-0 bottom-0 backdrop-blur-md bg-white/70 dark:bg-grey-900/70 px-2.5 py-2 border-t border-white/50 dark:border-grey-700/50">
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-xs font-semibold text-foreground">{presentation.title}</h3>
            <div className="mt-0.5 text-[10px] text-grey-500 dark:text-grey-400">
              {formatRelativeDate(presentation.updatedAt)}
            </div>
          </div>
          <CardActionMenu
            ariaLabel="Präsentationsoptionen"
            onRename={(e) => onRename(presentation, e)}
            onDelete={(e) => onDelete(presentation.id, e)}
          />
        </div>
      </div>
    </div>
  );
});

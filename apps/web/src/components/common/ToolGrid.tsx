import { Badge } from '@gruenerator/ui';
import { memo } from 'react';
import { PiStar, PiStarFill } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import useSidebarFavouritesStore from '../../stores/sidebarFavouritesStore';

import type { IconType } from '../../config/icons';

import { cn } from '@/utils/cn';

export interface ToolEntry {
  id: string;
  title: string;
  description: string;
  path: string;
  icon?: IconType;
  imageUrl?: string;
  tags?: string[];
  betaFeature?: string;
}

interface ToolGridProps {
  tools: ToolEntry[];
  columns?: 2 | 3 | 4;
}

const columnClasses = {
  2: 'grid-cols-2 max-sm:grid-cols-1',
  3: 'grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1',
  4: 'grid-cols-4 max-lg:grid-cols-2 max-sm:grid-cols-1',
} as const;

const ToolGrid = memo(({ tools, columns }: ToolGridProps) => {
  const navigate = useNavigate();
  const isFavourite = useSidebarFavouritesStore((s) => s.isFavourite);
  const toggleFavourite = useSidebarFavouritesStore((s) => s.toggleFavourite);
  const isFull = useSidebarFavouritesStore((s) => s.isFull);
  const cols = columns ?? (tools.length <= 3 ? 3 : 2);

  return (
    <div className={cn('grid gap-md', columnClasses[cols])}>
      {tools.map((tool) => {
        const starred = isFavourite(tool.id);
        const showStar = starred || !isFull();
        return (
          <div
            key={tool.id}
            role="button"
            tabIndex={0}
            className="group flex flex-row bg-background border border-grey-200 dark:border-grey-700 rounded-md overflow-hidden cursor-pointer transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md"
            onClick={() => navigate(tool.path)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate(tool.path);
              }
            }}
          >
            {(tool.imageUrl || tool.icon) && (
              <div className="flex items-center justify-center px-md text-secondary-600 shrink-0">
                {tool.imageUrl ? (
                  <img src={tool.imageUrl} alt="" className="size-8 rounded-full object-cover" />
                ) : (
                  tool.icon && <tool.icon className="text-2xl" />
                )}
              </div>
            )}

            <div className="flex flex-col flex-1 p-md min-w-0">
              <div className="flex justify-between items-start mb-sm">
                <h3 className="text-base font-semibold text-foreground-heading m-0">
                  {tool.title}
                </h3>
                {showStar && (
                  <button
                    type="button"
                    className={cn(
                      'flex items-center justify-center w-7 h-7 rounded-full transition-colors shrink-0',
                      starred
                        ? 'text-primary-600 hover:text-primary-700'
                        : 'text-grey-400 opacity-0 group-hover:opacity-100 hover:text-primary-600 transition-opacity duration-300'
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavourite(tool.id);
                    }}
                    aria-label={starred ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                  >
                    {starred ? <PiStarFill size={16} /> : <PiStar size={16} />}
                  </button>
                )}
              </div>

              <p
                className={cn('text-sm text-foreground leading-relaxed m-0', tool.tags && 'mb-sm')}
              >
                {tool.description}
              </p>

              {tool.tags && tool.tags.length > 0 && (
                <div className="flex flex-wrap gap-xs mt-auto">
                  {tool.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="bg-secondary-600 text-white border-transparent text-xs"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

ToolGrid.displayName = 'ToolGrid';

export default ToolGrid;

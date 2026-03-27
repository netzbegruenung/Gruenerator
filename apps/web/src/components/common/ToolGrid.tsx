import {
  Badge,
  CardActionsMenu,
  CardGrid,
  DropdownMenuItem,
  DropdownMenuSeparator,
  ListCard,
  ListCardActions,
  ListCardContent,
  ListCardIcon,
  ListCardTitle,
} from '@gruenerator/ui';
import { memo } from 'react';
import { PiStar, PiStarFill } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import useSidebarFavouritesStore, { useIsFavourite } from '../../stores/sidebarFavouritesStore';

import FavouriteStar from './FavouriteStar';

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
  columns?: 2 | 3 | 4 | 5;
  compact?: boolean;
  showFavourites?: boolean;
  onShare?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const FavouriteMenuItem = memo(({ id }: { id: string }) => {
  const starred = useIsFavourite(id);
  const toggleFavourite = useSidebarFavouritesStore((s) => s.toggleFavourite);

  return (
    <DropdownMenuItem onClick={() => toggleFavourite(id)}>
      {starred ? <PiStarFill className="text-primary-600" /> : <PiStar />}
      {starred ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
    </DropdownMenuItem>
  );
});
FavouriteMenuItem.displayName = 'FavouriteMenuItem';

const CompactToolCard = memo(
  ({
    tool,
    showFavourites,
    onShare,
    onDelete,
  }: {
    tool: ToolEntry;
    showFavourites?: boolean;
    onShare?: (id: string) => void;
    onDelete?: (id: string) => void;
  }) => {
    const navigate = useNavigate();
    const hasActions = showFavourites || onShare || onDelete;

    return (
      <ListCard
        onClick={() => navigate(tool.path)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigate(tool.path);
          }
        }}
        role="button"
        tabIndex={0}
        className="py-sm"
      >
        {(tool.imageUrl || tool.icon) && (
          <ListCardIcon>
            {tool.imageUrl ? (
              <img src={tool.imageUrl} alt="" className="size-6 rounded-full object-cover" />
            ) : (
              tool.icon && <tool.icon />
            )}
          </ListCardIcon>
        )}
        <ListCardContent>
          <ListCardTitle>{tool.title}</ListCardTitle>
        </ListCardContent>
        {hasActions && (
          <ListCardActions className="opacity-100">
            <CardActionsMenu
              {...(onShare ? { onShare: () => onShare(tool.id) } : {})}
              {...(onDelete ? { onDelete: () => onDelete(tool.id) } : {})}
            >
              {showFavourites && (
                <>
                  <FavouriteMenuItem id={tool.id} />
                  {(onShare || onDelete) && <DropdownMenuSeparator />}
                </>
              )}
            </CardActionsMenu>
          </ListCardActions>
        )}
      </ListCard>
    );
  }
);
CompactToolCard.displayName = 'CompactToolCard';

const FullToolCard = memo(({ tool }: { tool: ToolEntry }) => {
  const navigate = useNavigate();

  return (
    <div
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
          <h3 className="text-base font-semibold text-foreground-heading m-0">{tool.title}</h3>
          <FavouriteStar id={tool.id} size={16} />
        </div>

        <p className={cn('text-sm text-foreground leading-relaxed m-0', tool.tags && 'mb-sm')}>
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
});
FullToolCard.displayName = 'FullToolCard';

const COLUMN_MAP: Record<number, '1' | '2' | '3' | '5' | 'auto'> = {
  2: '2',
  3: '3',
  4: 'auto',
  5: '5',
};

const ToolGrid = memo(
  ({
    tools,
    columns,
    compact = false,
    showFavourites = false,
    onShare,
    onDelete,
  }: ToolGridProps) => {
    const cols = columns ?? (tools.length <= 3 ? 3 : 2);

    return (
      <CardGrid columns={COLUMN_MAP[cols] ?? 'auto'} gap={compact ? 'sm' : 'md'}>
        {tools.map((tool) =>
          compact ? (
            <CompactToolCard
              key={tool.id}
              tool={tool}
              showFavourites={showFavourites}
              onShare={onShare}
              onDelete={onDelete}
            />
          ) : (
            <FullToolCard key={tool.id} tool={tool} />
          )
        )}
      </CardGrid>
    );
  }
);

ToolGrid.displayName = 'ToolGrid';

export default ToolGrid;

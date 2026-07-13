import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';

import FavouriteStar from '../../../components/common/FavouriteStar';
import { getIcon } from '../../../config/icons';
import {
  WORKPLACE_TOOLS,
  filterWorkplaceTools,
  isFavouritableTool,
  sortToolsByFavourites,
  type WorkplaceToolItem,
} from '../../../config/workplaceToolsConfig';
import useSidebarFavouritesStore from '../../../stores/sidebarFavouritesStore';

import type { IconType } from '../../../config/icons';

interface FavoriteItem {
  id: string;
  title: string;
  href: string;
  icon: IconType;
}

const FAVORITES: FavoriteItem[] = [
  {
    id: 'verdigado',
    title: 'Verdigado',
    href: 'https://verdigado.com/',
    icon: getIcon('actions', 'link')!,
  },
  {
    id: 'sunflower-theme',
    title: 'Sunflower-Theme',
    href: 'https://sunflower-theme.de/',
    icon: getIcon('actions', 'link')!,
  },
  {
    id: 'gruene-wolke',
    title: 'Grüne Wolke',
    href: 'https://wolke.netzbegruenung.de/',
    icon: getIcon('actions', 'cloud')!,
  },
  {
    id: 'gruenes-doodle',
    title: 'Grünes Doodle',
    href: 'https://termine.netzbegruenung.de',
    icon: getIcon('actions', 'link')!,
  },
  {
    id: 'netzbegruenung',
    title: 'Netzbegrünung',
    href: 'https://netzbegruenung.de/',
    icon: getIcon('navigation', 'home')!,
  },
];

// Soft, hover-lift card surface shared by tool tiles and favorite pills. Mirrors
// the workplace's established card idiom (see RecentlyCreatedSection): a hairline
// border + `bg-background` that, on hover, lifts, deepens its shadow and tints its
// border toward the brand eucalyptus. Dark mode swaps to grey borders.
const CARD_BASE =
  'group relative flex items-center bg-background no-underline transition-[transform,box-shadow,border-color] duration-150 ' +
  'border border-grey-200/80 hover:border-secondary-300 hover:shadow-lg dark:border-grey-700/60 dark:hover:border-secondary-700';

// Rounded-square brand chip holding the tool icon. Tints in on hover via the
// shared `group` so the whole tile responds as one surface.
const CHIP_BASE =
  'flex flex-none items-center justify-center rounded-xl text-secondary-600 transition-colors duration-150 ' +
  'group-hover:bg-secondary-50 dark:text-secondary-400 dark:group-hover:bg-secondary-900/30';

function SectionHeading({ title, badge }: { title: string; badge?: string }) {
  return (
    <div className="mb-md flex items-center gap-sm">
      <h2 className="m-0 text-xl font-semibold text-foreground-heading">{title}</h2>
      {badge && (
        <span className="rounded-full bg-secondary-50 px-2.5 py-0.5 text-xs font-semibold text-secondary-600 dark:bg-secondary-900/30 dark:text-secondary-300">
          {badge}
        </span>
      )}
    </div>
  );
}

function ToolTile({ tool }: { tool: WorkplaceToolItem }) {
  const Icon = tool.icon;
  const favouritable = isFavouritableTool(tool);
  const className = `${CARD_BASE} gap-3 rounded-2xl p-md`;
  const body = (
    <>
      <span className={`${CHIP_BASE} size-12 text-[22px]`}>
        <Icon />
      </span>
      <span className={`min-w-0 flex-1${favouritable ? ' pr-6' : ''}`}>
        <h3 className="m-0 text-[15px] font-semibold leading-tight text-foreground-heading">
          {tool.title}
        </h3>
        <span className="mt-1 block text-[12.5px] leading-snug text-muted-foreground">
          {tool.description}
        </span>
      </span>
      {favouritable && <FavouriteStar id={tool.id} size={15} className="absolute right-2 top-2" />}
    </>
  );

  return tool.href ? (
    <a href={tool.href} target="_blank" rel="noopener noreferrer" className={className}>
      {body}
    </a>
  ) : (
    <Link to={tool.path ?? '/'} className={className}>
      {body}
    </Link>
  );
}

function FavoriteTile({ favorite }: { favorite: FavoriteItem }) {
  const Icon = favorite.icon;
  return (
    <a
      href={favorite.href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${CARD_BASE} gap-3 rounded-xl px-4 py-3 hover:-translate-y-0.5`}
    >
      <span className={`${CHIP_BASE} size-9 rounded-lg text-[19px]`}>
        <Icon />
      </span>
      <span className="min-w-0 truncate text-sm font-semibold leading-tight text-foreground-heading">
        {favorite.title}
      </span>
    </a>
  );
}

const ToolsSection = React.memo(() => {
  const favouriteIds = useSidebarFavouritesStore((s) => s.favouriteIds);
  const tools = useMemo(
    () => sortToolsByFavourites(filterWorkplaceTools(WORKPLACE_TOOLS), favouriteIds),
    [favouriteIds]
  );
  return (
    <>
      <SectionHeading title="Tools" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-sm">
        {tools.map((tool) => (
          <ToolTile key={tool.id} tool={tool} />
        ))}
      </div>
    </>
  );
});

ToolsSection.displayName = 'ToolsSection';

export const FavoritesSection = React.memo(() => (
  <>
    <SectionHeading title="Grünerators Favoriten" badge="Externe Dienste" />
    <div className="grid grid-cols-[repeat(auto-fill,minmax(188px,1fr))] gap-sm">
      {FAVORITES.map((favorite) => (
        <FavoriteTile key={favorite.id} favorite={favorite} />
      ))}
    </div>
  </>
));

FavoritesSection.displayName = 'FavoritesSection';

export default ToolsSection;

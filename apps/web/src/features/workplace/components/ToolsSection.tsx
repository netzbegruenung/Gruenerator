import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import React, { useMemo } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { Link, useNavigate } from 'react-router-dom';

import FavouriteStar from '../../../components/common/FavouriteStar';
import { getIcon } from '../../../config/icons';
import {
  OFFICE_TOOLS,
  TOOL_MENUS,
  WORKPLACE_TOOLS,
  filterWorkplaceTools,
  isFavouritableTool,
  sortToolsByFavourites,
  type WorkplaceToolItem,
  type WorkplaceToolMenu,
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

// Shared tool-grid: auto-fit so each row stretches its tiles to fill the width
// (no trailing empty cells), fitting up to ~5 across at the lg container and
// wrapping down responsively on narrower viewports.
export const TOOL_GRID = 'grid grid-cols-[repeat(auto-fit,minmax(196px,1fr))] gap-sm';

export function SectionHeading({ title, badge }: { title: string; badge?: string }) {
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

export function ToolTile({ tool }: { tool: WorkplaceToolItem }) {
  const Icon = tool.icon;
  const favouritable = isFavouritableTool(tool);
  const className = `${CARD_BASE} gap-2 rounded-2xl px-3 py-md`;
  const body = (
    <>
      <span className={`${CHIP_BASE} size-12 text-[22px]`}>
        <Icon />
      </span>
      <span className={`min-w-0 flex-1${favouritable ? ' pr-2' : ''}`}>
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

// A tool card that opens a dropdown of related tools instead of navigating.
// Same tile surface as ToolTile, with a caret and a Radix dropdown menu.
function DropdownToolTile({ menu }: { menu: WorkplaceToolMenu }) {
  const Icon = menu.icon;
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`${CARD_BASE} w-full gap-2 rounded-2xl px-3 py-md text-left`}
        >
          <span className={`${CHIP_BASE} size-12 text-[22px]`}>
            <Icon />
          </span>
          <span className="min-w-0 flex-1 pr-5">
            <h3 className="m-0 text-[15px] font-semibold leading-tight text-foreground-heading">
              {menu.title}
            </h3>
            <span className="mt-1 block text-[12.5px] leading-snug text-muted-foreground">
              {menu.description}
            </span>
          </span>
          <FiChevronDown
            aria-hidden
            className="absolute right-2 top-1/2 -translate-y-1/2 text-grey-400"
            size={16}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[264px] p-1.5">
        {menu.items.map((item) => {
          const ItemIcon = item.icon;
          const favouritable = Boolean(item.path) && !item.href;
          return (
            <DropdownMenuItem
              key={item.id}
              className="group flex items-center gap-2.5 rounded-xl px-2.5 py-2"
              onClick={() => {
                if (item.href) window.open(item.href, '_blank', 'noopener,noreferrer');
                else if (item.path) void navigate(item.path);
              }}
            >
              <span className={`${CHIP_BASE} size-10 rounded-lg text-[19px]`}>
                <ItemIcon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold leading-tight text-foreground-heading">
                  {item.title}
                </span>
                <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                  {item.description}
                </span>
              </span>
              {favouritable && (
                // Stop pointerdown so the star toggles the favourite without
                // Radix selecting (and navigating away from) the menu item.
                <span onPointerDown={(e) => e.stopPropagation()}>
                  <FavouriteStar id={item.id} size={15} />
                </span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
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
  const tiles = useMemo(
    () => sortToolsByFavourites(filterWorkplaceTools(WORKPLACE_TOOLS), favouriteIds),
    [favouriteIds]
  );

  return (
    <>
      <SectionHeading title="Tools" />
      <div className={TOOL_GRID}>
        {tiles.map((tool) => (
          <ToolTile key={tool.id} tool={tool} />
        ))}
        {TOOL_MENUS.map((menu) => (
          <DropdownToolTile key={menu.id} menu={menu} />
        ))}
      </div>
    </>
  );
});

ToolsSection.displayName = 'ToolsSection';

export const OfficeSection = React.memo(() => (
  <>
    <SectionHeading title="Office" />
    <div className={TOOL_GRID}>
      {OFFICE_TOOLS.map((tool) => (
        <ToolTile key={tool.id} tool={tool} />
      ))}
    </div>
  </>
));

OfficeSection.displayName = 'OfficeSection';

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

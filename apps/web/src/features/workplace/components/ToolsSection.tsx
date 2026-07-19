import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import React from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { Link, useNavigate } from 'react-router-dom';

import FavouriteStar from '../../../components/common/FavouriteStar';
import { getIcon } from '../../../config/icons';
import { getToolTheme } from '../../../config/toolTheme';
import {
  OFFICE_TOOLS,
  TOOL_MENUS,
  WORKPLACE_TOOLS,
  isFavouritableTool,
  type WorkplaceToolItem,
  type WorkplaceToolMenu,
} from '../../../config/workplaceToolsConfig';

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

// Soft, hover-lift card surface shared by the /canvas tool tiles and favorite
// pills. Mirrors the workplace's established card idiom (see RecentlyCreatedSection):
// a hairline border + `bg-background` that, on hover, lifts, deepens its shadow and
// tints its border toward the brand eucalyptus.
const CARD_BASE =
  'group relative flex items-center bg-background no-underline transition-[transform,box-shadow,border-color] duration-150 ' +
  'border border-grey-200/80 hover:border-secondary-300 hover:shadow-lg dark:border-grey-700/60 dark:hover:border-secondary-700';

// Rounded-square brand chip holding the tool icon (used by ToolTile + dropdown rows).
const CHIP_BASE =
  'flex flex-none items-center justify-center rounded-xl text-secondary-600 transition-colors duration-150 ' +
  'group-hover:bg-secondary-50 dark:text-secondary-400 dark:group-hover:bg-secondary-900/30';

// Shared tool-grid for the /canvas tools row: auto-fit so each row stretches its
// tiles to fill the width, ~5 across at the lg container, wrapping down responsively.
export const TOOL_GRID = 'grid grid-cols-[repeat(auto-fit,minmax(196px,1fr))] gap-sm';

// The colored Office tiles live in a single horizontal strip — same scroll idiom
// as the Wissen notebook covers: fractional widths keep the next tile half-visible
// so the scroll affordance is obvious; pt/pb leave room for the hover lift.
const OFFICE_SCROLL_ROW = 'flex gap-3 overflow-x-auto pt-1 pb-3 sm:gap-4';
// Tile width = (row − its gaps) ÷ an .5 count, so the next tile is always ~half
// visible (a deliberate scroll tease) at any width — the gap subtraction is what
// keeps the peek from collapsing as the container grows. ~1.5 tiles on mobile → 6.5
// on desktop. Gap is 0.75rem at base, 1rem from sm up (matches OFFICE_SCROLL_ROW).
const OFFICE_SCROLL_ITEM =
  'shrink-0 basis-[calc((100%_-_0.75rem)_*_0.6667)] sm:basis-[calc((100%_-_2rem)_*_0.4)] md:basis-[calc((100%_-_3rem)_*_0.2857)] lg:basis-[calc((100%_-_5rem)_*_0.1818)]';

// Tile colours (and each tool's matching page gradient) live in the shared
// `config/toolTheme` registry so a tile and its subpage never drift.

// Icon pinned top, label pinned bottom (justify-between) so icons and descriptions
// line up across tiles regardless of how many lines a title wraps to — that even
// alignment is what keeps the strip tidy. Internals shrink at lg where the 6.5-up
// tiles are smallest.
const OFFICE_TILE_BASE =
  'group relative flex aspect-square flex-col justify-between gap-2 rounded-2xl p-5 no-underline ' +
  'transition-shadow duration-150 lg:p-4';

// Icon-over-title/desc content shared by the link tiles and the dropdown tile.
function OfficeTileInner({
  styleKey,
  Icon,
  title,
  description,
}: {
  styleKey: string;
  Icon: IconType;
  title: string;
  description: string;
}) {
  const theme = getToolTheme(styleKey);
  return (
    <>
      <span className={`flex text-[36px] lg:text-[31px] ${theme?.icon ?? 'text-secondary-600'}`}>
        <Icon />
      </span>
      <span className="min-w-0">
        <span
          className={`block text-[26px] font-bold leading-tight line-clamp-2 lg:text-[23px] ${theme?.title ?? 'text-foreground-heading'}`}
        >
          {title}
        </span>
        <span
          className={`mt-1 block text-[16px] leading-snug line-clamp-2 lg:text-[14px] ${theme?.desc ?? 'text-muted-foreground'}`}
        >
          {description}
        </span>
      </span>
    </>
  );
}

// Square color-field Office tile (design 1e) with a favourite star top-right.
function OfficeTile({ tool }: { tool: WorkplaceToolItem }) {
  const favouritable = isFavouritableTool(tool);
  return (
    <Link
      to={tool.path ?? '/'}
      className={`${OFFICE_TILE_BASE} ${getToolTheme(tool.id)?.tile ?? 'bg-grey-50 dark:bg-grey-800/40'}`}
    >
      {favouritable && <FavouriteStar id={tool.id} size={16} className="absolute right-3 top-3" />}
      <OfficeTileInner
        styleKey={tool.id}
        Icon={tool.icon}
        title={tool.title}
        description={tool.description}
      />
    </Link>
  );
}

// Same color-field tile, but a dropdown trigger (Weitere) — caret instead of star.
function OfficeDropdownTile({ menu }: { menu: WorkplaceToolMenu }) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`${OFFICE_TILE_BASE} w-full text-left ${getToolTheme(menu.id)?.tile ?? 'bg-grey-50 dark:bg-grey-800/40'}`}
        >
          <FiChevronDown aria-hidden className="absolute right-3 top-3 text-grey-500" size={18} />
          <OfficeTileInner
            styleKey={menu.id}
            Icon={menu.icon}
            title={menu.title}
            description={menu.description}
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

// Row-layout tile kept for the /canvas tools section (CanvasLandingPage).
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

const byId = (id: string): WorkplaceToolItem | undefined =>
  WORKPLACE_TOOLS.find((t) => t.id === id);

// Default order: Agentura first, then the office apps, then Reels.
const OFFICE_ROW_TOOLS: WorkplaceToolItem[] = [
  byId('agents'),
  ...OFFICE_TOOLS,
  byId('reels-untertitel'),
].filter((t): t is WorkplaceToolItem => Boolean(t));

// The single Arbeiten tool row: colored creation tiles + the Weitere dropdown tile,
// in one horizontal Wissen-style scroll strip.
export const OfficeSection = React.memo(() => (
  <>
    <SectionHeading title="Tools" />
    <div className={OFFICE_SCROLL_ROW}>
      {OFFICE_ROW_TOOLS.map((tool) => (
        <div key={tool.id} className={OFFICE_SCROLL_ITEM}>
          <OfficeTile tool={tool} />
        </div>
      ))}
      {TOOL_MENUS.map((menu) => (
        <div key={menu.id} className={OFFICE_SCROLL_ITEM}>
          <OfficeDropdownTile menu={menu} />
        </div>
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

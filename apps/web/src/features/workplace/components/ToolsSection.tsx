import React, { useMemo, useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { Link } from 'react-router-dom';

import FavouriteStar from '../../../components/common/FavouriteStar';
import { getIcon } from '../../../config/icons';
import { getToolTheme } from '../../../config/toolTheme';
import {
  OFFICE_TOOLS,
  TOOL_MENUS,
  WORKPLACE_TOOLS,
  filterWorkplaceTools,
  isFavouritableTool,
  sortToolsByFavourites,
  type WorkplaceToolItem,
  type WorkplaceToolMenu,
  type WorkplaceToolMenuItem,
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

// Soft, hover-lift card surface for the favorite pills. Mirrors the workplace's
// established card idiom (see RecentlyCreatedSection): a hairline border +
// `bg-background` that, on hover, lifts, deepens its shadow and tints its border
// toward the brand eucalyptus.
const CARD_BASE =
  'group relative flex items-center bg-background no-underline transition-[transform,box-shadow,border-color] duration-150 ' +
  'border border-grey-200/80 hover:border-secondary-300 hover:shadow-lg dark:border-grey-700/60 dark:hover:border-secondary-700';

// Rounded-square brand chip holding the tool icon (used by dropdown rows + favorites).
const CHIP_BASE =
  'flex flex-none items-center justify-center rounded-xl text-secondary-600 transition-colors duration-150 ' +
  'group-hover:bg-secondary-50 dark:text-secondary-400 dark:group-hover:bg-secondary-900/30';

// The colored Office tiles live in a single horizontal strip — same scroll idiom
// as the Wissen notebook covers: fractional widths keep the next tile half-visible
// so the scroll affordance is obvious; pt/pb leave room for the hover lift. Also
// reused by the /studio landing tool strip so both read identically. Centered when
// the tiles fit; `-safe` falls back to start-aligned (no clipping) when they overflow.
export const OFFICE_SCROLL_ROW =
  'flex justify-center-safe gap-3 overflow-x-auto pt-1 pb-3 sm:gap-4';
// Tile width = (row − its gaps) ÷ an .5 count, so the next tile is always ~half
// visible (a deliberate scroll tease) at any width — the gap subtraction is what
// keeps the peek from collapsing as the container grows. ~2.5 tiles on mobile → 3.5
// on sm → 4.5 on md. On desktop (lg) the width is count-aware via `--tile-basis`
// (see `officeStripStyle`): ≤6 tiles fill the row edge-to-edge (all fully visible),
// ≥7 fall back to the 5.5-up tease. Default var = 5.5-up when a row omits the style.
// Gap is 0.75rem at base, 1rem from sm up (matches OFFICE_SCROLL_ROW).
export const OFFICE_SCROLL_ITEM =
  'shrink-0 basis-[calc((100%_-_1.5rem)_*_0.4)] sm:basis-[calc((100%_-_3rem)_*_0.2857)] md:basis-[calc((100%_-_4rem)_*_0.2222)] lg:basis-[var(--tile-basis,calc((100%_-_5rem)_*_0.1818))]';

// Desktop (lg) tile sizing for a strip of `tileCount` tiles: ≤6 fill the row (all
// fully visible, no scroll); ≥7 keep the 5.5-up scroll tease. Set on the scroll
// row; `OFFICE_SCROLL_ITEM` reads it via `--tile-basis`. Gap at lg is 1rem.
//
// `maxTilePx` caps each tile so a short strip (e.g. the 4-tile /studio or 5-tile
// /office landing) stays tile-sized and centered instead of stretching edge-to-edge.
// The top-level Arbeiten area cards omit it and fill the row.
export function officeStripStyle(
  tileCount: number,
  opts?: { maxTilePx?: number }
): React.CSSProperties {
  const base =
    tileCount <= 6
      ? `calc((100% - ${tileCount - 1}rem) / ${tileCount})`
      : 'calc((100% - 5rem) * 0.1818)';
  const lgBasis = opts?.maxTilePx != null ? `min(${base}, ${opts.maxTilePx}px)` : base;
  return { '--tile-basis': lgBasis } as React.CSSProperties;
}

// Tile colours (and each tool's matching page gradient) live in the shared
// `config/toolTheme` registry so a tile and its subpage never drift.

// Icon pinned top, label pinned bottom (justify-between) so icons and descriptions
// line up across tiles regardless of how many lines a title wraps to — that even
// alignment is what keeps the strip tidy. Internals shrink at lg where the 6.5-up
// tiles are smallest.
const OFFICE_TILE_BASE =
  'group relative flex aspect-square flex-col justify-between gap-2 rounded-2xl p-4 no-underline ' +
  'transition-shadow duration-150 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] ' +
  'dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.30)]';

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
      <span
        className={`flex text-[24px] sm:text-[28px] lg:text-[30px] ${theme?.icon ?? 'text-secondary-600'}`}
      >
        <Icon />
      </span>
      <span className="min-w-0">
        <span
          className={`block text-[16px] font-bold leading-tight line-clamp-2 sm:text-[19px] lg:text-[22px] ${theme?.title ?? 'text-foreground-heading'}`}
        >
          {title}
        </span>
        <span
          className={`mt-0.5 block min-h-[2.75em] text-[12px] leading-snug line-clamp-2 sm:mt-1 sm:text-[13px] lg:text-[14px] ${theme?.desc ?? 'text-muted-foreground'}`}
        >
          {description}
        </span>
      </span>
    </>
  );
}

// Square color-field Office tile (design 1e) with a favourite star top-right.
// Exported so the /studio landing tool strip renders the same tiles. `themeKey`
// overrides the colour source: the top-level Arbeiten strip leaves it unset so
// each tile wears its own hue, while a subpage passes its own tool id so all
// tiles there share the page's colour instead of being colourful again.
export function OfficeTile({ tool, themeKey }: { tool: WorkplaceToolItem; themeKey?: string }) {
  const favouritable = isFavouritableTool(tool);
  const styleKey = themeKey ?? tool.id;
  return (
    <Link
      to={tool.path ?? '/'}
      className={`${OFFICE_TILE_BASE} ${getToolTheme(styleKey)?.tile ?? 'bg-grey-50 dark:bg-grey-800/40'}`}
    >
      {favouritable && <FavouriteStar id={tool.id} size={16} className="absolute right-3 top-3" />}
      <OfficeTileInner
        styleKey={styleKey}
        Icon={tool.icon}
        title={tool.title}
        description={tool.description}
      />
    </Link>
  );
}

// Same colourful square tile, but an action button instead of a navigation Link
// — the /office landing page uses these to create an empty doc/board/sheet/pres.
// No favourite star (a create-action isn't pinnable).
export function OfficeActionTile({
  styleKey,
  icon: Icon,
  title,
  description,
  onClick,
}: {
  styleKey: string;
  icon: IconType;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${OFFICE_TILE_BASE} w-full text-left ${getToolTheme(styleKey)?.tile ?? 'bg-grey-50 dark:bg-grey-800/40'}`}
    >
      <OfficeTileInner styleKey={styleKey} Icon={Icon} title={title} description={description} />
    </button>
  );
}

// Same color-field tile, but a toggle for the "Weitere" group — instead of a
// dropdown it reveals a second tile row below the strip (mirroring how Wissen
// expands notebook rows). The caret flips when open.
function OfficeExpandTile({
  menu,
  open,
  onToggle,
}: {
  menu: WorkplaceToolMenu;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`${OFFICE_TILE_BASE} w-full text-left ${getToolTheme(menu.id)?.tile ?? 'bg-grey-50 dark:bg-grey-800/40'}`}
    >
      <FiChevronDown
        aria-hidden
        className={`absolute right-3 top-3 text-grey-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        size={18}
      />
      <OfficeTileInner
        styleKey={menu.id}
        Icon={menu.icon}
        title={menu.title}
        description={menu.description}
      />
    </button>
  );
}

// A "Weitere" child rendered as a full tile in the expanded second row. Wears the
// neutral `weitere` hue so the group reads as one family; handles both internal
// routes (Link) and external links (anchor).
function OfficeMenuItemTile({ item }: { item: WorkplaceToolMenuItem }) {
  const favouritable = Boolean(item.path) && !item.href;
  const className = `${OFFICE_TILE_BASE} ${getToolTheme('weitere')?.tile ?? 'bg-grey-50 dark:bg-grey-800/40'}`;
  const inner = (
    <>
      {favouritable && <FavouriteStar id={item.id} size={16} className="absolute right-3 top-3" />}
      <OfficeTileInner
        styleKey="weitere"
        Icon={item.icon}
        title={item.title}
        description={item.description}
      />
    </>
  );
  if (item.href) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={className}>
        {inner}
      </a>
    );
  }
  return (
    <Link to={item.path ?? '/'} className={className}>
      {inner}
    </Link>
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

// Default order: Agentura first, then the office apps, then Spaces (after Wissen).
const OFFICE_ROW_TOOLS: WorkplaceToolItem[] = [
  byId('agents'),
  ...OFFICE_TOOLS,
  byId('spaces'),
].filter((t): t is WorkplaceToolItem => Boolean(t));

// The Arbeiten tool row: colored creation tiles + the Weitere toggle tile, in one
// horizontal Wissen-style scroll strip. Favourited tools float to the front
// (default order otherwise); the Weitere toggle isn't favouritable, so it stays
// last. Clicking Weitere reveals its tools as a second tile row below the strip.
export const OfficeSection = React.memo(() => {
  const favouriteIds = useSidebarFavouritesStore((s) => s.favouriteIds);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const tiles = useMemo(
    () => sortToolsByFavourites(filterWorkplaceTools(OFFICE_ROW_TOOLS), favouriteIds),
    [favouriteIds]
  );
  const openMenu = TOOL_MENUS.find((menu) => menu.id === openMenuId);

  return (
    <>
      <div className={OFFICE_SCROLL_ROW} style={officeStripStyle(tiles.length + TOOL_MENUS.length)}>
        {tiles.map((tool) => (
          <div key={tool.id} className={OFFICE_SCROLL_ITEM}>
            <OfficeTile tool={tool} />
          </div>
        ))}
        {TOOL_MENUS.map((menu) => (
          <div key={menu.id} className={OFFICE_SCROLL_ITEM}>
            <OfficeExpandTile
              menu={menu}
              open={openMenuId === menu.id}
              onToggle={() => setOpenMenuId((prev) => (prev === menu.id ? null : menu.id))}
            />
          </div>
        ))}
      </div>
      {openMenu && (
        <div
          className={`${OFFICE_SCROLL_ROW} mt-3 sm:mt-4`}
          style={officeStripStyle(openMenu.items.length, { maxTilePx: 200 })}
        >
          {openMenu.items.map((item) => (
            <div key={item.id} className={OFFICE_SCROLL_ITEM}>
              <OfficeMenuItemTile item={item} />
            </div>
          ))}
        </div>
      )}
    </>
  );
});

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

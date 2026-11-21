import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import React, { useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { Link } from 'react-router-dom';

import FavouriteStar from '../../../components/common/FavouriteStar';
import { getIcon } from '../../../config/icons';
import { getToolTheme } from '../../../config/toolTheme';
import { isFavouritableTool, type WorkplaceToolItem } from '../../../config/workplaceToolsConfig';

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

// Tile colours (and each tool's matching page gradient) live in the shared
// `config/toolTheme` registry so a tile and its subpage never drift.

// Icon pinned top, label pinned bottom (justify-between) so icons and descriptions
// line up across tiles regardless of how many lines a title wraps to — that even
// alignment is what keeps the strip tidy. Internals shrink at lg where the 6.5-up
// tiles are smallest.
//
// `h-full` beside `aspect-square`: on phone widths the tile is ~120px wide but a
// two-line title makes the content ~150px tall, so the square no longer sets the
// height — the content does, and tiles with a one-line title stayed shorter (28px
// apart on a 360px-wide phone). Stretching each tile to its flex-stretched wrapper
// makes the row uniform again; where the square is the taller of the two it still
// wins, so tablet/desktop are unchanged.
const OFFICE_TILE_BASE =
  'group relative flex aspect-square h-full flex-col justify-between gap-2 rounded-2xl p-4 no-underline ' +
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

// Pill layout for the /office and /studio landing "create" strips (design 2a
// — see the "Pills, volle Bezeichnung" variant): a centered, WRAPPING row of
// icon+label pills instead of square cards. Only 4-5 items per strip, so it
// wraps onto a second line on narrow viewports rather than scrolling or
// clipping — fully responsive with no fixed tile widths.
export const OFFICE_PILL_ROW = 'flex flex-wrap items-center justify-center gap-2.5';

// Pill colour comes from the same `toolTheme` pastel field the square
// Arbeiten tiles use (via `styleKey`/`themeKey`, same override convention as
// `OfficeActionTile`/`OfficeTile`). Both landing pages currently pass a
// single page-wide key ("office" / "canvas") so every pill in a strip shares
// one hue, matching the tiles they replaced; leaving the override unset
// falls back to each tool's own id, so a caller can opt into per-tool colour
// instead (Reel pink, KI-Bilder violet, ...) if that's ever wanted.
const OFFICE_PILL_BASE =
  'inline-flex h-[38px] shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full px-4 ' +
  'text-sm font-semibold no-underline transition-shadow duration-150 ' +
  'hover:shadow-[0_2px_8px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_2px_8px_rgba(0,0,0,0.30)] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-600';

function OfficePillInner({
  styleKey,
  Icon,
  title,
}: {
  styleKey: string;
  Icon: IconType;
  title: string;
}) {
  const theme = getToolTheme(styleKey);
  return (
    <>
      <span className={`flex text-[17px] ${theme?.icon ?? 'text-secondary-600'}`}>
        <Icon />
      </span>
      <span className={theme?.title ?? 'text-foreground-heading'}>{title}</span>
    </>
  );
}

// Navigation pill (a Link) — the /studio landing strip. `themeKey` overrides
// the colour source same as `OfficeTile`; left unset it reads `tool.id` so
// each tool (canvas-vorlagen, canvas-ki, reels-untertitel …)
// keeps its own hue. Favouritable tools keep the same pin-to-sidebar star
// `OfficeTile` has — the Link becomes a stretched overlay (`absolute inset-0`)
// so the star (a <button>, invalid nested inside an <a>) stays a sibling,
// independently clickable/focusable, same idiom `FavouriteStar` documents.
export function OfficeTilePill({ tool, themeKey }: { tool: WorkplaceToolItem; themeKey?: string }) {
  const favouritable = isFavouritableTool(tool);
  const styleKey = themeKey ?? tool.id;
  return (
    <div
      className={`group relative ${OFFICE_PILL_BASE} ${getToolTheme(styleKey)?.tile ?? 'bg-grey-50 dark:bg-grey-800/40'}`}
    >
      <Link
        to={tool.path ?? '/'}
        className="absolute inset-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-600"
      >
        <span className="sr-only">{tool.title}</span>
      </Link>
      <span className="pointer-events-none flex items-center gap-2">
        <OfficePillInner styleKey={styleKey} Icon={tool.icon} title={tool.title} />
      </span>
      {favouritable && <FavouriteStar id={tool.id} size={14} />}
    </div>
  );
}

// Action pill (a button) — the /office landing strip creates an empty
// doc/board/sheet/pres (or opens the template gallery) in place. `styleKey`
// is the tool id (docs/boards/sheets/presentations/vorlagen), each with its
// own `toolTheme` entry. `active` is opt-in for callers that use the pill row
// as an exclusive filter (e.g. Agentura's category strip) rather than a set
// of one-shot create actions — Studio/Office never pass it, so their pills
// stay pixel-identical.
export function OfficeActionPill({
  styleKey,
  icon: Icon,
  title,
  active,
  onClick,
}: {
  styleKey: string;
  icon: IconType;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`${OFFICE_PILL_BASE} ${getToolTheme(styleKey)?.tile ?? 'bg-grey-50 dark:bg-grey-800/40'} ${active ? 'ring-2 ring-inset ring-foreground dark:ring-white' : ''}`}
    >
      <OfficePillInner styleKey={styleKey} Icon={Icon} title={title} />
    </button>
  );
}

export function OfficeMenuPill({
  styleKey,
  icon: Icon,
  title,
  tools,
}: {
  styleKey: string;
  icon: IconType;
  title: string;
  tools: WorkplaceToolItem[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className={`${OFFICE_PILL_BASE} ${getToolTheme(styleKey)?.tile ?? 'bg-grey-50 dark:bg-grey-800/40'}`}
      >
        <OfficePillInner styleKey={styleKey} Icon={Icon} title={title} />
        <FiChevronDown
          aria-hidden="true"
          className={`-ml-0.5 size-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="min-w-[280px] rounded-xl p-1.5">
        {tools.map((tool) => {
          const theme = getToolTheme(tool.id);
          const content = (
            <>
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${theme?.tile ?? 'bg-grey-50 dark:bg-grey-800/40'}`}
              >
                <tool.icon className={`size-5 ${theme?.icon ?? ''}`} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="font-medium text-foreground-heading">{tool.title}</span>
                {tool.description && (
                  <span className="text-xs text-muted-foreground">{tool.description}</span>
                )}
              </span>
            </>
          );
          return (
            <DropdownMenuItem key={tool.id} asChild className="gap-3 rounded-lg px-2.5 py-2">
              {tool.href ? (
                <a href={tool.href} target="_blank" rel="noopener noreferrer">
                  {content}
                </a>
              ) : (
                <Link to={tool.path ?? '/'}>{content}</Link>
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

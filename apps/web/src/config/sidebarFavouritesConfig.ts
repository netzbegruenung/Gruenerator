import {
  SYSTEM_NOTEBOOKS,
  isNotebookVisibleForLocale,
} from '../features/notebook/config/notebooksConfig';

import { getIcon } from './icons';
import {
  CANVAS_TOOLS,
  TOOL_MENUS,
  WORKPLACE_TOOLS,
  isFavouritableTool,
} from './workplaceToolsConfig';

import type { IconType } from './icons';

export interface FavouriteItemConfig {
  id: string;
  title: string;
  path: string;
  icon: IconType;
}

const TOOL_ITEMS: FavouriteItemConfig[] = [
  { id: 'office', title: 'Office', path: '/office', icon: getIcon('navigation', 'desk')! },
  {
    id: 'canvas',
    title: 'Bilder & Videos',
    path: '/studio',
    icon: getIcon('navigation', 'sharepic')!,
  },
  { id: 'wissen', title: 'Wissen', path: '/wissen', icon: getIcon('navigation', 'notebooks')! },
  {
    id: 'projekte',
    title: 'Projekte',
    path: '/projekte',
    icon: getIcon('navigation', 'projekte')!,
  },
  { id: 'suche', title: 'Suche', path: '/suche', icon: getIcon('navigation', 'suche')! },
  { id: 'scanner', title: 'Scanner', path: '/scanner', icon: getIcon('navigation', 'scanner')! },
  {
    id: 'transkription',
    title: 'Transkription',
    path: '/transkription',
    icon: getIcon('navigation', 'transkription')!,
  },
];

// Legacy ids kept ONLY so already-pinned favourites still resolve — they are
// part of the resolution map but not of the default export, so the global
// search never surfaces them (their paths are mere redirects to /office
// respectively /wissen).
const LEGACY_TOOL_ITEMS: FavouriteItemConfig[] = [
  { id: 'docs', title: 'Dokumente', path: '/docs', icon: getIcon('navigation', 'docs')! },
  { id: 'boards', title: 'Boards', path: '/boards', icon: getIcon('navigation', 'boards')! },
  { id: 'sheets', title: 'Tabellen', path: '/sheets', icon: getIcon('navigation', 'sheets')! },
  {
    id: 'presentations',
    title: 'Präsentationen',
    path: '/presentations',
    icon: getIcon('navigation', 'presentations')!,
  },
  {
    id: 'notebooks',
    title: 'Wissen',
    path: '/wissen',
    icon: getIcon('navigation', 'notebooks')!,
  },
  // Former ids of the /projekte tool (Gruppen → Spaces → Projekte renames).
  {
    id: 'gruppen',
    title: 'Projekte',
    path: '/projekte',
    icon: getIcon('navigation', 'projekte')!,
  },
  {
    id: 'spaces',
    title: 'Projekte',
    path: '/projekte',
    icon: getIcon('navigation', 'projekte')!,
  },
];

// Complete (incl. disabled + other-locale notebooks) so already-pinned
// favourites always resolve in the sidebar. Discovery surfaces must use
// getSearchableFavouriteItems instead.
const NOTEBOOK_ITEMS: FavouriteItemConfig[] = SYSTEM_NOTEBOOKS.map((nb) => ({
  id: nb.id,
  title: nb.title,
  path: nb.path,
  icon: nb.icon,
}));

// Workplace "Tools" tiles are favouritable straight from the grid. Only their
// id/title/path/icon are needed to resolve a pinned favourite in the sidebar,
// and only internal-route tools qualify (external-link tiles can't be pinned).
const WORKPLACE_TOOL_ITEMS: FavouriteItemConfig[] = [...WORKPLACE_TOOLS, ...CANVAS_TOOLS]
  .filter(isFavouritableTool)
  .map((tool) => ({
    id: tool.id,
    title: tool.title,
    path: tool.path,
    icon: tool.icon,
  }));

// Dropdown-card tools are favouritable from within the menu; register their
// internal-route entries so pinned ids resolve in the sidebar.
const MENU_TOOL_ITEMS: FavouriteItemConfig[] = TOOL_MENUS.flatMap((menu) =>
  menu.items.flatMap((item) =>
    item.path && !item.href
      ? [{ id: item.id, title: item.title, path: item.path, icon: item.icon }]
      : []
  )
);

const FAVOURITE_ITEMS: FavouriteItemConfig[] = [...TOOL_ITEMS, ...NOTEBOOK_ITEMS];

/**
 * Discovery variant for the global search (Cmd+K): tools plus only the
 * notebooks the viewer may see — enabled and audience-matched. The resolution
 * map below stays complete so pinned favourites never break.
 */
export const getSearchableFavouriteItems = (locale: string): FavouriteItemConfig[] => {
  const viewerLocale = locale === 'de-AT' ? ('de-AT' as const) : ('de-DE' as const);
  return [
    ...TOOL_ITEMS,
    ...SYSTEM_NOTEBOOKS.filter(
      (nb) => nb.enabled !== false && isNotebookVisibleForLocale(nb, viewerLocale)
    ).map((nb) => ({ id: nb.id, title: nb.title, path: nb.path, icon: nb.icon })),
  ];
};

const FAVOURITE_ITEMS_MAP = new Map(
  [...FAVOURITE_ITEMS, ...LEGACY_TOOL_ITEMS, ...WORKPLACE_TOOL_ITEMS, ...MENU_TOOL_ITEMS].map(
    (item) => [item.id, item]
  )
);

export const getFavouriteItemsById = (ids: string[]): FavouriteItemConfig[] =>
  ids.map((id) => FAVOURITE_ITEMS_MAP.get(id)).filter(Boolean) as FavouriteItemConfig[];

export const isFavouritableItem = (id: string): boolean => FAVOURITE_ITEMS_MAP.has(id);

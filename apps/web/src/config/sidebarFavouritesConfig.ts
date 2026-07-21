import { SYSTEM_NOTEBOOKS } from '../features/notebook/config/notebooksConfig';

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
  // Legacy office-app ids kept so already-pinned favourites still resolve; their
  // paths now redirect to the unified /office hub.
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
    id: 'canvas',
    title: 'Bilder & Videos',
    path: '/studio',
    icon: getIcon('navigation', 'sharepic')!,
  },
  { id: 'wissen', title: 'Wissen', path: '/wissen', icon: getIcon('navigation', 'notebooks')! },
  { id: 'gruppen', title: 'Spaces', path: '/gruppen', icon: getIcon('navigation', 'gruppen')! },
  { id: 'suche', title: 'Suche', path: '/suche', icon: getIcon('navigation', 'suche')! },
  {
    // Legacy id kept so already-pinned "Wissen" favourites still resolve.
    id: 'notebooks',
    title: 'Wissen',
    path: '/wissen',
    icon: getIcon('navigation', 'notebooks')!,
  },
  { id: 'scanner', title: 'Scanner', path: '/scanner', icon: getIcon('navigation', 'scanner')! },
  {
    id: 'transkription',
    title: 'Transkription',
    path: '/transkription',
    icon: getIcon('navigation', 'transkription')!,
  },
];

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

const FAVOURITE_ITEMS_MAP = new Map(
  [...FAVOURITE_ITEMS, ...WORKPLACE_TOOL_ITEMS, ...MENU_TOOL_ITEMS].map((item) => [item.id, item])
);

export const getFavouriteItemsById = (ids: string[]): FavouriteItemConfig[] =>
  ids.map((id) => FAVOURITE_ITEMS_MAP.get(id)).filter(Boolean) as FavouriteItemConfig[];

export const isFavouritableItem = (id: string): boolean => FAVOURITE_ITEMS_MAP.has(id);

export default FAVOURITE_ITEMS;

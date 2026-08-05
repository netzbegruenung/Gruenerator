import { getInstance, policyCoversTool } from '@gruenerator/shared/instances';

import { SYSTEM_NOTEBOOKS } from '../features/notebook/config/notebooksConfig';

import { CURRENT_INSTANCE } from './instance';
import {
  favouriteToolItems,
  gridFavouriteItems,
  legacyFavouriteItems,
  menuFavouriteItems,
} from './toolRegistry';

import type { IconType } from './icons';

export interface FavouriteItemConfig {
  id: string;
  title: string;
  path: string;
  icon: IconType;
}

// All tool data derives from config/toolRegistry.ts — edit tools there.

// The visible default set; its order feeds the global-search feature index.
const TOOL_ITEMS: FavouriteItemConfig[] = favouriteToolItems();

// Resolution-only entries for pinned favourites persisted under old tool ids —
// see LEGACY_FAVOURITE_ITEMS / LEGACY_TOOL_ID_ALIASES in the registry.
const LEGACY_TOOL_ITEMS: FavouriteItemConfig[] = legacyFavouriteItems();

const NOTEBOOK_ITEMS: FavouriteItemConfig[] = SYSTEM_NOTEBOOKS.map((nb) => ({
  id: nb.id,
  title: nb.title,
  path: nb.path,
  icon: nb.icon,
}));

// Workplace "Tools" tiles are favouritable straight from the grid, dropdown-card
// tools from within the menu. Only id/title/path/icon are needed to resolve a
// pinned favourite in the sidebar, and only internal-route tools qualify
// (external-link tiles can't be pinned).
const WORKPLACE_TOOL_ITEMS: FavouriteItemConfig[] = gridFavouriteItems();
const MENU_TOOL_ITEMS: FavouriteItemConfig[] = menuFavouriteItems();

const FAVOURITE_ITEMS: FavouriteItemConfig[] = [...TOOL_ITEMS, ...NOTEBOOK_ITEMS];

const FAVOURITE_ITEMS_MAP = new Map(
  [...FAVOURITE_ITEMS, ...LEGACY_TOOL_ITEMS, ...WORKPLACE_TOOL_ITEMS, ...MENU_TOOL_ITEMS].map(
    (item) => [item.id, item]
  )
);

// A pin made before an instance hid its tool (e.g. bgst hiding Vorlagen/Reels
// after a user already starred it) must stop resolving too — "hidden" means
// gone from the sidebar as well, not just the tile grids.
export const getFavouriteItemsById = (ids: string[]): FavouriteItemConfig[] => {
  const hidePolicy = getInstance(CURRENT_INSTANCE).hide;
  return ids
    .map((id) => FAVOURITE_ITEMS_MAP.get(id))
    .filter(Boolean)
    .filter((item) => !policyCoversTool(hidePolicy, item!.id)) as FavouriteItemConfig[];
};

export const isFavouritableItem = (id: string): boolean => FAVOURITE_ITEMS_MAP.has(id);

export default FAVOURITE_ITEMS;

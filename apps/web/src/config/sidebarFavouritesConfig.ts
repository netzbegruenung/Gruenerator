import { SYSTEM_NOTEBOOKS } from '../features/notebook/config/notebooksConfig';

import { getIcon } from './icons';

import type { IconType } from './icons';

export interface FavouriteItemConfig {
  id: string;
  title: string;
  path: string;
  icon: IconType;
}

const TOOL_ITEMS: FavouriteItemConfig[] = [
  { id: 'docs', title: 'Docs', path: '/desk', icon: getIcon('navigation', 'docs')! },
  { id: 'boards', title: 'Boards', path: '/desk', icon: getIcon('navigation', 'boards')! },
  { id: 'gruppen', title: 'Gruppen', path: '/gruppen', icon: getIcon('navigation', 'gruppen')! },
  { id: 'suche', title: 'Suche', path: '/suche', icon: getIcon('navigation', 'suche')! },
  {
    id: 'notebooks',
    title: 'Notebooks',
    path: '/recherche',
    icon: getIcon('navigation', 'notebooks')!,
  },
  {
    id: 'research',
    title: 'Recherche',
    path: '/research',
    icon: getIcon('navigation', 'research')!,
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

const FAVOURITE_ITEMS: FavouriteItemConfig[] = [...TOOL_ITEMS, ...NOTEBOOK_ITEMS];

const FAVOURITE_ITEMS_MAP = new Map(FAVOURITE_ITEMS.map((item) => [item.id, item]));

export const getFavouriteItemsById = (ids: string[]): FavouriteItemConfig[] =>
  ids.map((id) => FAVOURITE_ITEMS_MAP.get(id)).filter(Boolean) as FavouriteItemConfig[];

export const isFavouritableItem = (id: string): boolean => FAVOURITE_ITEMS_MAP.has(id);

export default FAVOURITE_ITEMS;

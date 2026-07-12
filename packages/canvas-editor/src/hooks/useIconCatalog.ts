import { useQuery } from '@tanstack/react-query';

import {
  loadIconSetCatalog,
  getIconSetCatalogSync,
  DEFAULT_ICON_SET,
  type IconDef,
} from '../utils/canvasIcons';

export const ICON_CATALOG_QUERY_KEY = ['canvas', 'icons', 'catalog'] as const;

/**
 * Load one icon set's catalog (names only). Defaults to the default set, so the
 * picker's first open only pays for that set; other sets load when selected.
 */
export function useIconCatalog(prefix: string = DEFAULT_ICON_SET) {
  return useQuery<IconDef[]>({
    queryKey: [...ICON_CATALOG_QUERY_KEY, prefix],
    queryFn: () => loadIconSetCatalog(prefix),
    initialData: () => getIconSetCatalogSync(prefix) ?? undefined,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

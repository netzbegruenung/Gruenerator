import { useQuery } from '@tanstack/react-query';

import {
  loadIconSetCatalog,
  getIconSetCatalogSync,
  loadAllIcons,
  DEFAULT_ICON_SET,
  type IconDef,
} from '../utils/canvasIcons';

export const ICON_CATALOG_QUERY_KEY = ['canvas', 'icons', 'catalog'] as const;

/**
 * Load one icon set's catalog (names only). Defaults to the default set, so the
 * picker's first open only pays for that set (used for the recommended strip).
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

/**
 * Load the combined catalog across all bundled sets. Gated by `enabled` so it
 * only pays for every set once the user actually browses/searches icons.
 */
export function useAllIconsCatalog(enabled: boolean) {
  return useQuery<IconDef[]>({
    queryKey: [...ICON_CATALOG_QUERY_KEY, '__all__'],
    queryFn: loadAllIcons,
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

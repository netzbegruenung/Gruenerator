import { useQuery } from '@tanstack/react-query';

import { loadAllIcons, getIconsSync, type IconDef } from '../utils/canvasIcons';

export const ICON_CATALOG_QUERY_KEY = ['canvas', 'icons', 'catalog'] as const;

export function useIconCatalog() {
  return useQuery<IconDef[]>({
    queryKey: ICON_CATALOG_QUERY_KEY,
    queryFn: loadAllIcons,
    initialData: () => getIconsSync() ?? undefined,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import { ICON_CATALOG_QUERY_KEY } from '@ggraphic/editor/hooks/useIconCatalog';
import { DEFAULT_ICON_SET, loadIconSetCatalog } from '@ggraphic/editor/utils/canvasIcons';
import { QueryClientContext } from '@tanstack/react-query';
import { useContext, useEffect } from 'react';

import { whenIdle } from '@ggraphic/editor/sidebar/sections/whenIdle';

import { AssetsSection, ToolsSection } from './index';

/**
 * Warms the Elemente tab while the editor is idle: its code chunk, the default
 * icon set and the stock photo catalogue. The first open then shows covers and
 * tiles instead of skeletons. Read-only HTTP, so a wasted warm-up costs nothing
 * but bandwidth; editors without the tab skip it.
 */
export function usePreloadElements(enabled: boolean) {
  const client = useContext(QueryClientContext);
  const { fetchStockImages } = useCanvasEditorServices();

  useEffect(() => {
    if (!enabled) return;
    const warm = () => {
      void AssetsSection.preload().catch(() => {});
      const chunk = import('@ggraphic/editor/sidebar/sections/assets/index');
      if (!client) return;
      void client.prefetchQuery({
        queryKey: [...ICON_CATALOG_QUERY_KEY, DEFAULT_ICON_SET],
        queryFn: () => loadIconSetCatalog(DEFAULT_ICON_SET),
        staleTime: Infinity,
      });
      if (fetchStockImages) void chunk.then((m) => m.prefetchStockPhotos(client, fetchStockImages));
    };
    return whenIdle(warm);
  }, [enabled, client, fetchStockImages]);
}

/** Warms the Tools tab's code chunk, so its tiles show on the first open. */
export function usePreloadTools(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    return whenIdle(() => void ToolsSection.preload().catch(() => {}));
  }, [enabled]);
}

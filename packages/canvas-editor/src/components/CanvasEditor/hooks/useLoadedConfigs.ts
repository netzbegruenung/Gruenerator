import { useEffect, useState } from 'react';

import type { CanvasConfigId, FullCanvasConfig } from '../../../configs/types';

interface UseLoadedConfigsParams {
  pages: Array<{ configId: CanvasConfigId }>;
  getConfigForPage: (configId: CanvasConfigId) => Promise<FullCanvasConfig>;
}

/**
 * Lazily loads + caches the full canvas config for every page's configId.
 * Returns the cache Map; consumers read `loadedConfigs.get(page.configId)`.
 */
export function useLoadedConfigs({
  pages,
  getConfigForPage,
}: UseLoadedConfigsParams): Map<CanvasConfigId, FullCanvasConfig> {
  const [loadedConfigs, setLoadedConfigs] = useState<Map<CanvasConfigId, FullCanvasConfig>>(
    new Map()
  );

  useEffect(() => {
    const loadConfigs = async () => {
      const configIdsToLoad = pages.map((p) => p.configId).filter((id) => !loadedConfigs.has(id));

      if (configIdsToLoad.length === 0) return;

      const newConfigs = new Map(loadedConfigs);
      await Promise.all(
        configIdsToLoad.map(async (configId) => {
          try {
            const config = await getConfigForPage(configId);
            newConfigs.set(configId, config);
          } catch (err) {
            console.error(`Failed to load config for ${configId}:`, err);
          }
        })
      );
      setLoadedConfigs(newConfigs);
    };

    void loadConfigs();
  }, [pages, loadedConfigs, getConfigForPage]);

  return loadedConfigs;
}

// SPDX-License-Identifier: MPL-2.0
import { useEffect, useState } from 'react';

import type { FullCanvasConfig } from '@ggraphic/editor/configs/types';

interface UseLoadedConfigsParams<TConfigId extends string> {
  pages: Array<{ configId: TConfigId }>;
  getConfigForPage: (configId: TConfigId) => Promise<FullCanvasConfig>;
}

/**
 * Lazily loads + caches the full canvas config for every page's configId.
 * Returns the cache Map; consumers read `loadedConfigs.get(page.configId)`.
 */
export function useLoadedConfigs<TConfigId extends string = string>({
  pages,
  getConfigForPage,
}: UseLoadedConfigsParams<TConfigId>): Map<TConfigId, FullCanvasConfig> {
  const [loadedConfigs, setLoadedConfigs] = useState<Map<TConfigId, FullCanvasConfig>>(new Map());

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

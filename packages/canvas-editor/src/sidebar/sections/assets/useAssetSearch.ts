import { useState, useMemo, useDeferredValue } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useDebounce } from '../../../hooks/useDebounce';
import { ALL_ASSETS, type UniversalAsset } from '../../../utils/canvasAssets';
import { getIconsSync, loadAllIcons, type IconDef } from '../../../utils/canvasIcons';
import { CHART_TYPE_DEFS, type ChartTypeDef } from '../../../utils/chartUtils';
import { filterIcons, filterIllustrations, matchesQuery } from '../../../utils/filterUtils';
import { FRAME_PRESETS } from '../../../utils/frameUtils';
import { ALL_ILLUSTRATIONS } from '../../../utils/illustrations/illustrationCatalog';
import { ALL_SHAPES, type ShapeDef } from '../../../utils/shapes';

import type { FrameClipType } from '../../../utils/frameUtils';
import type { IllustrationDef } from '../../../utils/illustrations/types';

export type SearchResultType = 'element' | 'shape' | 'chart' | 'icon' | 'illustration' | 'frame';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  name: string;
  asset?: UniversalAsset;
  shapeDef?: ShapeDef;
  chartTypeDef?: ChartTypeDef;
  iconDef?: IconDef;
  illustrationDef?: IllustrationDef;
  frameClipType?: FrameClipType;
}

interface FeatureFlags {
  hasAssetsFeature: boolean;
  hasShapesFeature: boolean;
  hasChartsFeature: boolean;
  hasIconsFeature: boolean;
  hasFramesFeature: boolean;
}

export interface AssetSearchState {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: SearchResult[];
  hasQuery: boolean;
  isTyping: boolean;
  isSearching: boolean;
  showResults: boolean;
  showNoResults: boolean;
  deferredQuery: string;
}

export function useAssetSearch(features: FeatureFlags): AssetSearchState {
  const {
    hasAssetsFeature,
    hasShapesFeature,
    hasChartsFeature,
    hasIconsFeature,
    hasFramesFeature,
  } = features;

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 300);
  const deferredQuery = useDeferredValue(debouncedQuery);

  // Browsing loads sets per-tab; a query, however, should search ALL sets. Load
  // every set once a query is entered, gated so the no-search path stays cheap.
  const allIconsQuery = useQuery({
    queryKey: ['canvas', 'icons', 'catalog', '__all__'],
    queryFn: loadAllIcons,
    enabled: hasIconsFeature && deferredQuery.trim().length > 0,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const allIcons = allIconsQuery.data;

  const searchResults = useMemo(() => {
    if (!deferredQuery.trim()) return [];

    const query = deferredQuery.toLowerCase();
    const results: SearchResult[] = [];

    if (hasAssetsFeature) {
      ALL_ASSETS.forEach((asset) => {
        if (matchesQuery(query, asset.label, asset.tags)) {
          results.push({ type: 'element', id: asset.id, name: asset.label, asset });
        }
      });
    }

    if (hasShapesFeature) {
      ALL_SHAPES.forEach((shape) => {
        if (matchesQuery(query, shape.name, shape.tags)) {
          results.push({ type: 'shape', id: shape.id, name: shape.name, shapeDef: shape });
        }
      });
    }

    if (hasChartsFeature) {
      CHART_TYPE_DEFS.forEach((def) => {
        if (matchesQuery(query, def.name, def.tags)) {
          results.push({ type: 'chart', id: def.id, name: def.name, chartTypeDef: def });
        }
      });
    }

    if (hasIconsFeature) {
      const matchingIcons = filterIcons(allIcons ?? getIconsSync() ?? [], query);
      for (const icon of matchingIcons.slice(0, 20)) {
        results.push({ type: 'icon', id: icon.id, name: icon.name, iconDef: icon });
      }
    }

    if (ALL_ILLUSTRATIONS.length > 0) {
      const matchingIllustrations = filterIllustrations(ALL_ILLUSTRATIONS, query);
      for (const ill of matchingIllustrations.slice(0, 30)) {
        results.push({ type: 'illustration', id: ill.id, name: ill.name, illustrationDef: ill });
      }
    }

    if (hasFramesFeature) {
      FRAME_PRESETS.forEach((preset) => {
        if (matchesQuery(query, preset.name, preset.tags)) {
          results.push({
            type: 'frame',
            id: preset.id,
            name: preset.name,
            frameClipType: preset.id,
          });
        }
      });
    }

    return results;
  }, [
    deferredQuery,
    hasAssetsFeature,
    hasShapesFeature,
    hasChartsFeature,
    hasIconsFeature,
    hasFramesFeature,
    allIcons,
  ]);

  const hasQuery = searchQuery.trim().length > 0;
  const hasDeferredQuery = deferredQuery.trim().length > 0;
  const isTyping = searchQuery !== debouncedQuery;
  const isSearching = hasQuery && (isTyping || !hasDeferredQuery);
  const showResults = hasDeferredQuery && searchResults.length > 0 && !isTyping;
  const showNoResults = hasDeferredQuery && searchResults.length === 0 && !isTyping;

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    hasQuery,
    isTyping,
    isSearching,
    showResults,
    showNoResults,
    deferredQuery,
  };
}

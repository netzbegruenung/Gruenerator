import { useState, useMemo, useDeferredValue } from 'react';

import useDebounce from '../../../../../../components/hooks/useDebounce';
import { ALL_ASSETS, type UniversalAsset } from '../../../utils/canvasAssets';
import { ALL_ICONS, type IconDef } from '../../../utils/canvasIcons';
import { filterIcons, filterIllustrations, matchesQuery } from '../../../utils/filterUtils';
import { FRAME_PRESETS } from '../../../utils/frameUtils';
import { ALL_ILLUSTRATIONS } from '../../../utils/illustrations/registry';
import { ALL_SHAPES, type ShapeDef } from '../../../utils/shapes';

import type { FrameClipType } from '../../../utils/frameUtils';
import type { IllustrationDef } from '../../../utils/illustrations/types';

export type SearchResultType = 'element' | 'shape' | 'icon' | 'illustration' | 'frame';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  name: string;
  asset?: UniversalAsset;
  shapeDef?: ShapeDef;
  iconDef?: IconDef;
  illustrationDef?: IllustrationDef;
  frameClipType?: FrameClipType;
}

interface FeatureFlags {
  hasAssetsFeature: boolean;
  hasShapesFeature: boolean;
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
  const { hasAssetsFeature, hasShapesFeature, hasIconsFeature, hasFramesFeature } = features;

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 300);
  const deferredQuery = useDeferredValue(debouncedQuery);

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

    if (hasIconsFeature) {
      const matchingIcons = filterIcons(ALL_ICONS, query);
      for (const icon of matchingIcons.slice(0, 20)) {
        results.push({ type: 'icon', id: icon.id, name: icon.name, iconDef: icon });
      }
    }

    if (ALL_ILLUSTRATIONS.length > 0) {
      for (const ill of filterIllustrations(ALL_ILLUSTRATIONS, query)) {
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
  }, [deferredQuery, hasAssetsFeature, hasShapesFeature, hasIconsFeature, hasFramesFeature]);

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

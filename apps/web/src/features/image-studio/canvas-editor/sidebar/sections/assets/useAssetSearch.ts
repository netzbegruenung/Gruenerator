import { useState, useMemo, useDeferredValue } from 'react';

import useDebounce from '../../../../../../components/hooks/useDebounce';
import { ALL_ASSETS, type UniversalAsset } from '../../../utils/canvasAssets';
import { ALL_ICONS, type IconDef } from '../../../utils/canvasIcons';
import { FRAME_PRESETS } from '../../../utils/frameUtils';
import { ALL_ILLUSTRATIONS } from '../../../utils/illustrations/registry';
import { getEnglishSearchTerms } from '../../../utils/searchTranslations';
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
        const matchesLabel = asset.label.toLowerCase().includes(query);
        const matchesTags = asset.tags.some((tag) => tag.toLowerCase().includes(query));
        if (matchesLabel || matchesTags) {
          results.push({ type: 'element', id: asset.id, name: asset.label, asset });
        }
      });
    }

    if (hasShapesFeature) {
      ALL_SHAPES.forEach((shape) => {
        const matchesName = shape.name.toLowerCase().includes(query);
        const matchesTags = shape.tags.some((tag) => tag.toLowerCase().includes(query));
        if (matchesName || matchesTags) {
          results.push({ type: 'shape', id: shape.id, name: shape.name, shapeDef: shape });
        }
      });
    }

    if (hasIconsFeature) {
      const englishTerms = getEnglishSearchTerms(query);
      let iconCount = 0;
      for (const icon of ALL_ICONS) {
        if (iconCount >= 20) break;
        const iconNameLower = icon.name.toLowerCase();
        const matchesName = iconNameLower.includes(query);
        const matchesLibrary = icon.library.toLowerCase().includes(query);
        const matchesTranslation = englishTerms.some((term) => iconNameLower.includes(term));
        if (matchesName || matchesLibrary || matchesTranslation) {
          results.push({ type: 'icon', id: icon.id, name: icon.name, iconDef: icon });
          iconCount++;
        }
      }
    }

    if (ALL_ILLUSTRATIONS.length > 0) {
      const englishTermsForIllustrations = getEnglishSearchTerms(query);
      const matchingIllustrations = ALL_ILLUSTRATIONS.filter((ill) => {
        const nameLower = ill.name.toLowerCase();
        const matchesName = nameLower.includes(query);
        const matchesTags = ill.tags.some((tag) => tag.toLowerCase().includes(query));
        const matchesCategory =
          ill.source !== 'kawaii' &&
          (ill as unknown as { category?: string }).category?.toLowerCase().includes(query);
        const matchesTranslation = englishTermsForIllustrations.some(
          (term) =>
            nameLower.includes(term) || ill.tags.some((tag) => tag.toLowerCase().includes(term))
        );
        return matchesName || matchesTags || matchesCategory || matchesTranslation;
      });
      matchingIllustrations.forEach((ill) => {
        results.push({ type: 'illustration', id: ill.id, name: ill.name, illustrationDef: ill });
      });
    }

    if (hasFramesFeature) {
      FRAME_PRESETS.forEach((preset) => {
        const matchesName = preset.name.toLowerCase().includes(query);
        const matchesTags = preset.tags.some((tag) => tag.toLowerCase().includes(query));
        if (matchesName || matchesTags) {
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

import {
  ALL_ASSETS,
  assetMatchesLocale,
  type AssetAudience,
  EMOJI_ASSETS,
  STICKER_ASSETS,
  type UniversalAsset,
} from '../../../utils/canvasAssets';
import { type IconDef } from '../../../utils/canvasIcons';
import { CHART_TYPE_DEFS, type ChartTypeDef } from '../../../utils/chartUtils';
import { filterIcons, filterIllustrations, rankByQuery } from '../../../utils/filterUtils';
import { FRAME_PRESETS } from '../../../utils/frameUtils';
import { ALL_ILLUSTRATIONS } from '../../../utils/illustrations/illustrationCatalog';
import { ALL_SHAPES, type ShapeDef } from '../../../utils/shapes';

import type { FrameClipType } from '../../../utils/frameUtils';
import type { IllustrationDef } from '../../../utils/illustrations/types';

/** Stickers that share a file with a catalogue graphic would show up twice. */
const CATALOGUE_SRCS = new Set(ALL_ASSETS.map((a) => a.src));
const SEARCH_ONLY_STICKERS = STICKER_ASSETS.filter((a) => !CATALOGUE_SRCS.has(a.src));
const SEARCHABLE_ASSETS = [...ALL_ASSETS, ...SEARCH_ONLY_STICKERS, ...EMOJI_ASSETS];

const MAX_ICONS = 20;
const MAX_ILLUSTRATIONS = 30;

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

export interface AssetSearchFeatures {
  hasAssetsFeature: boolean;
  hasShapesFeature: boolean;
  hasChartsFeature: boolean;
  hasIconsFeature: boolean;
  hasFramesFeature: boolean;
}

/** Results grouped by type, each group ranked best match first. */
export function searchAssetCatalog(
  query: string,
  features: AssetSearchFeatures,
  userLocale: AssetAudience,
  icons: IconDef[]
): SearchResult[] {
  if (!query.trim()) return [];
  const results: SearchResult[] = [];

  if (features.hasAssetsFeature) {
    const assets = SEARCHABLE_ASSETS.filter((a) => assetMatchesLocale(a, userLocale));
    for (const asset of rankByQuery(assets, query, (a) => [a.label, a.tags])) {
      results.push({ type: 'element', id: asset.id, name: asset.label, asset });
    }
  }

  if (features.hasShapesFeature) {
    for (const shape of rankByQuery(ALL_SHAPES, query, (s) => [s.name, s.tags])) {
      results.push({ type: 'shape', id: shape.id, name: shape.name, shapeDef: shape });
    }
  }

  if (features.hasChartsFeature) {
    for (const def of rankByQuery(CHART_TYPE_DEFS, query, (d) => [d.name, d.tags])) {
      results.push({ type: 'chart', id: def.id, name: def.name, chartTypeDef: def });
    }
  }

  if (features.hasIconsFeature) {
    for (const icon of filterIcons(icons, query).slice(0, MAX_ICONS)) {
      results.push({ type: 'icon', id: icon.id, name: icon.name, iconDef: icon });
    }
  }

  for (const ill of filterIllustrations(ALL_ILLUSTRATIONS, query).slice(0, MAX_ILLUSTRATIONS)) {
    results.push({ type: 'illustration', id: ill.id, name: ill.name, illustrationDef: ill });
  }

  if (features.hasFramesFeature) {
    for (const preset of rankByQuery(FRAME_PRESETS, query, (p) => [p.name, p.tags])) {
      results.push({ type: 'frame', id: preset.id, name: preset.name, frameClipType: preset.id });
    }
  }

  return results;
}

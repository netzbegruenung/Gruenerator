// SPDX-License-Identifier: MPL-2.0
import { registeredAssetCatalog, type AssetInstance } from '@ggraphic/editor/utils/canvasAssets';
import { prefetchBackground } from '@ggraphic/editor/utils/illustrations/svgCache';
import { type ShapeInstance, type ShapeType } from '@ggraphic/editor/utils/shapes';
import { type UserImagePlacement } from '@ggraphic/editor/utils/userImageUtils';
import { useEffect } from 'react';

import { ElementsPanel } from './ElementsPanel.js';

import type { BackgroundControls } from '@ggraphic/editor/configs/types';
import type { BalkenInstance, BalkenMode } from '@ggraphic/editor/primitives/index';
import type { ChartInstance, ChartType } from '@ggraphic/editor/utils/chartUtils';
import type { FrameClipType, FrameInstance } from '@ggraphic/editor/utils/frameUtils';
import type { IllustrationInstance } from '@ggraphic/editor/utils/illustrations/types';
import type { StickerRef } from '@ggraphic/schema';

export interface ExtendedAssetsSectionProps {
  recommendedAssetIds?: string[];
  assetInstances?: AssetInstance[];
  selectedAssetId?: string | null;
  onAddAsset?: (assetId: string) => void;
  /** Adds a gallery sticker by ref; enables the Entdecken / Meine / Gemerkt lists. */
  onAddStickerAsset?: (ref: StickerRef) => void;
  /** Sets the page's background photo; enables the gallery's Hintergründe. */
  onSetBackgroundImage?: NonNullable<BackgroundControls['onImageChange']>;
  currentBackgroundSrc?: string;
  /** Places a stock photo as an image element; enables the Fotos category. */
  onAddImageFromUrl?: (url: string, name: string, options?: UserImagePlacement) => void;
  onUpdateAsset?: (id: string, partial: Partial<AssetInstance>) => void;
  onRemoveAsset?: (id: string) => void;
  onAddPillBadge?: (preset?: string) => void;
  onUpdatePillBadge?: (id: string, partial: unknown) => void;
  onRemovePillBadge?: (id: string) => void;
  onAddCircleBadge?: (preset?: string) => void;
  onUpdateCircleBadge?: (id: string, partial: unknown) => void;
  onRemoveCircleBadge?: (id: string) => void;
  selectedIcons?: string[];
  onIconToggle?: (iconId: string, selected: boolean) => void;
  maxIconSelections?: number;
  balkenInstances?: BalkenInstance[];
  selectedBalkenId?: string | null;
  onAddBalken?: (mode: BalkenMode) => void;
  onUpdateBalken?: (id: string, partial: Partial<BalkenInstance>) => void;
  onRemoveBalken?: (id: string) => void;
  onDuplicateBalken?: (id: string) => void;
  shapeInstances?: ShapeInstance[];
  selectedShapeId?: string | null;
  onAddShape?: (type: ShapeType, color?: string) => void;
  onUpdateShape?: (id: string, partial: Partial<ShapeInstance>) => void;
  onRemoveShape?: (id: string) => void;
  chartInstances?: ChartInstance[];
  onAddChart?: (chartType: ChartType) => void;
  illustrationInstances?: IllustrationInstance[];
  selectedIllustrationId?: string | null;
  onAddIllustration?: (id: string) => void;
  onUpdateIllustration?: (id: string, partial: Partial<IllustrationInstance>) => void;
  onRemoveIllustration?: (id: string) => void;
  onDuplicateIllustration?: (id: string) => void;
  frameInstances?: FrameInstance[];
  selectedFrameId?: string | null;
  onAddFrame?: (clipType: FrameClipType) => void;
  onUpdateFrame?: (id: string, partial: Partial<FrameInstance>) => void;
  onRemoveFrame?: (id: string) => void;
  onSetFrameImage?: (id: string, file: File, objectUrl: string) => void;
}

export function AssetsSection(props: ExtendedAssetsSectionProps) {
  const hasIllustrationsFeature = props.onAddIllustration !== undefined;

  // Background prefetch only featured/curated SVGs (not all 1,600+)
  useEffect(() => {
    if (!hasIllustrationsFeature) return;
    const featured = (registeredAssetCatalog().illustrations?.featured ?? []).map((ill) => ({
      id: ill.id,
      def: ill,
    }));
    if (featured.length === 0) return;
    if (typeof requestIdleCallback === 'function') {
      const handle = requestIdleCallback(() => prefetchBackground(featured), { timeout: 5000 });
      return () => cancelIdleCallback(handle);
    }
    const timer = setTimeout(() => prefetchBackground(featured), 1000);
    return () => clearTimeout(timer);
  }, [hasIllustrationsFeature]);

  return <ElementsPanel {...props} />;
}

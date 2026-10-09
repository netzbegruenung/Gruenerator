import { useEffect } from 'react';

import { useIconCatalog } from '../../../hooks/useIconCatalog';
import { useIsCanvasMobile } from '../../../hooks/useIsCanvasMobile';
import { type AssetInstance } from '../../../utils/canvasAssets';
import { prefetchBackground } from '../../../utils/illustrations/svgCache';
import { UNDRAW_FEATURED } from '../../../utils/illustrations/undraw';
import { type ShapeInstance, type ShapeType } from '../../../utils/shapes';

import { BrowseView } from './BrowseView';
import { MobileCatalogView } from './MobileCatalogView';
import { useAssetSearch } from './useAssetSearch';

import type { BalkenInstance, BalkenMode } from '../../../primitives';
import type { ChartInstance, ChartType } from '../../../utils/chartUtils';
import type { FrameClipType, FrameInstance } from '../../../utils/frameUtils';
import type { IllustrationInstance } from '../../../utils/illustrations/types';

export interface ExtendedAssetsSectionProps {
  recommendedAssetIds?: string[];
  assetInstances?: AssetInstance[];
  selectedAssetId?: string | null;
  onAddAsset?: (assetId: string) => void;
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
  const {
    onAddAsset,
    selectedIcons,
    onIconToggle,
    onAddShape,
    onAddChart,
    onAddIllustration,
    onAddFrame,
  } = props;

  const isMobile = useIsCanvasMobile();

  const hasAssetsFeature = onAddAsset !== undefined;
  const hasIconsFeature = selectedIcons !== undefined && onIconToggle !== undefined;
  // Loads the Iconify catalog when the section mounts (React Query, cached)
  // and re-renders the icon subsection + search once it arrives.
  useIconCatalog();
  const hasShapesFeature = onAddShape !== undefined;
  const hasChartsFeature = onAddChart !== undefined;
  const hasIllustrationsFeature = onAddIllustration !== undefined;
  const hasFramesFeature = onAddFrame !== undefined;

  const search = useAssetSearch({
    hasAssetsFeature,
    hasShapesFeature,
    hasChartsFeature,
    hasIconsFeature,
    hasFramesFeature,
  });

  // Background prefetch only featured/curated SVGs (not all 1,600+)
  useEffect(() => {
    if (!hasIllustrationsFeature) return;
    const featured = UNDRAW_FEATURED.map((ill) => ({ id: ill.id, def: ill }));
    if (featured.length === 0) return;
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => prefetchBackground(featured), { timeout: 5000 });
    } else {
      setTimeout(() => prefetchBackground(featured), 1000);
    }
  }, [hasIllustrationsFeature]);

  // --- Desktop: library view (jump bar + category strips) with drill-down ---
  // canvas-mobile:-m-3 cancels the panel's p-3 (also canvas-mobile-scoped) so
  // strips bleed to the panel edge; the view fills the panel height and
  // scrolls internally below search + chips.
  if (!isMobile) {
    return (
      <div className="flex flex-col flex-1 min-h-0 min-w-[296px] canvas-mobile:-m-3">
        <BrowseView search={search} {...props} />
      </div>
    );
  }

  // --- Mobile: search + category carousels with "Alle" drill-down ---
  return <MobileCatalogView search={search} {...props} />;
}

import { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { PiArrowLeft } from 'react-icons/pi';

import useDebounce from '../../../hooks/useDebounce';
import { useCanvasEditorServices } from '../../../CanvasEditorProvider';
import { ALL_ASSETS, type UniversalAsset } from '../../../utils/canvasAssets';
import { filterIllustrations, matchesQuery } from '../../../utils/filterUtils';
import {
  ALL_ILLUSTRATIONS,
  getIllustrationThumbPath,
  getIllustrationPath,
} from '../../../utils/illustrations/registry';
import { SIDEBAR_SECTION, SECTION_LABEL } from '../../primitives';
import { BadgeSection } from '../BadgeSection';
import { FormenSection } from '../FormenSection';
import { IconsSection } from '../IconsSection';
import { IllustrationenSection } from '../IllustrationenSection';
import { RahmenSection } from '../RahmenSection';

import { CATEGORY_CARDS, PREVIEW_COMPONENTS, type AssetView, type CategoryCardDef } from './constants';
import { SearchInput, SearchResultsGrid } from './SearchResultsGrid';

import type { ExtendedAssetsSectionProps } from './AssetsSection';
import type { AssetSearchState } from './useAssetSearch';
import type { AssetInstance } from '../../../utils/canvasAssets';
import type { ShapeInstance, ShapeType } from '../../../utils/shapes';
import type {
  IllustrationInstance,
  KawaiiIllustrationType,
  KawaiiInstance,
  SvgDef,
} from '../../../utils/illustrations/types';

import { cn } from '../../../utils/cn';

// --- Sub-components ---

function CategoryIconButton({ card, onClick }: { card: CategoryCardDef; onClick: () => void }) {
  const { Icon, IconComponent, image, maskImage, label, iconColor, hoverShadow, ring } = card;
  const usesIconColor = !image && !maskImage && !IconComponent;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex flex-col items-center gap-sm cursor-pointer bg-transparent border-none p-0 rounded-lg',
        'focus-visible:outline-none focus-visible:ring-2',
        ring,
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center size-20 rounded-full bg-transparent',
          'transition-[box-shadow] duration-200 ease-out',
          hoverShadow,
        )}
      >
        <span
          className={cn(
            'inline-flex items-center justify-center transition-transform duration-200 ease-out group-hover:scale-[1.04]',
            usesIconColor && 'text-3xl',
            usesIconColor && iconColor,
          )}
        >
          {image ? (
            <img src={image} alt="" className="size-12 object-contain" />
          ) : maskImage ? (
            <span
              aria-hidden
              className="block size-12 bg-secondary-600 dark:bg-secondary-300"
              style={{
                WebkitMaskImage: `url(${maskImage})`,
                maskImage: `url(${maskImage})`,
                WebkitMaskSize: 'contain',
                maskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                maskPosition: 'center',
              }}
            />
          ) : IconComponent ? (
            <IconComponent size={48} />
          ) : (
            <Icon />
          )}
        </span>
      </div>
      <span className="text-xs text-foreground text-center leading-tight max-w-20">
        {label}
      </span>
    </button>
  );
}

interface RecentItem {
  id: string;
  type: 'asset' | 'shape' | 'illustration';
  label: string;
  src?: string;
  color?: string;
  shapeType?: string;
  kawaiiType?: KawaiiIllustrationType;
  svgDef?: SvgDef;
}

function RecentItemThumbnail({ item, assetBaseUrl }: { item: RecentItem; assetBaseUrl: string }) {
  if (item.kawaiiType) {
    const KawaiiComponent = PREVIEW_COMPONENTS[item.kawaiiType];
    if (KawaiiComponent) {
      return <KawaiiComponent size={36} mood="happy" color="#005437" />;
    }
  }

  if (item.svgDef) {
    return (
      <img
        src={getIllustrationThumbPath(item.svgDef, assetBaseUrl)}
        alt={item.label}
        className="w-3/5 h-3/5 object-contain"
        loading="lazy"
        onError={(e) => {
          const img = e.currentTarget;
          if (!img.dataset.fallback && item.svgDef) {
            img.dataset.fallback = '1';
            img.src = getIllustrationPath(item.svgDef, assetBaseUrl);
          }
        }}
      />
    );
  }

  if (item.src) {
    return <img src={item.src} alt={item.label} className="w-3/5 h-3/5 object-contain" />;
  }

  return (
    <div
      className="w-3/5 h-3/5 rounded"
      style={{ backgroundColor: item.color ?? 'var(--color-grey-400)' }}
    />
  );
}

function RecentlyUsedGrid({
  items,
  assetBaseUrl,
  onAddAsset,
  onAddShape,
  onAddIllustration,
}: {
  items: RecentItem[];
  assetBaseUrl: string;
  onAddAsset?: (id: string) => void;
  onAddShape?: (type: ShapeType) => void;
  onAddIllustration?: (id: string) => void;
}) {
  if (items.length === 0) return null;

  const handleClick = (item: RecentItem) => {
    if (item.type === 'asset' && onAddAsset) onAddAsset(item.id);
    else if (item.type === 'shape' && onAddShape && item.shapeType) onAddShape(item.shapeType as ShapeType);
    else if (item.type === 'illustration' && onAddIllustration) onAddIllustration(item.id);
  };

  return (
    <div className="grid grid-cols-3 gap-1.5 w-full">
      {items.slice(0, 6).map((item) => (
        <button
          key={`${item.type}-${item.id}`}
          type="button"
          className="aspect-square rounded-lg bg-background-alt border border-transparent cursor-pointer transition-all duration-150 flex items-center justify-center hover:bg-hover-alt hover:border-grey-300 dark:hover:border-grey-600"
          onClick={() => handleClick(item)}
          title={item.label}
        >
          <RecentItemThumbnail item={item} assetBaseUrl={assetBaseUrl} />
        </button>
      ))}
    </div>
  );
}

function DrillDownHeader({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="flex items-center gap-2 w-full bg-transparent border-none cursor-pointer py-1.5 px-0 text-foreground text-sm font-semibold transition-colors duration-150 hover:text-primary-600 mb-2"
    >
      <PiArrowLeft size={16} />
      <span>{label}</span>
    </button>
  );
}

function AssetGrid({
  assets,
  onAddAsset,
}: {
  assets: UniversalAsset[];
  onAddAsset: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 w-full">
      {assets.map((asset) => (
        <button
          key={asset.id}
          className="flex items-center gap-3 p-3 rounded-lg bg-transparent border border-transparent cursor-pointer transition-[background,border-color] duration-150 hover:bg-hover-alt h-16"
          onClick={() => onAddAsset(asset.id)}
          type="button"
          title={`${asset.label} hinzufügen`}
        >
          <img
            src={asset.src}
            alt={asset.label}
            className="w-10 h-10 object-contain shrink-0"
          />
          <span className="text-xs text-foreground truncate">{asset.label}</span>
        </button>
      ))}
    </div>
  );
}

// --- Main BrowseView ---

interface BrowseViewProps extends ExtendedAssetsSectionProps {
  search: AssetSearchState;
}

export function BrowseView(props: BrowseViewProps) {
  const { search, ...sectionProps } = props;
  const [activeView, setActiveView] = useState<AssetView>('browse');
  const [drillDownQuery, setDrillDownQuery] = useState('');
  const debouncedDrillDownQuery = useDeferredValue(useDebounce(drillDownQuery, 200));

  useEffect(() => {
    setDrillDownQuery('');
  }, [activeView]);

  // Auto-navigate to Rahmen drill-down when a frame is selected on canvas
  useEffect(() => {
    if (sectionProps.selectedFrameId) {
      setActiveView('rahmen');
    }
  }, [sectionProps.selectedFrameId]);

  const hasAssetsFeature = sectionProps.onAddAsset !== undefined;
  const hasIconsFeature =
    sectionProps.selectedIcons !== undefined && sectionProps.onIconToggle !== undefined;
  const hasBalkenFeature = sectionProps.onAddBalken !== undefined;
  const hasShapesFeature = sectionProps.onAddShape !== undefined;
  const hasIllustrationsFeature = sectionProps.onAddIllustration !== undefined;
  const hasFramesFeature = sectionProps.onAddFrame !== undefined;

  const filteredIllustrations = useMemo(
    () => filterIllustrations(ALL_ILLUSTRATIONS, debouncedDrillDownQuery),
    [debouncedDrillDownQuery]
  );

  const availableCategories = useMemo(() => {
    const featureMap: Record<string, boolean> = {
      grafiken: hasAssetsFeature,
      extras: hasBalkenFeature,
      formen: hasShapesFeature,
      rahmen: hasFramesFeature,
      illustrationen: hasIllustrationsFeature,
      icons: hasIconsFeature,
    };
    return CATEGORY_CARDS.filter((card) => featureMap[card.id]);
  }, [
    hasAssetsFeature,
    hasBalkenFeature,
    hasShapesFeature,
    hasFramesFeature,
    hasIllustrationsFeature,
    hasIconsFeature,
  ]);

  const { assetBaseUrl = '' } = useCanvasEditorServices();

  const recentItems = useMemo<RecentItem[]>(() => {
    const items: RecentItem[] = [];
    if (sectionProps.assetInstances) {
      for (const inst of sectionProps.assetInstances) {
        const def = ALL_ASSETS.find((a) => a.id === (inst as AssetInstance).assetId);
        if (def) items.push({ id: def.id, type: 'asset', src: def.src, label: def.label });
      }
    }
    if (sectionProps.shapeInstances) {
      for (const shape of sectionProps.shapeInstances as ShapeInstance[]) {
        items.push({
          id: shape.id,
          type: 'shape',
          label: shape.type,
          color: shape.fill,
          shapeType: shape.type,
        });
      }
    }
    if (sectionProps.illustrationInstances) {
      for (const ill of sectionProps.illustrationInstances as IllustrationInstance[]) {
        const def = ALL_ILLUSTRATIONS.find((d) => d.id === ill.illustrationId);
        if (!def) continue;
        if (def.source === 'kawaii') {
          items.push({
            id: def.id,
            type: 'illustration',
            label: def.name,
            kawaiiType: def.id as KawaiiIllustrationType,
          });
        } else {
          items.push({
            id: def.id,
            type: 'illustration',
            label: def.name,
            svgDef: def as SvgDef,
          });
        }
      }
    }
    return items;
  }, [sectionProps.assetInstances, sectionProps.shapeInstances, sectionProps.illustrationInstances]);

  if (activeView !== 'browse') {
    return renderDrillDown();
  }

  return renderBrowse();

  // --- Browse view ---

  function renderBrowse() {
    return (
      <div className="flex flex-col gap-4 w-full min-w-0">
        <SearchInput
          value={search.searchQuery}
          onChange={search.setSearchQuery}
          placeholder="Elemente suchen..."
        />

        {search.hasQuery ? (
          <div className="[contain:layout_style] min-h-[60px]">
            {search.showResults && (
              <SearchResultsGrid
                results={search.searchResults}
                onAddAsset={sectionProps.onAddAsset}
                onAddShape={sectionProps.onAddShape}
                onAddIllustration={sectionProps.onAddIllustration}
                onAddFrame={sectionProps.onAddFrame}
                selectedIcons={sectionProps.selectedIcons}
                onIconToggle={sectionProps.onIconToggle}
                maxIconSelections={sectionProps.maxIconSelections}
              />
            )}
            {search.showNoResults && (
              <p className="text-sm text-grey-500 text-center py-8 px-4 m-0">
                Keine Ergebnisse für "{search.deferredQuery}"
              </p>
            )}
            {search.isSearching && (
              <p className="text-sm text-grey-500 text-center py-8 px-4 m-0 italic">Suche...</p>
            )}
          </div>
        ) : (
          <>
            {recentItems.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className={cn(SECTION_LABEL, 'mb-0')}>Zuletzt verwendet</h4>
                </div>
                <RecentlyUsedGrid
                  items={recentItems}
                  assetBaseUrl={assetBaseUrl}
                  onAddAsset={sectionProps.onAddAsset}
                  onAddShape={sectionProps.onAddShape}
                  onAddIllustration={sectionProps.onAddIllustration}
                />
              </div>
            )}

            {availableCategories.length > 0 && (
              <div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-3 justify-items-center">
                  {availableCategories.map((card) => (
                    <CategoryIconButton
                      key={card.id}
                      card={card}
                      onClick={() => setActiveView(card.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // --- Drill-down view ---

  function renderDrillDown() {
    const categoryLabel = CATEGORY_CARDS.find((c) => c.id === activeView)?.label ?? '';

    return (
      <div className="flex flex-col gap-2 w-full min-w-0">
        <DrillDownHeader label={categoryLabel} onBack={() => setActiveView('browse')} />

        {activeView !== 'extras' && (
          <SearchInput
            value={drillDownQuery}
            onChange={setDrillDownQuery}
            placeholder={`${categoryLabel} durchsuchen...`}
          />
        )}

        {activeView === 'grafiken' && hasAssetsFeature && (
          <GrafiksSectionContent
            onAddAsset={sectionProps.onAddAsset!}
            recommendedAssetIds={sectionProps.recommendedAssetIds}
            searchQuery={debouncedDrillDownQuery}
          />
        )}

        {activeView === 'extras' && hasBalkenFeature && (
          <BadgeSection onAddBalken={sectionProps.onAddBalken} />
        )}

        {activeView === 'formen' && hasShapesFeature && (
          <FormenSection
            onAddShape={sectionProps.onAddShape!}
            isExpanded
            searchQuery={debouncedDrillDownQuery}
          />
        )}

        {activeView === 'rahmen' && hasFramesFeature && (
          <RahmenSection
            onAddFrame={sectionProps.onAddFrame!}
            selectedFrame={
              sectionProps.frameInstances?.find((f) => f.id === sectionProps.selectedFrameId) ??
              null
            }
            onSetFrameImage={sectionProps.onSetFrameImage}
            onUpdateFrame={sectionProps.onUpdateFrame}
            onRemoveFrame={sectionProps.onRemoveFrame}
            searchQuery={debouncedDrillDownQuery}
          />
        )}

        {activeView === 'illustrationen' && hasIllustrationsFeature && (
          <IllustrationenSection
            onAddIllustration={sectionProps.onAddIllustration!}
            selectedIllustration={
              sectionProps.illustrationInstances?.find(
                (i) => i.id === sectionProps.selectedIllustrationId
              ) ?? null
            }
            onUpdateIllustration={sectionProps.onUpdateIllustration ?? (() => {})}
            onRemoveIllustration={sectionProps.onRemoveIllustration ?? (() => {})}
            onDuplicateIllustration={sectionProps.onDuplicateIllustration}
            isExpanded
            illustrations={filteredIllustrations}
          />
        )}

        {activeView === 'icons' && hasIconsFeature && (
          <IconsSection
            selectedIcons={sectionProps.selectedIcons ?? []}
            onIconToggle={sectionProps.onIconToggle ?? (() => {})}
            maxSelections={sectionProps.maxIconSelections}
            isExpanded
            searchQuery={debouncedDrillDownQuery}
          />
        )}
      </div>
    );
  }
}

// --- Grafiken content (shared between browse drill-down and mobile) ---

function GrafiksSectionContent({
  onAddAsset,
  recommendedAssetIds = [],
  searchQuery = '',
}: {
  onAddAsset: (assetId: string) => void;
  recommendedAssetIds?: string[];
  searchQuery?: string;
}) {
  const sortedAssets = useMemo(() => {
    const recommended = ALL_ASSETS.filter((a) => recommendedAssetIds.includes(a.id));
    const others = ALL_ASSETS.filter((a) => !recommendedAssetIds.includes(a.id));
    const all = [...recommended, ...others];
    if (!searchQuery.trim()) return all;
    return all.filter((a) => matchesQuery(searchQuery, a.label, a.tags));
  }, [recommendedAssetIds, searchQuery]);

  return (
    <div className={cn(SIDEBAR_SECTION, 'w-full')}>
      <AssetGrid assets={sortedAssets} onAddAsset={onAddAsset} />
    </div>
  );
}

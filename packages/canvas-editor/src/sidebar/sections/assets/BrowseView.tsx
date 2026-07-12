import { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react';
import { PiArrowLeft } from 'react-icons/pi';

import { useDebounce } from '../../../hooks/useDebounce';
import { useCanvasEditorServices } from '../../../CanvasEditorProvider';
import { ALL_ASSETS, sortLogoAssets, type UniversalAsset } from '../../../utils/canvasAssets';
import { filterIllustrations, matchesQuery } from '../../../utils/filterUtils';
import { ALL_ILLUSTRATIONS } from '../../../utils/illustrations/illustrationCatalog';
import { SIDEBAR_SECTION } from '../../sidebarStyles';
import { BadgeSection } from '../BadgeSection';
import { DiagrammeSection } from '../DiagrammeSection';
import { FormenSection } from '../FormenSection';
import { IconsSection } from '../IconsSection';
import { IllustrationenSection } from '../IllustrationenSection';
import { IllustrationThumb } from '../IllustrationThumb';
import { RahmenSection } from '../RahmenSection';

import { CategoryJumpBar, type JumpBarItem } from './CategoryJumpBar';
import { CategoryStrip, StripTile } from './CategoryStrip';
import { CATEGORY_CARDS, PREVIEW_COMPONENTS, type AssetView } from './constants';
import { SearchInput, SearchResultsGrid } from './SearchResultsGrid';
import {
  DiagrammeStripTiles,
  FormenStripTiles,
  IconStripTiles,
  IllustrationStripTiles,
  MarkeStripTiles,
  RahmenStripTiles,
} from './stripTiles';

import type { ExtendedAssetsSectionProps } from './AssetsSection';
import type { AssetSearchState } from './useAssetSearch';
import type { BalkenMode } from '../../../primitives';
import type { AssetInstance } from '../../../utils/canvasAssets';
import type { ShapeInstance, ShapeType } from '../../../utils/shapes';
import type {
  IllustrationInstance,
  KawaiiIllustrationType,
  SvgDef,
} from '../../../utils/illustrations/types';

import { cn } from '../../../utils/cn';

// --- Sub-components ---

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

function RecentItemThumbnail({ item }: { item: RecentItem }) {
  if (item.kawaiiType) {
    const KawaiiComponent = PREVIEW_COMPONENTS[item.kawaiiType];
    if (KawaiiComponent) {
      return <KawaiiComponent size={36} mood="happy" color="#005437" />;
    }
  }

  if (item.svgDef) {
    return (
      <IllustrationThumb
        def={item.svgDef}
        alt={item.label}
        className="w-3/5 h-3/5 object-contain"
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
          <img src={asset.src} alt={asset.label} className="w-10 h-10 object-contain shrink-0" />
          <span className="text-xs text-foreground truncate">{asset.label}</span>
        </button>
      ))}
    </div>
  );
}

// --- Main BrowseView ---

const RECENT_STRIP_ID = 'recent';
const RECENT_STRIP_COUNT = 8;
/** Offset (px) below a strip's top at which it counts as the active scroll-spy target */
const SCROLL_SPY_OFFSET = 48;

interface BrowseViewProps extends ExtendedAssetsSectionProps {
  search: AssetSearchState;
}

export function BrowseView(props: BrowseViewProps) {
  const { search, ...sectionProps } = props;
  const [activeView, setActiveView] = useState<AssetView>('browse');
  const [drillDownQuery, setDrillDownQuery] = useState('');
  const debouncedDrillDownQuery = useDeferredValue(useDebounce(drillDownQuery, 200));

  const [activeStrip, setActiveStrip] = useState<string | null>(null);
  const rowsRef = useRef<HTMLDivElement | null>(null);
  const spySuppressed = useRef(false);
  const spyFrame = useRef(0);

  useEffect(() => {
    setDrillDownQuery('');
  }, [activeView]);

  // The rows container remounts (drill-down, search) at scrollTop 0 — restart the spy
  useEffect(() => {
    setActiveStrip(null);
  }, [activeView, search.hasQuery]);

  // Auto-navigate to Rahmen drill-down when a frame is selected on canvas
  useEffect(() => {
    if (sectionProps.selectedFrameId) {
      setActiveView('rahmen');
    }
  }, [sectionProps.selectedFrameId]);

  const { userLocale = 'de-DE' } = useCanvasEditorServices();
  const hasAssetsFeature = sectionProps.onAddAsset !== undefined;
  const hasIconsFeature =
    sectionProps.selectedIcons !== undefined && sectionProps.onIconToggle !== undefined;
  const hasBalkenFeature = sectionProps.onAddBalken !== undefined;
  const hasShapesFeature = sectionProps.onAddShape !== undefined;
  const hasChartsFeature = sectionProps.onAddChart !== undefined;
  const hasIllustrationsFeature = sectionProps.onAddIllustration !== undefined;
  const hasFramesFeature = sectionProps.onAddFrame !== undefined;

  const filteredIllustrations = useMemo(
    () => filterIllustrations(ALL_ILLUSTRATIONS, debouncedDrillDownQuery),
    [debouncedDrillDownQuery]
  );

  const availableCategories = useMemo(() => {
    const featureMap: Record<string, boolean> = {
      marke: hasAssetsFeature || (hasBalkenFeature && userLocale === 'de-DE'),
      formen: hasShapesFeature,
      diagramme: hasChartsFeature,
      rahmen: hasFramesFeature,
      illustrationen: hasIllustrationsFeature,
      icons: hasIconsFeature,
    };
    return CATEGORY_CARDS.filter((card) => featureMap[card.id]);
  }, [
    hasAssetsFeature,
    hasBalkenFeature,
    hasShapesFeature,
    hasChartsFeature,
    hasFramesFeature,
    hasIllustrationsFeature,
    hasIconsFeature,
    userLocale,
  ]);

  const recentStripItems = useMemo<RecentItem[]>(() => {
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
    // One tile per distinct asset/shape-type/illustration
    const seen = new Set<string>();
    const out: RecentItem[] = [];
    for (const item of items) {
      const key = item.type === 'shape' ? `shape-${item.shapeType}` : `${item.type}-${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= RECENT_STRIP_COUNT) break;
    }
    return out;
  }, [
    sectionProps.assetInstances,
    sectionProps.shapeInstances,
    sectionProps.illustrationInstances,
  ]);

  const hasRecent = recentStripItems.length > 0;

  const jumpItems = useMemo<JumpBarItem[]>(() => {
    const items: JumpBarItem[] = [];
    if (hasRecent) items.push({ id: RECENT_STRIP_ID, label: 'Zuletzt' });
    for (const card of availableCategories) items.push({ id: card.id, label: card.label });
    return items;
  }, [hasRecent, availableCategories]);

  const currentActiveStrip =
    activeStrip && jumpItems.some((i) => i.id === activeStrip)
      ? activeStrip
      : (jumpItems[0]?.id ?? '');

  const handleJump = (id: string) => {
    setActiveStrip(id);
    const root = rowsRef.current;
    const target = root?.querySelector<HTMLElement>(`[data-strip-id="${id}"]`);
    if (!root || !target) return;
    // Silence the spy for the whole programmatic scroll: 'scrollend' where
    // supported, generous timeout as fallback (smooth-scroll duration is
    // browser- and distance-dependent).
    spySuppressed.current = true;
    if ('onscrollend' in root) {
      root.addEventListener(
        'scrollend',
        () => {
          spySuppressed.current = false;
        },
        { once: true }
      );
    } else {
      window.setTimeout(() => {
        spySuppressed.current = false;
      }, 1200);
    }
    root.scrollTo({ top: target.offsetTop, behavior: 'smooth' });
  };

  const handleRowsScroll = () => {
    if (spySuppressed.current || spyFrame.current) return;
    spyFrame.current = requestAnimationFrame(() => {
      spyFrame.current = 0;
      const root = rowsRef.current;
      if (!root) return;
      let current: string | null = null;
      const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 2;
      const strips = root.querySelectorAll<HTMLElement>('[data-strip-id]');
      if (atBottom) {
        // The last strips may be too short to ever reach the spy threshold
        current = strips[strips.length - 1]?.dataset.stripId ?? null;
      } else {
        const threshold = root.scrollTop + SCROLL_SPY_OFFSET;
        for (const el of strips) {
          if (el.offsetTop <= threshold) current = el.dataset.stripId ?? null;
        }
      }
      if (current) setActiveStrip(current);
    });
  };

  const handleRecentClick = (item: RecentItem) => {
    if (item.type === 'asset' && sectionProps.onAddAsset) sectionProps.onAddAsset(item.id);
    else if (item.type === 'shape' && sectionProps.onAddShape && item.shapeType)
      sectionProps.onAddShape(item.shapeType as ShapeType, item.color);
    else if (item.type === 'illustration' && sectionProps.onAddIllustration)
      sectionProps.onAddIllustration(item.id);
  };

  if (activeView !== 'browse') {
    return renderDrillDown();
  }

  return renderBrowse();

  // --- Browse view: library with jump bar + category strips ---

  function renderStripTiles(view: AssetView) {
    switch (view) {
      case 'marke':
        return (
          <MarkeStripTiles
            onAddAsset={sectionProps.onAddAsset}
            onAddBalken={sectionProps.onAddBalken}
            recommendedAssetIds={sectionProps.recommendedAssetIds}
          />
        );
      case 'formen':
        return <FormenStripTiles onAddShape={sectionProps.onAddShape!} />;
      case 'diagramme':
        return <DiagrammeStripTiles onAddChart={sectionProps.onAddChart!} />;
      case 'rahmen':
        return <RahmenStripTiles onAddFrame={sectionProps.onAddFrame!} />;
      case 'illustrationen':
        return <IllustrationStripTiles onAddIllustration={sectionProps.onAddIllustration!} />;
      case 'icons':
        return (
          <IconStripTiles
            selectedIcons={sectionProps.selectedIcons ?? []}
            onIconToggle={sectionProps.onIconToggle!}
            maxIconSelections={sectionProps.maxIconSelections}
          />
        );
      default:
        return null;
    }
  }

  function renderBrowse() {
    return (
      <div className="flex flex-col h-full min-h-0 w-full min-w-0">
        <div className="flex-none px-[18px] pt-4">
          <SearchInput
            value={search.searchQuery}
            onChange={search.setSearchQuery}
            placeholder="Elemente suchen..."
          />
        </div>

        {search.hasQuery ? (
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-[18px] pb-5 [contain:layout_style]">
            {search.showResults && (
              <SearchResultsGrid
                results={search.searchResults}
                onAddAsset={sectionProps.onAddAsset}
                onAddShape={sectionProps.onAddShape}
                onAddChart={sectionProps.onAddChart}
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
            <CategoryJumpBar
              items={jumpItems}
              activeId={currentActiveStrip}
              onSelect={handleJump}
            />
            <div
              ref={rowsRef}
              onScroll={handleRowsScroll}
              className="relative flex-1 min-h-0 overflow-y-auto scrollbar-thin pt-0.5 pb-5"
            >
              {hasRecent && (
                <CategoryStrip id={RECENT_STRIP_ID} title="Zuletzt verwendet">
                  {recentStripItems.map((item) => (
                    <StripTile
                      key={`${item.type}-${item.id}`}
                      title={item.label}
                      onClick={() => handleRecentClick(item)}
                    >
                      <RecentItemThumbnail item={item} />
                    </StripTile>
                  ))}
                </CategoryStrip>
              )}

              {availableCategories.map((card) => (
                <CategoryStrip
                  key={card.id}
                  id={card.id}
                  title={card.label}
                  onShowMore={() => setActiveView(card.id)}
                >
                  {renderStripTiles(card.id)}
                </CategoryStrip>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // --- Drill-down view ---

  function renderDrillDown() {
    const categoryLabel = CATEGORY_CARDS.find((c) => c.id === activeView)?.label ?? '';

    return (
      <div className="flex flex-col h-full min-h-0 w-full min-w-0">
        <div className="flex-none px-[18px] pt-3">
          <DrillDownHeader label={categoryLabel} onBack={() => setActiveView('browse')} />

          {activeView !== 'diagramme' && (
            <SearchInput
              value={drillDownQuery}
              onChange={setDrillDownQuery}
              placeholder={`${categoryLabel} durchsuchen...`}
            />
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-[18px] pb-5">
          {activeView === 'marke' && (
            <MarkeSectionContent
              onAddAsset={sectionProps.onAddAsset}
              onAddBalken={sectionProps.onAddBalken}
              recommendedAssetIds={sectionProps.recommendedAssetIds}
              searchQuery={debouncedDrillDownQuery}
            />
          )}

          {activeView === 'formen' && hasShapesFeature && (
            <FormenSection
              onAddShape={sectionProps.onAddShape!}
              isExpanded
              searchQuery={debouncedDrillDownQuery}
            />
          )}

          {activeView === 'diagramme' && hasChartsFeature && (
            <DiagrammeSection onAddChart={sectionProps.onAddChart!} />
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
      </div>
    );
  }
}

// --- Marke drill-down: locale-filtered logos + Balken (DE only) ---

const NO_RECOMMENDED_ASSETS: string[] = [];

function MarkeSectionContent({
  onAddAsset,
  onAddBalken,
  recommendedAssetIds = NO_RECOMMENDED_ASSETS,
  searchQuery = '',
}: {
  onAddAsset?: (assetId: string) => void;
  onAddBalken?: (mode: BalkenMode) => void;
  recommendedAssetIds?: string[];
  searchQuery?: string;
}) {
  const { userLocale = 'de-DE' } = useCanvasEditorServices();
  const showBalken = userLocale === 'de-DE' && onAddBalken !== undefined;

  const sortedAssets = useMemo(() => {
    const all = sortLogoAssets(recommendedAssetIds, userLocale);
    if (!searchQuery.trim()) return all;
    return all.filter((a) => matchesQuery(searchQuery, a.label, a.tags));
  }, [recommendedAssetIds, userLocale, searchQuery]);

  return (
    <div className={cn(SIDEBAR_SECTION, 'gap-md w-full')}>
      {onAddAsset && sortedAssets.length > 0 && (
        <section className="flex flex-col gap-2">
          <h5 className="text-sm font-bold text-[var(--editor-text)] m-0">Logos</h5>
          <AssetGrid assets={sortedAssets} onAddAsset={onAddAsset} />
        </section>
      )}
      {showBalken && (
        <section className="flex flex-col gap-2">
          <h5 className="text-sm font-bold text-[var(--editor-text)] m-0">Balken</h5>
          <BadgeSection onAddBalken={onAddBalken} />
        </section>
      )}
    </div>
  );
}

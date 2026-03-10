import { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { PiArrowLeft } from 'react-icons/pi';

import useDebounce from '../../../hooks/useDebounce';
import { ALL_ASSETS, type UniversalAsset } from '../../../utils/canvasAssets';
import { filterIllustrations, matchesQuery } from '../../../utils/filterUtils';
import { ALL_ILLUSTRATIONS } from '../../../utils/illustrations/registry';
import { CARD_GRID, SELECTABLE_CARD, SIDEBAR_SECTION, SECTION_LABEL } from '../../primitives';
import { BadgeSection } from '../BadgeSection';
import { FormenSection } from '../FormenSection';
import { IconsSection } from '../IconsSection';
import { IllustrationenSection } from '../IllustrationenSection';
import { RahmenSection } from '../RahmenSection';

import { CATEGORY_CARDS, type AssetView, type CategoryCardDef } from './constants';
import { SearchInput, SearchResultsGrid } from './SearchResultsGrid';

import type { ExtendedAssetsSectionProps } from './AssetsSection';
import type { AssetSearchState } from './useAssetSearch';

import { cn } from '../../../utils/cn';

// --- Sub-components ---

function CategoryCard({ card, onClick }: { card: CategoryCardDef; onClick: () => void }) {
  const { Icon, label } = card;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-secondary-50 dark:bg-secondary-900/20 border border-secondary-100 dark:border-secondary-800 cursor-pointer will-change-transform transition-[transform,box-shadow,border-color] duration-300 ease-out hover:scale-[1.02] hover:shadow-md hover:border-secondary-300 dark:hover:border-secondary-600 active:scale-[0.97] active:duration-100"
    >
      <Icon size={28} className="text-secondary-600" />
      <span className="text-xs font-semibold text-foreground">{label}</span>
    </button>
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
    <div className={CARD_GRID}>
      {assets.map((asset) => (
        <button
          key={asset.id}
          className={SELECTABLE_CARD}
          onClick={() => onAddAsset(asset.id)}
          type="button"
          title={`${asset.label} hinzufügen`}
        >
          <div className="flex items-center justify-center w-full h-full relative">
            <img
              src={asset.src}
              alt={asset.label}
              className="w-[70%] h-[70%] max-w-12 max-h-12 object-contain"
            />
          </div>
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

  const hasTextFeature =
    sectionProps.onAddHeader !== undefined || sectionProps.onAddText !== undefined;
  const hasAssetsFeature = sectionProps.onAddAsset !== undefined;
  const hasIconsFeature =
    sectionProps.selectedIcons !== undefined && sectionProps.onIconToggle !== undefined;
  const hasBadgesFeature =
    sectionProps.onAddPillBadge !== undefined ||
    sectionProps.onAddCircleBadge !== undefined ||
    sectionProps.onAddBalken !== undefined;
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
      extras: hasBadgesFeature,
      formen: hasShapesFeature,
      rahmen: hasFramesFeature,
      illustrationen: hasIllustrationsFeature,
      icons: hasIconsFeature,
    };
    return CATEGORY_CARDS.filter((card) => featureMap[card.id]);
  }, [
    hasAssetsFeature,
    hasBadgesFeature,
    hasShapesFeature,
    hasFramesFeature,
    hasIllustrationsFeature,
    hasIconsFeature,
  ]);

  if (activeView !== 'browse') {
    return renderDrillDown();
  }

  return renderBrowse();

  // --- Browse view ---

  function renderBrowse() {
    return (
      <div className="flex flex-col gap-6 w-full min-w-0">
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
            {hasTextFeature && (
              <div className="flex gap-3">
                {sectionProps.onAddHeader && (
                  <button
                    type="button"
                    className="flex-1 py-2.5 rounded-lg bg-background-alt border border-transparent cursor-pointer transition-all duration-200 text-foreground text-center font-semibold font-[GrueneTypeNeue,Arial,sans-serif] text-base hover:bg-hover-alt hover:-translate-y-px active:translate-y-0"
                    onClick={sectionProps.onAddHeader}
                  >
                    Überschrift
                  </button>
                )}
                {sectionProps.onAddText && (
                  <button
                    type="button"
                    className="flex-1 py-2.5 rounded-lg bg-background-alt border border-transparent cursor-pointer transition-all duration-200 text-foreground text-center font-[PT_Sans,Arial,sans-serif] text-sm hover:bg-hover-alt hover:-translate-y-px active:translate-y-0"
                    onClick={sectionProps.onAddText}
                  >
                    Fließtext
                  </button>
                )}
              </div>
            )}

            {availableCategories.length > 0 && (
              <div>
                <h4 className={cn(SECTION_LABEL, 'mb-3')}>Kategorien durchsuchen</h4>
                <div className="grid grid-cols-2 gap-3">
                  {availableCategories.map((card) => (
                    <CategoryCard
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
      <div className="flex flex-col gap-2 w-full min-w-[260px]">
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

        {activeView === 'extras' && hasBadgesFeature && (
          <BadgeSection
            onAddPillBadge={sectionProps.onAddPillBadge}
            onAddCircleBadge={sectionProps.onAddCircleBadge}
            onAddBalken={sectionProps.onAddBalken}
          />
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

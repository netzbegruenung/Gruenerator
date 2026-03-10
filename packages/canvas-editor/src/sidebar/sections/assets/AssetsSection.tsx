import { useState, useEffect, useMemo } from 'react';
import { FaPuzzlePiece, FaSearch, FaShapes } from 'react-icons/fa';
import { HiSparkles } from 'react-icons/hi2';
import { PiFrameCornersFill, PiSmileyWink, PiTagFill, PiTextT } from 'react-icons/pi';

import { ALL_ASSETS, type AssetInstance } from '../../../utils/canvasAssets';
import { ALL_ICONS } from '../../../utils/canvasIcons';
import { ALL_ILLUSTRATIONS } from '../../../utils/illustrations/registry';
import { prefetchBackground } from '../../../utils/illustrations/svgCache';
import { ALL_SHAPES, type ShapeInstance, type ShapeType } from '../../../utils/shapes';
import {
  ACTION_BTN_TEXT,
  CARD_GRID,
  SELECTABLE_CARD,
  SIDEBAR_SECTION,
  SECTION_LABEL,
} from '../../primitives';
import { SubsectionTabBar, type Subsection } from '../../SubsectionTabBar';
import { BadgeSection } from '../BadgeSection';
import { FormenSection } from '../FormenSection';
import { IconsSection } from '../IconsSection';
import { IllustrationenSection } from '../IllustrationenSection';
import { RahmenSection } from '../RahmenSection';

import { BrowseView } from './BrowseView';
import { SearchInput, SearchResultsGrid } from './SearchResultsGrid';
import { useAssetSearch } from './useAssetSearch';

import type { BalkenInstance, BalkenMode } from '../../../primitives';
import type { FrameClipType, FrameInstance } from '../../../utils/frameUtils';
import type { IllustrationInstance, SvgDef } from '../../../utils/illustrations/types';

import { cn } from '../../../utils/cn';

export interface ExtendedAssetsSectionProps {
  onAddHeader?: () => void;
  onAddText?: () => void;
  recommendedAssetIds?: string[];
  assetInstances?: AssetInstance[];
  selectedAssetId?: string | null;
  onAddAsset?: (assetId: string) => void;
  onUpdateAsset?: (id: string, partial: Partial<AssetInstance>) => void;
  onRemoveAsset?: (id: string) => void;
  onDuplicateAsset?: (id: string) => void;
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
  onAddShape?: (type: ShapeType) => void;
  onUpdateShape?: (id: string, partial: Partial<ShapeInstance>) => void;
  onRemoveShape?: (id: string) => void;
  onDuplicateShape?: (id: string) => void;
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
    onAddHeader,
    onAddText,
    onAddAsset,
    onAddPillBadge,
    onAddCircleBadge,
    selectedIcons,
    onIconToggle,
    onAddBalken,
    onAddShape,
    onAddIllustration,
    onAddFrame,
  } = props;

  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 900
  );

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const hasTextFeature = onAddHeader !== undefined || onAddText !== undefined;
  const hasAssetsFeature = onAddAsset !== undefined;
  const hasIconsFeature = selectedIcons !== undefined && onIconToggle !== undefined;
  const hasBadgesFeature =
    onAddPillBadge !== undefined || onAddCircleBadge !== undefined || onAddBalken !== undefined;
  const hasShapesFeature = onAddShape !== undefined;
  const hasIllustrationsFeature = onAddIllustration !== undefined;
  const hasFramesFeature = onAddFrame !== undefined;

  const search = useAssetSearch({
    hasAssetsFeature,
    hasShapesFeature,
    hasIconsFeature,
    hasFramesFeature,
  });

  // Background prefetch SVG illustrations during idle time
  useEffect(() => {
    if (!hasIllustrationsFeature) return;
    const svgIllustrations = ALL_ILLUSTRATIONS.filter((ill) => ill.source !== 'kawaii').map(
      (ill) => ({ id: ill.id, def: ill as SvgDef })
    );
    if (svgIllustrations.length === 0) return;
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => prefetchBackground(svgIllustrations), { timeout: 5000 });
    } else {
      setTimeout(() => prefetchBackground(svgIllustrations), 1000);
    }
  }, [hasIllustrationsFeature]);

  // --- Desktop: Canva-style browse/drill-down ---
  if (!isMobile) {
    return (
      <div className={cn(SIDEBAR_SECTION, 'w-full')}>
        <BrowseView search={search} {...props} />
      </div>
    );
  }

  // --- Mobile: existing SubsectionTabBar ---
  return (
    <MobileView
      {...{
        ...props,
        search,
        hasTextFeature,
        hasAssetsFeature,
        hasIconsFeature,
        hasBadgesFeature,
        hasShapesFeature,
        hasIllustrationsFeature,
        hasFramesFeature,
      }}
    />
  );
}

// --- Mobile subsection builder (extracted to reduce AssetsSection size) ---

interface MobileViewProps extends ExtendedAssetsSectionProps {
  search: ReturnType<typeof useAssetSearch>;
  hasTextFeature: boolean;
  hasAssetsFeature: boolean;
  hasIconsFeature: boolean;
  hasBadgesFeature: boolean;
  hasShapesFeature: boolean;
  hasIllustrationsFeature: boolean;
  hasFramesFeature: boolean;
}

function MobileView({
  search,
  hasTextFeature,
  hasAssetsFeature,
  hasIconsFeature,
  hasBadgesFeature,
  hasShapesFeature,
  hasIllustrationsFeature,
  hasFramesFeature,
  onAddHeader,
  onAddText,
  recommendedAssetIds = [],
  onAddAsset,
  onAddPillBadge,
  onAddCircleBadge,
  onAddBalken,
  selectedIcons,
  onIconToggle,
  maxIconSelections = 3,
  onAddShape,
  onAddIllustration,
  onUpdateIllustration,
  onRemoveIllustration,
  onDuplicateIllustration,
  illustrationInstances,
  selectedIllustrationId,
  frameInstances,
  selectedFrameId,
  onAddFrame,
  onRemoveFrame,
  onSetFrameImage,
}: MobileViewProps) {
  const [formenExpanded, setFormenExpanded] = useState(false);
  const [iconsExpanded, setIconsExpanded] = useState(false);
  const [illustrationenExpanded, setIllustrationenExpanded] = useState(false);

  const sortedAssets = useMemo(() => {
    const recommended = ALL_ASSETS.filter((a) => recommendedAssetIds.includes(a.id));
    const others = ALL_ASSETS.filter((a) => !recommendedAssetIds.includes(a.id));
    return [...recommended, ...others];
  }, [recommendedAssetIds]);

  const subsections: Subsection[] = [];

  if (hasTextFeature) {
    subsections.push({
      id: 'text',
      icon: PiTextT,
      label: 'Text',
      content: (
        <div className={cn(SIDEBAR_SECTION, 'w-full')}>
          <h4
            className={cn(
              SECTION_LABEL,
              'flex items-center gap-2 mt-5 first:mt-0 max-canvas-mobile:hidden'
            )}
          >
            <PiTextT size={14} />
            <span>Text hinzufügen</span>
          </h4>
          <div className="flex flex-row gap-[var(--spacing-small)] p-0 max-canvas-mobile:gap-[var(--spacing-xsmall)]">
            {onAddHeader && (
              <button
                className="flex flex-col items-center justify-center p-md bg-transparent border border-transparent rounded-lg cursor-pointer transition-all duration-200 text-foreground w-full text-center font-semibold h-20 font-[GrueneTypeNeue,Arial,sans-serif] text-[length:var(--font-size-xl)] hover:bg-hover-alt hover:-translate-y-px active:translate-y-0 max-canvas-mobile:h-14 max-canvas-mobile:p-sm max-canvas-mobile:text-[13px]"
                onClick={onAddHeader}
              >
                <span>Überschrift</span>
              </button>
            )}
            {onAddText && (
              <button
                className="flex flex-col items-center justify-center p-md bg-transparent border border-transparent rounded-lg cursor-pointer transition-all duration-200 text-foreground w-full text-center font-semibold h-20 font-[PT_Sans,Arial,sans-serif] text-[length:var(--font-size-lg)] font-normal hover:bg-hover-alt hover:-translate-y-px active:translate-y-0 max-canvas-mobile:h-14 max-canvas-mobile:p-sm max-canvas-mobile:text-[13px]"
                onClick={onAddText}
              >
                <span>Fließtext</span>
              </button>
            )}
          </div>
        </div>
      ),
    });
  }

  subsections.push({
    id: 'suche',
    icon: FaSearch,
    label: 'Suche',
    content: (
      <div
        className={cn(SIDEBAR_SECTION, 'w-full max-canvas-mobile:flex max-canvas-mobile:flex-col')}
      >
        <SearchInput value={search.searchQuery} onChange={search.setSearchQuery} />
        <div
          className={cn(
            '[contain:layout_style]',
            search.hasQuery && 'min-h-[60px]',
            'max-canvas-mobile:order-1 max-canvas-mobile:flex-1 max-canvas-mobile:max-h-[45vh] max-canvas-mobile:overflow-y-auto max-canvas-mobile:overscroll-contain',
            search.hasQuery && 'max-canvas-mobile:min-h-[80px]'
          )}
        >
          {search.showResults && (
            <SearchResultsGrid
              results={search.searchResults}
              onAddAsset={onAddAsset}
              onAddShape={onAddShape}
              onAddIllustration={onAddIllustration}
              onAddFrame={onAddFrame}
              selectedIcons={selectedIcons}
              onIconToggle={onIconToggle}
              maxIconSelections={maxIconSelections}
            />
          )}
          {search.showNoResults && (
            <p className="text-sm text-grey-500 text-center py-8 px-4 m-0">
              Keine Ergebnisse für "{search.deferredQuery}"
            </p>
          )}
          {search.isSearching && (
            <p className="text-sm text-grey-500 text-center py-8 px-4 m-0 italic min-[900px]:hidden">
              Suche...
            </p>
          )}
          {!search.hasQuery && (
            <p className="text-sm text-grey-500 text-center py-8 px-4 m-0 italic min-[900px]:hidden">
              Tippe um zu suchen
            </p>
          )}
        </div>
      </div>
    ),
  });

  if (hasAssetsFeature) {
    subsections.push({
      id: 'grafiken',
      icon: FaPuzzlePiece,
      label: 'Grafiken',
      content: (
        <div className={cn(SIDEBAR_SECTION, 'w-full')}>
          <div className="max-canvas-mobile:flex-1 max-canvas-mobile:min-w-0">
            <h4
              className={cn(
                SECTION_LABEL,
                'flex items-center gap-2 mt-5 first:mt-0 max-canvas-mobile:hidden'
              )}
            >
              <FaPuzzlePiece size={12} />
              <span>Grafiken</span>
            </h4>
            <div className={CARD_GRID}>
              {sortedAssets.map((asset) => (
                <button
                  key={asset.id}
                  className={SELECTABLE_CARD}
                  onClick={() => onAddAsset!(asset.id)}
                  type="button"
                  title={`${asset.label} hinzufügen`}
                >
                  <div className="flex items-center justify-center w-full h-full relative">
                    <img
                      src={asset.src}
                      alt={asset.label}
                      className="w-[60%] h-[60%] max-w-8 max-h-8 object-contain"
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ),
    });
  }

  if (hasBadgesFeature) {
    subsections.push({
      id: 'badges',
      icon: PiTagFill,
      label: 'Extras',
      content: (
        <>
          <h4
            className={cn(
              SECTION_LABEL,
              'flex items-center gap-2 mt-5 first:mt-0 max-canvas-mobile:hidden'
            )}
          >
            <PiTagFill size={14} />
            <span>Extras</span>
          </h4>
          <BadgeSection
            onAddPillBadge={onAddPillBadge}
            onAddCircleBadge={onAddCircleBadge}
            onAddBalken={onAddBalken}
          />
        </>
      ),
    });
  }

  if (hasShapesFeature) {
    const hasMoreShapes = ALL_SHAPES.length > 4;
    subsections.push({
      id: 'formen',
      icon: FaShapes,
      label: 'Formen',
      content: (
        <>
          <h4
            className={cn(
              SECTION_LABEL,
              'flex items-center gap-2 mt-5 first:mt-0 max-canvas-mobile:hidden'
            )}
          >
            <FaShapes size={14} />
            <span>Formen</span>
            {hasMoreShapes && (
              <button
                className={ACTION_BTN_TEXT}
                onClick={() => setFormenExpanded(!formenExpanded)}
              >
                {formenExpanded ? 'Weniger anzeigen' : 'Alle anzeigen'}
              </button>
            )}
          </h4>
          <FormenSection onAddShape={onAddShape!} isExpanded={formenExpanded} />
        </>
      ),
    });
  }

  if (hasFramesFeature) {
    const selectedFrame = frameInstances?.find((f) => f.id === selectedFrameId) || null;
    subsections.push({
      id: 'rahmen',
      icon: PiFrameCornersFill,
      label: 'Rahmen',
      content: (
        <>
          <h4
            className={cn(
              SECTION_LABEL,
              'flex items-center gap-2 mt-5 first:mt-0 max-canvas-mobile:hidden'
            )}
          >
            <PiFrameCornersFill size={14} />
            <span>Rahmen</span>
          </h4>
          <RahmenSection
            onAddFrame={onAddFrame!}
            selectedFrame={selectedFrame}
            onSetFrameImage={onSetFrameImage}
            onRemoveFrame={onRemoveFrame}
          />
        </>
      ),
    });
  }

  if (hasIllustrationsFeature) {
    const selectedIllustration =
      illustrationInstances?.find((i) => i.id === selectedIllustrationId) || null;
    const hasMoreIllustrations = ALL_ILLUSTRATIONS.length > 4;
    subsections.push({
      id: 'illustrationen',
      icon: PiSmileyWink,
      label: 'Illustrationen',
      content: (
        <>
          <h4
            className={cn(
              SECTION_LABEL,
              'flex items-center gap-2 mt-5 first:mt-0 max-canvas-mobile:hidden'
            )}
          >
            <PiSmileyWink size={14} />
            <span>Illustrationen</span>
            {hasMoreIllustrations && (
              <button
                className={ACTION_BTN_TEXT}
                onClick={() => setIllustrationenExpanded(!illustrationenExpanded)}
              >
                {illustrationenExpanded ? 'Weniger anzeigen' : 'Alle anzeigen'}
              </button>
            )}
          </h4>
          <IllustrationenSection
            onAddIllustration={onAddIllustration!}
            selectedIllustration={selectedIllustration}
            onUpdateIllustration={onUpdateIllustration ?? (() => {})}
            onRemoveIllustration={onRemoveIllustration ?? (() => {})}
            onDuplicateIllustration={onDuplicateIllustration}
            isExpanded={illustrationenExpanded}
            illustrations={ALL_ILLUSTRATIONS}
          />
        </>
      ),
    });
  }

  if (hasIconsFeature) {
    const hasMoreIcons = ALL_ICONS.length > 4;
    subsections.push({
      id: 'icons',
      icon: HiSparkles,
      label: 'Icons',
      content: (
        <>
          <h4
            className={cn(
              SECTION_LABEL,
              'flex items-center gap-2 mt-5 first:mt-0 max-canvas-mobile:hidden'
            )}
          >
            <HiSparkles size={14} />
            <span>Icons</span>
            {hasMoreIcons && (
              <button className={ACTION_BTN_TEXT} onClick={() => setIconsExpanded(!iconsExpanded)}>
                {iconsExpanded ? 'Weniger anzeigen' : 'Alle anzeigen'}
              </button>
            )}
          </h4>
          <IconsSection
            selectedIcons={selectedIcons ?? []}
            onIconToggle={onIconToggle ?? (() => {})}
            maxSelections={maxIconSelections}
            isExpanded={iconsExpanded}
          />
        </>
      ),
    });
  }

  const defaultSubsection = hasTextFeature
    ? 'text'
    : hasAssetsFeature
      ? 'grafiken'
      : subsections[0]?.id || 'suche';

  return (
    <div className={cn(SIDEBAR_SECTION, 'w-full')}>
      <SubsectionTabBar subsections={subsections} defaultSubsection={defaultSubsection} />
    </div>
  );
}

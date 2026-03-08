import { useState, useMemo, useDeferredValue, useEffect } from 'react';
import { FaCheck, FaPuzzlePiece, FaShapes, FaSearch } from 'react-icons/fa';
import { HiSparkles } from 'react-icons/hi2';
import {
  PiFrameCornersFill,
  PiMagnifyingGlass,
  PiSmileyWink,
  PiTagFill,
  PiTextT,
} from 'react-icons/pi';
import {
  Planet,
  Cat,
  Ghost,
  IceCream,
  Browser,
  Mug,
  SpeechBubble,
  Backpack,
  CreditCard,
  File,
  Folder,
  type KawaiiProps,
} from 'react-kawaii';

import useDebounce from '../../../../../components/hooks/useDebounce';
import { ALL_ASSETS, type UniversalAsset, type AssetInstance } from '../../utils/canvasAssets';
import { ALL_ICONS, type IconDef } from '../../utils/canvasIcons';
import { FRAME_PRESETS } from '../../utils/frameUtils';
import { getIllustrationPath, ALL_ILLUSTRATIONS } from '../../utils/illustrations/registry';
import { prefetchBackground } from '../../utils/illustrations/svgCache';
import { getEnglishSearchTerms } from '../../utils/searchTranslations';
import { type ShapeInstance, type ShapeType, ALL_SHAPES, type ShapeDef } from '../../utils/shapes';
import { SubsectionTabBar, type Subsection } from '../SubsectionTabBar';

import { BadgeSection } from './BadgeSection';
import { BalkenSection } from './BalkenSection';
import { FormenSection } from './FormenSection';
import { IconsSection } from './IconsSection';
import { IllustrationenSection } from './IllustrationenSection';
import { RahmenSection } from './RahmenSection';

import type { BalkenInstance, BalkenMode } from '../../primitives';
import type { FrameClipType, FrameInstance } from '../../utils/frameUtils';
import type {
  IllustrationInstance,
  IllustrationDef,
  KawaiiIllustrationType,
  KawaiiDef,
  SvgDef,
} from '../../utils/illustrations/types';

import './AssetsSection.css';

// Unified search result item type
type SearchResultType = 'element' | 'shape' | 'icon' | 'illustration' | 'frame';

interface SearchResult {
  type: SearchResultType;
  id: string;
  name: string;
  // For elements
  asset?: UniversalAsset;
  // For shapes
  shapeDef?: ShapeDef;
  // For icons
  iconDef?: IconDef;
  // For illustrations
  illustrationDef?: IllustrationDef;
  // For frames
  frameClipType?: FrameClipType;
}

const PREVIEW_COMPONENTS: Record<KawaiiIllustrationType, React.FunctionComponent<KawaiiProps>> = {
  planet: Planet,
  cat: Cat,
  ghost: Ghost,
  iceCream: IceCream,
  browser: Browser,
  mug: Mug,
  speechBubble: SpeechBubble,
  backpack: Backpack,
  creditCard: CreditCard,
  file: File,
  folder: Folder,
};

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="assets-search">
      <PiMagnifyingGlass size={16} className="assets-search__icon" />
      <input
        type="text"
        placeholder="Suche..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="assets-search__input"
      />
    </div>
  );
}

function AssetGrid({
  assets,
  onAddAsset,
}: {
  assets: UniversalAsset[];
  onAddAsset: (assetId: string) => void;
}) {
  return (
    <div className="sidebar-card-grid">
      {assets.map((asset) => (
        <button
          key={asset.id}
          className="sidebar-selectable-card"
          onClick={() => onAddAsset(asset.id)}
          type="button"
          title={`${asset.label} hinzufügen`}
        >
          <div className="sidebar-selectable-card__preview">
            <img src={asset.src} alt={asset.label} className="asset-image" />
          </div>
        </button>
      ))}
    </div>
  );
}

interface SearchResultsGridProps {
  results: SearchResult[];
  onAddAsset?: (assetId: string) => void;
  onAddShape?: (type: ShapeType) => void;
  onAddIllustration?: (id: string) => void;
  onAddFrame?: (clipType: FrameClipType) => void;
  selectedIcons?: string[];
  onIconToggle?: (iconId: string, selected: boolean) => void;
  maxIconSelections?: number;
}

function SearchResultsGrid({
  results,
  onAddAsset,
  onAddShape,
  onAddIllustration,
  onAddFrame,
  selectedIcons = [],
  onIconToggle,
  maxIconSelections = 3,
}: SearchResultsGridProps) {
  return (
    <div className="sidebar-card-grid">
      {results.map((result) => {
        if (result.type === 'element' && result.asset && onAddAsset) {
          const asset = result.asset;
          return (
            <button
              key={`element-${result.id}`}
              className="sidebar-selectable-card"
              onClick={() => onAddAsset(asset.id)}
              type="button"
              title={`${asset.label} hinzufügen`}
            >
              <div className="sidebar-selectable-card__preview">
                <img src={asset.src} alt={asset.label} className="asset-image" />
              </div>
            </button>
          );
        }

        if (result.type === 'shape' && result.shapeDef && onAddShape) {
          const shape = result.shapeDef;
          return (
            <button
              key={`shape-${result.id}`}
              className="sidebar-selectable-card"
              onClick={() => onAddShape(shape.id)}
              type="button"
              title={shape.name}
            >
              <div className="sidebar-selectable-card__preview">
                {shape.id === 'rect' && <div className="formen-preview formen-preview--rect" />}
                {shape.id === 'circle' && <div className="formen-preview formen-preview--circle" />}
                {shape.id === 'triangle' && (
                  <div className="formen-preview formen-preview--triangle" />
                )}
                {['star', 'heart', 'cloud', 'arrow'].includes(shape.id) && (
                  <span style={{ fontSize: 24 }}>
                    {shape.id === 'star' && '★'}
                    {shape.id === 'heart' && '♥'}
                    {shape.id === 'cloud' && '☁'}
                    {shape.id === 'arrow' && '→'}
                  </span>
                )}
              </div>
            </button>
          );
        }

        if (result.type === 'icon' && result.iconDef && onIconToggle) {
          const icon = result.iconDef;
          const IconComponent = icon.component;
          const isSelected = selectedIcons.includes(icon.id);
          const isDisabled = !isSelected && selectedIcons.length >= maxIconSelections;

          return (
            <button
              key={`icon-${result.id}`}
              className={`sidebar-selectable-card ${isDisabled ? 'sidebar-selectable-card--disabled' : ''}`}
              onClick={() => !isDisabled && onIconToggle(icon.id, !isSelected)}
              type="button"
              title={icon.name}
              disabled={isDisabled}
            >
              <div className="sidebar-selectable-card__preview">
                <IconComponent size={24} />
                {isSelected && (
                  <span className="sidebar-selectable-card__check sidebar-selectable-card__check--small">
                    <FaCheck size={8} />
                  </span>
                )}
              </div>
            </button>
          );
        }

        if (result.type === 'illustration' && result.illustrationDef && onAddIllustration) {
          const ill = result.illustrationDef;
          if (ill.source === 'kawaii') {
            const kDef = ill as KawaiiDef;
            const PreviewComponent = PREVIEW_COMPONENTS[kDef.id];
            return (
              <button
                key={`ill-${result.id}`}
                className="sidebar-selectable-card"
                onClick={() => onAddIllustration(ill.id)}
                type="button"
                title={ill.name}
              >
                <div className="sidebar-selectable-card__preview illustration-preview">
                  <PreviewComponent size={32} mood="happy" color="#005437" />
                </div>
              </button>
            );
          } else {
            return (
              <button
                key={`ill-${result.id}`}
                className="sidebar-selectable-card"
                onClick={() => onAddIllustration(ill.id)}
                type="button"
                title={ill.name}
              >
                <div className="sidebar-selectable-card__preview illustration-preview illustration-preview--svg">
                  <img src={getIllustrationPath(ill as SvgDef)} alt={ill.name} loading="lazy" />
                </div>
              </button>
            );
          }
        }

        if (result.type === 'frame' && result.frameClipType && onAddFrame) {
          return (
            <button
              key={`frame-${result.id}`}
              className="sidebar-selectable-card"
              onClick={() => onAddFrame(result.frameClipType!)}
              type="button"
              title={result.name}
            >
              <div className="sidebar-selectable-card__preview">
                {result.frameClipType === 'circle' ? (
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      border: '2px dashed #005538',
                    }}
                  />
                ) : (
                  <PiFrameCornersFill size={24} />
                )}
              </div>
            </button>
          );
        }

        return null;
      })}
    </div>
  );
}

interface GrafiksSectionContentProps {
  onAddAsset: (assetId: string) => void;
  recommendedAssetIds?: string[];
}

function GrafiksSectionContent({
  onAddAsset,
  recommendedAssetIds = [],
}: GrafiksSectionContentProps) {
  // Sort assets: recommended first, then others
  const sortedAssets = useMemo(() => {
    const recommended = ALL_ASSETS.filter((a) => recommendedAssetIds.includes(a.id));
    const others = ALL_ASSETS.filter((a) => !recommendedAssetIds.includes(a.id));
    return [...recommended, ...others];
  }, [recommendedAssetIds]);

  return (
    <div className="sidebar-section sidebar-section--assets">
      <div className="assets-group">
        <h4 className="assets-section-header">
          <FaPuzzlePiece size={12} />
          <span>Grafiken</span>
        </h4>
        <AssetGrid assets={sortedAssets} onAddAsset={onAddAsset} />
      </div>
    </div>
  );
}

export interface ExtendedAssetsSectionProps {
  // Text creation props
  onAddHeader?: () => void;
  onAddText?: () => void;

  // Asset props (instance-based, replacing old toggle-based)
  recommendedAssetIds?: string[];
  assetInstances?: AssetInstance[];
  selectedAssetId?: string | null;
  onAddAsset?: (assetId: string) => void;
  onUpdateAsset?: (id: string, partial: Partial<AssetInstance>) => void;
  onRemoveAsset?: (id: string) => void;
  onDuplicateAsset?: (id: string) => void;

  // Pill badge props
  onAddPillBadge?: (preset?: string) => void;
  onUpdatePillBadge?: (id: string, partial: unknown) => void;
  onRemovePillBadge?: (id: string) => void;

  // Circle badge props
  onAddCircleBadge?: (preset?: string) => void;
  onUpdateCircleBadge?: (id: string, partial: unknown) => void;
  onRemoveCircleBadge?: (id: string) => void;

  // Icon props
  selectedIcons?: string[];
  onIconToggle?: (iconId: string, selected: boolean) => void;
  maxIconSelections?: number;

  // Balken props
  balkenInstances?: BalkenInstance[];
  selectedBalkenId?: string | null;
  onAddBalken?: (mode: BalkenMode) => void;
  onUpdateBalken?: (id: string, partial: Partial<BalkenInstance>) => void;
  onRemoveBalken?: (id: string) => void;
  onDuplicateBalken?: (id: string) => void;

  // Shape props
  shapeInstances?: ShapeInstance[];
  selectedShapeId?: string | null;
  onAddShape?: (type: ShapeType) => void;
  onUpdateShape?: (id: string, partial: Partial<ShapeInstance>) => void;
  onRemoveShape?: (id: string) => void;
  onDuplicateShape?: (id: string) => void;

  // Illustration props
  illustrationInstances?: IllustrationInstance[];
  selectedIllustrationId?: string | null;
  onAddIllustration?: (id: string) => void;
  onUpdateIllustration?: (id: string, partial: Partial<IllustrationInstance>) => void;
  onRemoveIllustration?: (id: string) => void;
  onDuplicateIllustration?: (id: string) => void;

  // Frame props
  frameInstances?: FrameInstance[];
  selectedFrameId?: string | null;
  onAddFrame?: (clipType: FrameClipType) => void;
  onUpdateFrame?: (id: string, partial: Partial<FrameInstance>) => void;
  onRemoveFrame?: (id: string) => void;
  onSetFrameImage?: (id: string, file: File, objectUrl: string) => void;
}

export function AssetsSection({
  onAddHeader,
  onAddText,
  recommendedAssetIds = [],
  assetInstances,
  selectedAssetId,
  onAddAsset,
  onUpdateAsset,
  onRemoveAsset,
  onDuplicateAsset,
  onAddPillBadge,
  onUpdatePillBadge,
  onRemovePillBadge,
  onAddCircleBadge,
  onUpdateCircleBadge,
  onRemoveCircleBadge,
  selectedIcons,
  onIconToggle,
  maxIconSelections = 3,
  balkenInstances,
  selectedBalkenId,
  onAddBalken,
  onUpdateBalken,
  onRemoveBalken,
  onDuplicateBalken,
  shapeInstances,
  selectedShapeId,
  onAddShape,
  onUpdateShape,
  onRemoveShape,
  onDuplicateShape,
  illustrationInstances,
  selectedIllustrationId,
  onAddIllustration,
  onUpdateIllustration,
  onRemoveIllustration,
  onDuplicateIllustration,
  frameInstances,
  selectedFrameId,
  onAddFrame,
  onRemoveFrame,
  onSetFrameImage,
}: ExtendedAssetsSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 300);
  const deferredQuery = useDeferredValue(debouncedQuery);
  const [formenExpanded, setFormenExpanded] = useState(false);
  const [iconsExpanded, setIconsExpanded] = useState(false);
  const [illustrationenExpanded, setIllustrationenExpanded] = useState(false);

  const hasTextFeature = onAddHeader !== undefined || onAddText !== undefined;
  const hasAssetsFeature = onAddAsset !== undefined;
  const hasIconsFeature = selectedIcons !== undefined && onIconToggle !== undefined;
  const hasBalkenFeature = onAddBalken !== undefined;
  const hasBadgesFeature =
    onAddPillBadge !== undefined || onAddCircleBadge !== undefined || onAddBalken !== undefined;
  const hasShapesFeature = onAddShape !== undefined;
  const hasIllustrationsFeature = onAddIllustration !== undefined;
  const hasFramesFeature = onAddFrame !== undefined;

  // Background prefetch all SVG illustrations during idle time
  useEffect(() => {
    if (hasIllustrationsFeature) {
      // Filter to SVG illustrations only (Kawaii are rendered dynamically)
      const svgIllustrations = ALL_ILLUSTRATIONS.filter((ill) => ill.source !== 'kawaii').map(
        (ill) => ({
          id: ill.id,
          def: ill as SvgDef,
        })
      );

      if (svgIllustrations.length === 0) return;

      // Use requestIdleCallback for non-blocking background prefetch
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => prefetchBackground(svgIllustrations), { timeout: 5000 });
      } else {
        // Fallback for Safari
        setTimeout(() => prefetchBackground(svgIllustrations), 1000);
      }
    }
  }, [hasIllustrationsFeature]);

  // Build search results
  const searchResults = useMemo(() => {
    if (!deferredQuery.trim()) return [];

    const query = deferredQuery.toLowerCase();
    const results: SearchResult[] = [];

    // Search elements (assets)
    if (hasAssetsFeature) {
      ALL_ASSETS.forEach((asset) => {
        const matchesLabel = asset.label.toLowerCase().includes(query);
        const matchesTags = asset.tags.some((tag) => tag.toLowerCase().includes(query));

        if (matchesLabel || matchesTags) {
          results.push({
            type: 'element',
            id: asset.id,
            name: asset.label,
            asset,
          });
        }
      });
    }

    // Search shapes
    if (hasShapesFeature) {
      ALL_SHAPES.forEach((shape) => {
        const matchesName = shape.name.toLowerCase().includes(query);
        const matchesTags = shape.tags.some((tag) => tag.toLowerCase().includes(query));

        if (matchesName || matchesTags) {
          results.push({
            type: 'shape',
            id: shape.id,
            name: shape.name,
            shapeDef: shape,
          });
        }
      });
    }

    // Search icons (limit to 20 results)
    if (hasIconsFeature) {
      const englishTerms = getEnglishSearchTerms(query);
      let iconCount = 0;

      for (const icon of ALL_ICONS) {
        if (iconCount >= 20) break;

        const iconNameLower = icon.name.toLowerCase();
        const matchesName = iconNameLower.includes(query);
        const matchesLibrary = icon.library.toLowerCase().includes(query);
        // Also match English translations of German search terms
        const matchesTranslation = englishTerms.some((term) => iconNameLower.includes(term));

        if (matchesName || matchesLibrary || matchesTranslation) {
          results.push({
            type: 'icon',
            id: icon.id,
            name: icon.name,
            iconDef: icon,
          });
          iconCount++;
        }
      }
    }

    // Search illustrations
    if (ALL_ILLUSTRATIONS.length > 0) {
      const englishTermsForIllustrations = getEnglishSearchTerms(query);
      const matchingIllustrations = ALL_ILLUSTRATIONS.filter((ill) => {
        const nameLower = ill.name.toLowerCase();
        const matchesName = nameLower.includes(query);
        const matchesTags = ill.tags.some((tag) => tag.toLowerCase().includes(query));
        const matchesCategory =
          ill.source !== 'kawaii' &&
          (ill as unknown as { category?: string }).category?.toLowerCase().includes(query);
        // Also match English translation terms against illustration names/tags
        const matchesTranslation = englishTermsForIllustrations.some(
          (term) =>
            nameLower.includes(term) || ill.tags.some((tag) => tag.toLowerCase().includes(term))
        );
        return matchesName || matchesTags || matchesCategory || matchesTranslation;
      });
      matchingIllustrations.forEach((ill) => {
        results.push({
          type: 'illustration',
          id: ill.id,
          name: ill.name,
          illustrationDef: ill,
        });
      });
    }

    // Search frames
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

  // Determine search state for stable rendering
  const hasQuery = searchQuery.trim().length > 0;
  const hasDeferredQuery = deferredQuery.trim().length > 0;
  // User is typing if immediate query differs from debounced query
  const isTyping = searchQuery !== debouncedQuery;
  const isSearching = hasQuery && (isTyping || !hasDeferredQuery);
  const showResults = hasDeferredQuery && searchResults.length > 0 && !isTyping;
  const showNoResults = hasDeferredQuery && searchResults.length === 0 && !isTyping;

  // Build subsections
  const subsections: Subsection[] = [];

  // Text subsection - shown first if text creation is available
  if (hasTextFeature) {
    subsections.push({
      id: 'text',
      icon: PiTextT,
      label: 'Text',
      content: (
        <div className="sidebar-section sidebar-section--assets">
          <h4 className="assets-section-header">
            <PiTextT size={14} />
            <span>Text hinzufügen</span>
          </h4>
          <div className="text-section-actions">
            {onAddHeader && (
              <button className="text-preview-btn header-preview" onClick={onAddHeader}>
                <span>Überschrift</span>
              </button>
            )}
            {onAddText && (
              <button className="text-preview-btn body-preview" onClick={onAddText}>
                <span>Fließtext</span>
              </button>
            )}
          </div>
        </div>
      ),
    });
  }

  // Search subsection
  subsections.push({
    id: 'suche',
    icon: FaSearch,
    label: 'Suche',
    content: (
      <div className="sidebar-section sidebar-section--assets sidebar-section--search">
        <SearchInput value={searchQuery} onChange={setSearchQuery} />

        {/* Always render container for stable layout */}
        <div className={`assets-search-results ${hasQuery ? 'assets-search-results--active' : ''}`}>
          {showResults && (
            <SearchResultsGrid
              results={searchResults}
              onAddAsset={onAddAsset}
              onAddShape={onAddShape}
              onAddIllustration={onAddIllustration}
              onAddFrame={onAddFrame}
              selectedIcons={selectedIcons}
              onIconToggle={onIconToggle}
              maxIconSelections={maxIconSelections}
            />
          )}
          {showNoResults && (
            <p className="assets-no-results">Keine Ergebnisse für "{deferredQuery}"</p>
          )}
          {isSearching && <p className="assets-search-hint">Suche...</p>}
          {!hasQuery && <p className="assets-search-hint">Tippe um zu suchen</p>}
        </div>
      </div>
    ),
  });

  // Add Grafiken subsection only if assets feature is available
  if (hasAssetsFeature) {
    subsections.push({
      id: 'grafiken',
      icon: FaPuzzlePiece,
      label: 'Grafiken',
      content: (
        <GrafiksSectionContent onAddAsset={onAddAsset!} recommendedAssetIds={recommendedAssetIds} />
      ),
    });
  }

  if (hasBadgesFeature) {
    const selectedBalken = balkenInstances?.find((b) => b.id === selectedBalkenId) || null;
    subsections.push({
      id: 'badges',
      icon: PiTagFill,
      label: 'Extras',
      content: (
        <>
          <h4 className="assets-section-header">
            <PiTagFill size={14} />
            <span>Extras</span>
          </h4>
          <BadgeSection
            onAddPillBadge={onAddPillBadge}
            onAddCircleBadge={onAddCircleBadge}
            onAddBalken={onAddBalken}
          />
          {selectedBalken && hasBalkenFeature && (
            <BalkenSection
              onAddBalken={onAddBalken!}
              selectedBalken={selectedBalken}
              onUpdateBalken={onUpdateBalken ?? (() => {})}
              onRemoveBalken={onRemoveBalken ?? (() => {})}
              onDuplicateBalken={onDuplicateBalken}
            />
          )}
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
          <h4 className="assets-section-header">
            <FaShapes size={14} />
            <span>Formen</span>
            {hasMoreShapes && (
              <button
                className="sidebar-action-btn sidebar-action-btn--text"
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
          <h4 className="assets-section-header">
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
          <h4 className="assets-section-header">
            <PiSmileyWink size={14} />
            <span>Illustrationen</span>
            {hasMoreIllustrations && (
              <button
                className="sidebar-action-btn sidebar-action-btn--text"
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
    const recommendedIconCount = 4; // Based on RECOMMENDED_ICON_IDS
    const hasMoreIcons = ALL_ICONS.length > recommendedIconCount;
    subsections.push({
      id: 'icons',
      icon: HiSparkles,
      label: 'Icons',
      content: (
        <>
          <h4 className="assets-section-header">
            <HiSparkles size={14} />
            <span>Icons</span>
            {hasMoreIcons && (
              <button
                className="sidebar-action-btn sidebar-action-btn--text"
                onClick={() => setIconsExpanded(!iconsExpanded)}
              >
                {iconsExpanded ? 'Weniger anzeigen' : 'Alle anzeigen'}
              </button>
            )}
          </h4>
          <IconsSection
            selectedIcons={selectedIcons}
            onIconToggle={onIconToggle}
            maxSelections={maxIconSelections}
            isExpanded={iconsExpanded}
          />
        </>
      ),
    });
  }

  // Default to text if available, then grafiken, otherwise first subsection
  const defaultSubsection = hasTextFeature
    ? 'text'
    : hasAssetsFeature
      ? 'grafiken'
      : subsections[0]?.id || 'suche';

  return (
    <div className="sidebar-section sidebar-section--assets-wrapper">
      <SubsectionTabBar subsections={subsections} defaultSubsection={defaultSubsection} />
    </div>
  );
}

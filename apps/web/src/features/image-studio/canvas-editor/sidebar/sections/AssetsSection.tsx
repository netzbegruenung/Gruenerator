import { useState, useMemo, useDeferredValue, useCallback, useEffect } from 'react';
import { FaCheck, FaPuzzlePiece, FaShapes, FaSearch } from 'react-icons/fa';
import { HiSparkles } from 'react-icons/hi2';
import { PiMagnifyingGlass, PiSmileyWink } from 'react-icons/pi';
import type { AssetsSectionProps, AssetItem } from '../types';
import { SubsectionTabBar, type Subsection } from '../SubsectionTabBar';
import { IconsSection } from './IconsSection';
import { BalkenSection } from './BalkenSection';
import { FormenSection } from './FormenSection';
import { IllustrationenSection } from './IllustrationenSection';
import type { BalkenInstance, BalkenMode } from '../../primitives';
import { ShapeInstance, ShapeType, ALL_SHAPES, ShapeDef } from '../../utils/shapes';
import { ALL_ASSETS, UniversalAsset } from '../../utils/canvasAssets';
import { ALL_ICONS, IconDef } from '../../utils/canvasIcons';
import type { IllustrationInstance, IllustrationDef, KawaiiIllustrationType, KawaiiDef, SvgDef } from '../../utils/illustrations/types';
import { searchIllustrations, getIllustrationPath, getAllIllustrations } from '../../utils/illustrations/registry';
import { prefetchBackground } from '../../utils/illustrations/svgCache';
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
} from 'react-kawaii';
import { getEnglishSearchTerms } from '../../utils/searchTranslations';
import { BalkenIcon } from '../../icons';
import './AssetsSection.css';

// Unified search result item type
type SearchResultType = 'element' | 'shape' | 'icon' | 'illustration';

interface SearchResult {
  type: SearchResultType;
  id: string;
  name: string;
  // For elements
  asset?: UniversalAsset;
  assetItem?: AssetItem;
  // For shapes
  shapeDef?: ShapeDef;
  // For icons
  iconDef?: IconDef;
  // For illustrations
  illustrationDef?: IllustrationDef;
}

// Map for preview components
const PREVIEW_COMPONENTS: Record<KawaiiIllustrationType, React.ComponentType<{ size: number; mood: string; color: string }>> = {
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
}

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

function AssetGrid({ assets, onAssetToggle }: { assets: AssetItem[]; onAssetToggle: (id: string, visible: boolean) => void }) {
  return (
    <div className="sidebar-card-grid">
      {assets.map((asset) => (
        <button
          key={asset.id}
          className="sidebar-selectable-card"
          onClick={() => onAssetToggle(asset.id, !asset.visible)}
          type="button"
          title={asset.visible ? `${asset.label} ausblenden` : `${asset.label} einblenden`}
        >
          <div className="sidebar-selectable-card__preview">
            <img
              src={asset.src}
              alt={asset.label}
              className="asset-image"
            />
            {asset.visible && (
              <span className="sidebar-selectable-card__check sidebar-selectable-card__check--small">
                <FaCheck size={8} />
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

interface SearchResultsGridProps {
  results: SearchResult[];
  assets: AssetItem[];
  onAssetToggle: (id: string, visible: boolean) => void;
  onAddShape?: (type: ShapeType) => void;
  onAddIllustration?: (id: string) => void;
  selectedIcons?: string[];
  onIconToggle?: (iconId: string, selected: boolean) => void;
  maxIconSelections?: number;
}

function SearchResultsGrid({
  results,
  assets,
  onAssetToggle,
  onAddShape,
  onAddIllustration,
  selectedIcons = [],
  onIconToggle,
  maxIconSelections = 3,
}: SearchResultsGridProps) {
  return (
    <div className="sidebar-card-grid">
      {results.map((result) => {
        if (result.type === 'element' && result.assetItem) {
          const asset = result.assetItem;
          return (
            <button
              key={`element-${result.id}`}
              className="sidebar-selectable-card"
              onClick={() => onAssetToggle(asset.id, !asset.visible)}
              type="button"
              title={asset.label}
            >
              <div className="sidebar-selectable-card__preview">
                <img src={asset.src} alt={asset.label} className="asset-image" />
                {asset.visible && (
                  <span className="sidebar-selectable-card__check sidebar-selectable-card__check--small">
                    <FaCheck size={8} />
                  </span>
                )}
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
                {shape.id === 'triangle' && <div className="formen-preview formen-preview--triangle" />}
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
                  <img
                    src={getIllustrationPath(ill as SvgDef)}
                    alt={ill.name}
                    loading="lazy"
                  />
                </div>
              </button>
            );
          }
        }

        return null;
      })}
    </div>
  );
}

interface GrafiksSectionContentProps {
  assets: AssetItem[];
  onAssetToggle: (assetId: string, visible: boolean) => void;
  recommendedAssetIds?: string[];
}

function GrafiksSectionContent({
  assets,
  onAssetToggle,
  recommendedAssetIds = [],
}: GrafiksSectionContentProps) {
  const recommendedAssets = assets.filter(a => recommendedAssetIds.includes(a.id));
  const otherAssets = assets.filter(a => !recommendedAssetIds.includes(a.id));

  const hasRecommended = recommendedAssets.length > 0;
  const hasOthers = otherAssets.length > 0;

  return (
    <div className="sidebar-section sidebar-section--assets">
      {hasRecommended && (
        <div className="assets-group assets-group--recommended">
          <h4 className="assets-section-header">
            <HiSparkles size={14} />
            <span>Empfohlen</span>
          </h4>
          <AssetGrid assets={recommendedAssets} onAssetToggle={onAssetToggle} />
        </div>
      )}

      {hasOthers && (
        <div className="assets-group assets-group--elements">
          <h4 className={`assets-section-header ${hasRecommended ? 'assets-section-header--secondary' : ''}`}>
            <FaPuzzlePiece size={12} />
            <span>Elemente</span>
          </h4>
          <AssetGrid assets={otherAssets} onAssetToggle={onAssetToggle} />
        </div>
      )}
    </div>
  );
}

export interface ExtendedAssetsSectionProps extends AssetsSectionProps {
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
}

export function AssetsSection({
  assets,
  onAssetToggle,
  recommendedAssetIds = [],
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
}: ExtendedAssetsSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredQuery = useDeferredValue(searchQuery);
  const [formenExpanded, setFormenExpanded] = useState(false);
  const [iconsExpanded, setIconsExpanded] = useState(false);
  const [illustrationenExpanded, setIllustrationenExpanded] = useState(false);
  const [illustrations, setIllustrations] = useState<IllustrationDef[]>([]);
  const [illustrationsLoading, setIllustrationsLoading] = useState(false);

  const hasIconsFeature = selectedIcons !== undefined && onIconToggle !== undefined;
  const hasBalkenFeature = onAddBalken !== undefined;
  const hasShapesFeature = onAddShape !== undefined;
  const hasIllustrationsFeature = onAddIllustration !== undefined;

  useEffect(() => {
    if (hasIllustrationsFeature && illustrations.length === 0 && !illustrationsLoading) {
      setIllustrationsLoading(true);
      getAllIllustrations()
        .then(setIllustrations)
        .catch((error) => {
          console.error('[AssetsSection] Failed to load illustrations:', error);
        })
        .finally(() => setIllustrationsLoading(false));
    }
  }, [hasIllustrationsFeature, illustrations.length, illustrationsLoading]);

  // Background prefetch all SVG illustrations during idle time
  useEffect(() => {
    if (illustrations.length > 0 && hasIllustrationsFeature) {
      // Filter to SVG illustrations only (Kawaii are rendered dynamically)
      const svgIllustrations = illustrations
        .filter(ill => ill.source !== 'kawaii')
        .map(ill => ({
          id: ill.id,
          def: ill as SvgDef
        }));

      if (svgIllustrations.length === 0) return;

      // Use requestIdleCallback for non-blocking background prefetch
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => prefetchBackground(svgIllustrations), { timeout: 5000 });
      } else {
        // Fallback for Safari
        setTimeout(() => prefetchBackground(svgIllustrations), 1000);
      }
    }
  }, [illustrations, hasIllustrationsFeature]);

  // Build search results
  const searchResults = useMemo(() => {
    if (!deferredQuery.trim()) return [];

    const query = deferredQuery.toLowerCase();
    const results: SearchResult[] = [];

    // Search elements
    assets.forEach((assetItem) => {
      const universalAsset = ALL_ASSETS.find(a => a.id === assetItem.id);
      const matchesLabel = assetItem.label.toLowerCase().includes(query);
      const matchesTags = universalAsset?.tags.some(tag => tag.toLowerCase().includes(query));

      if (matchesLabel || matchesTags) {
        results.push({
          type: 'element',
          id: assetItem.id,
          name: assetItem.label,
          asset: universalAsset,
          assetItem,
        });
      }
    });

    // Search shapes
    if (hasShapesFeature) {
      ALL_SHAPES.forEach((shape) => {
        const matchesName = shape.name.toLowerCase().includes(query);
        const matchesTags = shape.tags.some(tag => tag.toLowerCase().includes(query));

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
        const matchesTranslation = englishTerms.some(term => iconNameLower.includes(term));

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
    if (hasIllustrationsFeature && illustrations.length > 0) {
      const matchingIllustrations = illustrations.filter(ill =>
        ill.name.toLowerCase().includes(query) ||
        ill.tags.some(tag => tag.toLowerCase().includes(query)) ||
        (ill.source !== 'kawaii' && (ill as unknown as { category?: string }).category?.toLowerCase().includes(query))
      );
      matchingIllustrations.forEach(ill => {
        results.push({
          type: 'illustration',
          id: ill.id,
          name: ill.name,
          illustrationDef: ill
        });
      });
    }

    return results;
  }, [deferredQuery, assets, hasShapesFeature, hasIconsFeature, hasIllustrationsFeature, illustrations]);

  // Build subsections
  const subsections: Subsection[] = [
    // Search subsection
    {
      id: 'suche',
      icon: FaSearch,
      label: 'Suche',
      content: (
        <div className="sidebar-section sidebar-section--assets">
          <SearchInput value={searchQuery} onChange={setSearchQuery} />

          {searchQuery.trim().length > 0 && (
            searchResults.length > 0 ? (
              <SearchResultsGrid
                results={searchResults}
                assets={assets}
                onAssetToggle={onAssetToggle}
                onAddShape={onAddShape}
                onAddIllustration={onAddIllustration}
                selectedIcons={selectedIcons}
                onIconToggle={onIconToggle}
                maxIconSelections={maxIconSelections}
              />
            ) : (
              <p className="assets-no-results">Keine Ergebnisse für "{deferredQuery}"</p>
            )
          )}
        </div>
      ),
    },
    // Grafiken subsection
    {
      id: 'grafiken',
      icon: FaPuzzlePiece,
      label: 'Grafiken',
      content: (
        <GrafiksSectionContent
          assets={assets}
          onAssetToggle={onAssetToggle}
          recommendedAssetIds={recommendedAssetIds}
        />
      ),
    },
  ];

  if (hasBalkenFeature) {
    const selectedBalken = balkenInstances?.find(b => b.id === selectedBalkenId) || null;
    subsections.push({
      id: 'balken',
      icon: BalkenIcon,
      label: 'Balken',
      content: (
        <>
          <h4 className="assets-section-header">
            <BalkenIcon size={14} />
            <span>Balken</span>
          </h4>
          <BalkenSection
            onAddBalken={onAddBalken!}
            selectedBalken={selectedBalken}
            onUpdateBalken={onUpdateBalken ?? (() => { })}
            onRemoveBalken={onRemoveBalken ?? (() => { })}
            onDuplicateBalken={onDuplicateBalken}
          />
        </>
      ),
    });
  }

  if (hasShapesFeature) {
    const selectedShape = shapeInstances?.find(s => s.id === selectedShapeId) || null;
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
          <FormenSection
            onAddShape={onAddShape!}
            selectedShape={selectedShape}
            onUpdateShape={onUpdateShape ?? (() => { })}
            onRemoveShape={onRemoveShape ?? (() => { })}
            onDuplicateShape={onDuplicateShape}
            isExpanded={formenExpanded}
          />
        </>
      ),
    });
  }

  if (hasIllustrationsFeature) {
    const selectedIllustration = illustrationInstances?.find(i => i.id === selectedIllustrationId) || null;
    const hasMoreIllustrations = illustrations.length > 4;
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
            onUpdateIllustration={onUpdateIllustration ?? (() => { })}
            onRemoveIllustration={onRemoveIllustration ?? (() => { })}
            onDuplicateIllustration={onDuplicateIllustration}
            isExpanded={illustrationenExpanded}
            illustrations={illustrations}
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

  return (
    <div className="sidebar-section sidebar-section--assets-wrapper">
      <SubsectionTabBar subsections={subsections} defaultSubsection="grafiken" />
    </div>
  );
}

import { useMemo, useState, type ReactNode } from 'react';
import { PiArrowLeft, PiMagnifyingGlass, PiTagFill } from 'react-icons/pi';

import { useCanvasEditorServices } from '../../../CanvasEditorProvider';
import { sortLogoAssets } from '../../../utils/canvasAssets';
import { cn } from '../../../utils/cn';
import { ALL_ILLUSTRATIONS } from '../../../utils/illustrations/illustrationCatalog';
import { HIDDEN_SCROLLBAR } from '../../sidebarStyles';
import { BadgeSection } from '../BadgeSection';
import { DiagrammeSection } from '../DiagrammeSection';
import { FormenSection } from '../FormenSection';
import { IconsSection } from '../IconsSection';
import { IllustrationenSection } from '../IllustrationenSection';
import { RahmenSection } from '../RahmenSection';

import { SearchResultsGrid } from './SearchResultsGrid';
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

// Re-skins the shared strip tiles as 80px squares. Only plain tiles get the
// tile background — white logos and selected icons keep their own.
const CAROUSEL =
  '-mx-5 px-5 flex gap-2.5 overflow-x-auto [&>*]:size-20! [&>*]:rounded-xl! [&>.bg-transparent]:bg-[var(--editor-tile)]';

const TILE =
  'size-20 flex-none rounded-xl bg-[var(--editor-tile)] border-none cursor-pointer flex items-center justify-center text-[var(--editor-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]';

const EMPTY_HINT = 'm-0 py-8 px-4 text-center text-[13px] text-[var(--editor-text-muted)]';

type CategoryId =
  'grafiken' | 'badges' | 'formen' | 'diagramme' | 'rahmen' | 'illustrationen' | 'icons';

interface Category {
  id: CategoryId;
  label: string;
  carousel: ReactNode;
  detail: ReactNode;
}

interface MobileCatalogViewProps extends ExtendedAssetsSectionProps {
  search: AssetSearchState;
}

export function MobileCatalogView({ search, ...props }: MobileCatalogViewProps) {
  // A frame or illustration selected on canvas needs its controls, which live in
  // its detail view — open it whenever the selection changes to one.
  const selectedId = props.selectedFrameId ?? props.selectedIllustrationId ?? null;
  const selectedCategory: CategoryId | null = props.selectedFrameId
    ? 'rahmen'
    : props.selectedIllustrationId
      ? 'illustrationen'
      : null;
  const [openCategory, setOpenCategory] = useState<CategoryId | null>(selectedCategory);
  const [shownSelectionId, setShownSelectionId] = useState(selectedId);
  if (selectedId !== shownSelectionId) {
    setShownSelectionId(selectedId);
    if (selectedCategory) setOpenCategory(selectedCategory);
  }
  const { userLocale = 'de-DE' } = useCanvasEditorServices();

  const {
    onAddAsset,
    onAddPillBadge,
    onAddCircleBadge,
    onAddBalken,
    onAddShape,
    onAddChart,
    onAddFrame,
    onAddIllustration,
    selectedIcons,
    onIconToggle,
    maxIconSelections = 3,
  } = props;

  const categories: Category[] = [];

  if (onAddAsset) {
    categories.push({
      id: 'grafiken',
      label: 'Grafiken',
      carousel: (
        <MarkeStripTiles onAddAsset={onAddAsset} recommendedAssetIds={props.recommendedAssetIds} />
      ),
      detail: (
        <GrafikenGrid onAddAsset={onAddAsset} recommendedAssetIds={props.recommendedAssetIds} />
      ),
    });
  }

  if (onAddPillBadge || onAddCircleBadge || onAddBalken) {
    categories.push({
      id: 'badges',
      label: 'Extras',
      carousel: (
        <button
          type="button"
          className={TILE}
          title="Extras öffnen"
          aria-label="Extras öffnen"
          onClick={() => setOpenCategory('badges')}
        >
          <PiTagFill size={28} />
        </button>
      ),
      detail: (
        <BadgeSection
          onAddPillBadge={onAddPillBadge}
          onAddCircleBadge={onAddCircleBadge}
          {...(userLocale === 'de-DE' ? { onAddBalken } : {})}
        />
      ),
    });
  }

  if (onAddShape) {
    categories.push({
      id: 'formen',
      label: 'Formen',
      carousel: <FormenStripTiles onAddShape={onAddShape} />,
      detail: <FormenSection onAddShape={onAddShape} isExpanded />,
    });
  }

  if (onAddChart) {
    categories.push({
      id: 'diagramme',
      label: 'Diagramme',
      carousel: <DiagrammeStripTiles onAddChart={onAddChart} />,
      detail: <DiagrammeSection onAddChart={onAddChart} />,
    });
  }

  if (onAddFrame) {
    categories.push({
      id: 'rahmen',
      label: 'Rahmen',
      carousel: <RahmenStripTiles onAddFrame={onAddFrame} />,
      detail: (
        <RahmenSection
          onAddFrame={onAddFrame}
          selectedFrame={props.frameInstances?.find((f) => f.id === props.selectedFrameId) ?? null}
          onSetFrameImage={props.onSetFrameImage}
          onUpdateFrame={props.onUpdateFrame}
          onRemoveFrame={props.onRemoveFrame}
        />
      ),
    });
  }

  if (onAddIllustration) {
    categories.push({
      id: 'illustrationen',
      label: 'Illustrationen',
      carousel: <IllustrationStripTiles onAddIllustration={onAddIllustration} />,
      detail: (
        <IllustrationenSection
          onAddIllustration={onAddIllustration}
          selectedIllustration={
            props.illustrationInstances?.find((i) => i.id === props.selectedIllustrationId) ?? null
          }
          onUpdateIllustration={props.onUpdateIllustration ?? (() => {})}
          onRemoveIllustration={props.onRemoveIllustration ?? (() => {})}
          onDuplicateIllustration={props.onDuplicateIllustration}
          isExpanded
          illustrations={ALL_ILLUSTRATIONS}
        />
      ),
    });
  }

  if (selectedIcons && onIconToggle) {
    categories.push({
      id: 'icons',
      label: 'Icons',
      carousel: (
        <IconStripTiles
          selectedIcons={selectedIcons}
          onIconToggle={onIconToggle}
          maxIconSelections={maxIconSelections}
        />
      ),
      detail: (
        <IconsSection
          selectedIcons={selectedIcons}
          onIconToggle={onIconToggle}
          maxSelections={maxIconSelections}
          isExpanded
        />
      ),
    });
  }

  const openDetail = categories.find((c) => c.id === openCategory);

  if (openDetail) {
    return (
      <div className="flex flex-col gap-4 w-full min-w-0">
        <button
          type="button"
          onClick={() => setOpenCategory(null)}
          className="flex items-center gap-2 self-start bg-transparent border-none p-0 cursor-pointer text-[13px] font-bold text-[var(--editor-active-fg)]"
        >
          <PiArrowLeft size={16} />
          <span>Alle Elemente</span>
        </button>
        <h3 className="m-0 text-[15px] font-bold text-[var(--editor-text)]">{openDetail.label}</h3>
        {openDetail.detail}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full min-w-0">
      <label className="relative block w-full">
        <PiMagnifyingGlass
          size={18}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--editor-text-muted)] pointer-events-none"
        />
        <input
          type="search"
          value={search.searchQuery}
          onChange={(e) => search.setSearchQuery(e.target.value)}
          placeholder="Elemente durchsuchen"
          aria-label="Elemente durchsuchen"
          className="w-full h-11 pl-10 pr-3 rounded-xl border-none bg-[var(--editor-tile)] text-[15px] text-[var(--editor-text)] placeholder:text-[var(--editor-text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"
        />
      </label>

      {search.hasQuery ? (
        <div className="[contain:layout_style] min-h-[80px]">
          {search.showResults && (
            <SearchResultsGrid
              results={search.searchResults}
              onAddAsset={onAddAsset}
              onAddShape={onAddShape}
              onAddChart={onAddChart}
              onAddIllustration={onAddIllustration}
              onAddFrame={onAddFrame}
              selectedIcons={selectedIcons}
              onIconToggle={onIconToggle}
              maxIconSelections={maxIconSelections}
            />
          )}
          {search.showNoResults && (
            <p className={EMPTY_HINT}>Keine Ergebnisse für "{search.deferredQuery}"</p>
          )}
          {search.isSearching && <p className={cn(EMPTY_HINT, 'italic')}>Suche...</p>}
        </div>
      ) : (
        categories.map((category) => (
          <section key={category.id} className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="m-0 text-[15px] font-bold text-[var(--editor-text)]">
                {category.label}
              </h3>
              <button
                type="button"
                onClick={() => setOpenCategory(category.id)}
                className="bg-transparent border-none p-0 cursor-pointer text-[13px] font-bold text-[var(--editor-active-fg)]"
              >
                Alle
              </button>
            </div>
            <div className={cn(CAROUSEL, HIDDEN_SCROLLBAR)}>{category.carousel}</div>
          </section>
        ))
      )}
    </div>
  );
}

const NO_RECOMMENDED: string[] = [];

function GrafikenGrid({
  onAddAsset,
  recommendedAssetIds = NO_RECOMMENDED,
}: {
  onAddAsset: (assetId: string) => void;
  recommendedAssetIds?: string[];
}) {
  const { userLocale = 'de-DE' } = useCanvasEditorServices();
  const assets = useMemo(
    () => sortLogoAssets(recommendedAssetIds, userLocale),
    [recommendedAssetIds, userLocale]
  );

  return (
    <div className="grid grid-cols-2 gap-2.5 w-full">
      {assets.map((asset) => (
        <button
          key={asset.id}
          type="button"
          title={`${asset.label} hinzufügen`}
          onClick={() => onAddAsset(asset.id)}
          className="flex items-center gap-2.5 h-14 px-3 rounded-xl bg-[var(--editor-tile)] border-none cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"
        >
          <span
            className={cn(
              'flex items-center justify-center size-9 shrink-0 rounded-lg',
              /weiss|white/.test(asset.id) && 'bg-secondary-600'
            )}
          >
            <img src={asset.src} alt="" className="size-7 object-contain" />
          </span>
          <span className="text-[13px] text-[var(--editor-text)] truncate">{asset.label}</span>
        </button>
      ))}
    </div>
  );
}

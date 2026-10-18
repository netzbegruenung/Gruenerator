import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { PiCaretLeftBold, PiMagnifyingGlass, PiX } from 'react-icons/pi';

import { useCanvasEditorServices } from '../../../CanvasEditorProvider';
import { useBlockInsert } from '../../../components/CanvasEditor/blockInsert';
import { useDebounce } from '../../../hooks/useDebounce';
import { useIsCanvasMobile } from '../../../hooks/useIsCanvasMobile';
import { useTrackUnsplashDownload } from '../../../hooks/useTrackUnsplashDownload';
import { cn } from '../../../utils/cn';
import { MAX_ICON_SELECTIONS } from '../../../utils/iconInstances';
import { IllustrationSettings } from '../IllustrationSettings';
import { FramePreviewDefs } from '../RahmenSection';

import { BackgroundCatalog } from './BackgroundCatalog';
import { CategoryCard } from './CategoryCard';
import { ElementGrid } from './ElementGrid';
import { searchElements } from './elementSearch';
import { ElementTile } from './ElementTile';
import { galleryStickerItem, type ElementItem } from './elementTypes';
import { EmojiTonePicker } from './EmojiTonePicker';
import { RecentCarousel } from './RecentCarousel';
import { StickerCatalog } from './StickerCatalog';
import { BLOCK_GRUPPEN, canRun, useElementCatalog, type CategoryId } from './useElementCatalog';
import { useRecentElements } from './useRecentElements';

import type { ExtendedAssetsSectionProps } from './AssetsSection';
import type { SharepicBlock } from '@gruenerator/contracts';
import type { StickerRef } from '@gruenerator/shared/stickers';

/** Entrance: 12 staggered steps of 45 ms plus the 550 ms rise of the last one. */
const ENTRANCE_MS = 12 * 45 + 600;
const BRAND_COUNT = 4;

function countLabel(n: number): string {
  return `${n} ${n === 1 ? 'Element' : 'Elemente'}`;
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label
      className={cn(
        'flex flex-none items-center gap-2.5 h-11 pl-3.5 pr-2 rounded-xl border-[1.5px] cursor-text',
        'border-[var(--editor-border-soft)] text-[var(--editor-text-muted)] bg-[var(--editor-surface)]',
        'transition-[border-color] duration-200 focus-within:border-[var(--editor-accent)]'
      )}
    >
      <PiMagnifyingGlass size={18} aria-hidden />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            onChange('');
          }
        }}
        className={cn(
          'flex-1 min-w-0 border-none outline-none bg-transparent p-0 text-[15px] text-[var(--editor-text)]',
          'placeholder:text-[var(--editor-text-muted)] [&::-webkit-search-cancel-button]:appearance-none'
        )}
      />
      {value && (
        <button
          type="button"
          aria-label="Suche leeren"
          onClick={() => onChange('')}
          className="size-7 rounded-lg grid place-items-center border-none bg-transparent cursor-pointer text-[var(--editor-text-muted)] hover:bg-[var(--editor-tile)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"
        >
          <PiX size={16} />
        </button>
      )}
    </label>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="m-0 text-base font-bold text-[var(--editor-text)]">{children}</h3>;
}

/** The Blöcke category: its tiles under one heading per group (Listen, Text …). */
function BlockGroups({
  blocks,
  items,
  grid,
}: {
  blocks: readonly SharepicBlock[];
  items: readonly ElementItem[];
  grid: (items: readonly ElementItem[]) => React.ReactNode;
}) {
  const gruppeOf = new Map(blocks.map((b) => [`block:${b.id}`, b.gruppe]));
  const groups = (Object.keys(BLOCK_GRUPPEN) as SharepicBlock['gruppe'][])
    .map((gruppe) => ({ gruppe, items: items.filter((i) => gruppeOf.get(i.key) === gruppe) }))
    .filter((g) => g.items.length > 0);
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.gruppe} className="flex flex-col gap-2.5">
          <SectionHeading>{BLOCK_GRUPPEN[g.gruppe]}</SectionHeading>
          {grid(g.items)}
        </section>
      ))}
    </div>
  );
}

/**
 * The Elemente tab: a start page (recent, brand, category cards), a category
 * page, and a search — in the category or across all of them. Desktop and
 * the mobile sheet share it; only spacing and drag differ.
 */
export function ElementsPanel(props: ExtendedAssetsSectionProps) {
  const isMobile = useIsCanvasMobile();
  const { userLocale = 'de-DE' } = useCanvasEditorServices();
  // Opened for a selected frame or illustration ("Mehr" on the phone), it starts in that category.
  const [cat, setCat] = useState<CategoryId | null>(() =>
    props.selectedFrameId ? 'rahmen' : props.selectedIllustrationId ? 'illustrationen' : null
  );
  const [query, setQuery] = useState('');
  const q = useDeferredValue(useDebounce(query, 200)).trim();
  const hasQuery = q.length > 0;

  // Opening the tab plays the staggered entrance once; tiles mounted later just appear.
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setEntering(false), ENTRANCE_MS);
    return () => window.clearTimeout(t);
  }, []);
  const enterIndexOf = useCallback((i: number) => (entering ? i : null), [entering]);

  // A frame or illustration newly selected on the canvas opens its category.
  const [seenFrame, setSeenFrame] = useState(props.selectedFrameId ?? null);
  const [seenIllustration, setSeenIllustration] = useState(props.selectedIllustrationId ?? null);
  if ((props.selectedFrameId ?? null) !== seenFrame) {
    setSeenFrame(props.selectedFrameId ?? null);
    if (props.selectedFrameId) setCat('rahmen');
  }
  if ((props.selectedIllustrationId ?? null) !== seenIllustration) {
    setSeenIllustration(props.selectedIllustrationId ?? null);
    if (props.selectedIllustrationId) setCat('illustrationen');
  }

  const [emojiTone, setEmojiTone] = useState(0);
  const catalog = useElementCatalog(
    props,
    {
      illustrations: hasQuery || cat === 'illustrationen',
      icons: hasQuery,
      photos: true,
      emoji: hasQuery || cat === 'emoji',
    },
    emojiTone
  );
  const category = cat ? (catalog.find((c) => c.id === cat) ?? null) : null;

  // Handlers come in fresh props every render; the tiles get one stable callback.
  const propsRef = useRef(props);
  useLayoutEffect(() => {
    propsRef.current = props;
  });
  const remember = useRecentElements((s) => s.remember);
  const blocks = useBlockInsert();
  const blocksRef = useRef(blocks);
  useLayoutEffect(() => {
    blocksRef.current = blocks;
  });
  const trackDownload = useTrackUnsplashDownload();

  const activate = useCallback(
    (item: ElementItem) => {
      const p = propsRef.current;
      const action = item.action;
      switch (action.kind) {
        case 'asset':
          p.onAddAsset?.(action.assetId);
          break;
        case 'sticker':
          p.onAddStickerAsset?.(action.ref);
          break;
        case 'shape':
          p.onAddShape?.(action.shapeType, action.color);
          break;
        case 'illustration':
          p.onAddIllustration?.(action.id);
          break;
        case 'chart':
          p.onAddChart?.(action.chartType);
          break;
        case 'frame':
          p.onAddFrame?.(action.clipType);
          break;
        case 'balken':
          p.onAddBalken?.(action.mode);
          break;
        case 'media':
          if (!p.onAddImageFromUrl) return;
          trackDownload(action.name, action.attribution);
          p.onAddImageFromUrl(
            action.url,
            action.name,
            action.attribution ? { attribution: action.attribution } : {}
          );
          break;
        case 'block':
          if (!blocksRef.current) return;
          void blocksRef.current.insert(action.blockId);
          break;
        case 'icon': {
          const selected = p.selectedIcons ?? [];
          const isOn = selected.includes(action.iconId);
          if (!isOn && selected.length >= (p.maxIconSelections ?? MAX_ICON_SELECTIONS)) return;
          p.onIconToggle?.(action.iconId, !isOn);
          if (isOn) return;
          break;
        }
      }
      remember(item);
    },
    [remember, trackDownload]
  );

  // A gallery sticker goes through the same path, so it lands in "Zuletzt" too.
  const addGallerySticker = useCallback(
    (ref: StickerRef) => activate(galleryStickerItem(ref)),
    [activate]
  );

  const selectedIcons = props.selectedIcons;
  const maxIcons = props.maxIconSelections ?? MAX_ICON_SELECTIONS;
  const isSelected = useCallback(
    (item: ElementItem) =>
      item.action.kind === 'icon' && (selectedIcons?.includes(item.action.iconId) ?? false),
    [selectedIcons]
  );
  const isDisabled = useCallback(
    (item: ElementItem) =>
      item.action.kind === 'icon' &&
      !(selectedIcons?.includes(item.action.iconId) ?? false) &&
      (selectedIcons?.length ?? 0) >= maxIcons,
    [selectedIcons, maxIcons]
  );

  const storedRecent = useRecentElements((s) => s.items);
  const recent = useMemo(
    () => storedRecent.filter((item) => canRun(item.action, props, blocks)),
    // `props` changes identity every render; what matters is which handlers exist.

    [
      storedRecent,
      props.onAddAsset,
      props.onAddStickerAsset,
      props.onAddShape,
      props.onAddIllustration,
      props.onAddChart,
      props.onAddFrame,
      props.onAddBalken,
      props.onAddImageFromUrl,
      props.onIconToggle,
      blocks,
    ]
  );

  const results = useMemo(() => {
    if (!hasQuery) return [];
    return searchElements(catalog, q, category);
  }, [hasQuery, q, category, catalog]);

  const openCategory = (id: CategoryId) => {
    setCat(id);
    setQuery('');
  };

  const brand = catalog.find((c) => c.id === 'marke');
  const cards = catalog.filter((c) => c.id !== 'marke');
  const placeholder = category ? `In ${category.label} suchen` : 'Elemente suchen';
  const noResultsHint =
    userLocale === 'de-AT'
      ? 'Versuch es mit „Logo“, „Kreis“ oder „Rahmen“.'
      : 'Versuch es mit „Sonnenblume“, „Balken“ oder „Rahmen“.';
  const canDrag = !isMobile;
  const selectedIllustration =
    cat === 'illustrationen' && props.selectedIllustrationId
      ? (props.illustrationInstances?.find((i) => i.id === props.selectedIllustrationId) ?? null)
      : null;

  const grid = (items: readonly ElementItem[]) => (
    <ElementGrid
      items={items}
      onActivate={activate}
      enterIndexOf={enterIndexOf}
      canDrag={canDrag}
      isSelected={isSelected}
      isDisabled={isDisabled}
    />
  );

  function renderCategoryBody() {
    if (!category) return null;
    if (category.id === 'hintergruende' && props.onSetBackgroundImage) {
      return (
        <BackgroundCatalog
          currentImageSrc={props.currentBackgroundSrc}
          onImageChange={props.onSetBackgroundImage}
          searchQuery={q}
        />
      );
    }
    const items = hasQuery ? results : category.items;
    const body =
      items.length > 0 ? (
        grid(items)
      ) : category.isLoading ? (
        <p className="m-0 py-8 text-center text-sm text-[var(--editor-text-muted)]">Lädt …</p>
      ) : null;
    if (category.id === 'bloecke' && !hasQuery && blocks) {
      return <BlockGroups blocks={blocks.bloecke} items={items} grid={grid} />;
    }
    if (category.id === 'emoji') {
      return (
        <>
          <EmojiTonePicker tone={emojiTone} onChange={setEmojiTone} />
          {body}
        </>
      );
    }
    if (category.id === 'sticker' && props.onAddAsset) {
      return (
        <StickerCatalog
          {...(props.onAddStickerAsset ? { onAddStickerAsset: addGallerySticker } : {})}
          searchQuery={q}
          canDrag={canDrag}
        >
          {body}
        </StickerCatalog>
      );
    }
    return body;
  }

  const showResultsHeader = hasQuery && (category?.searchable ?? true);
  const showNoResults = showResultsHeader && results.length === 0;

  return (
    <div
      className={cn(
        'flex flex-col gap-[22px] max-canvas-mobile:gap-5 w-full min-w-0',
        'canvas-mobile:-m-3 canvas-mobile:min-w-[calc(100%+24px)] canvas-mobile:px-4 canvas-mobile:pt-5 canvas-mobile:pb-8'
      )}
    >
      <FramePreviewDefs />
      <SearchField value={query} onChange={setQuery} placeholder={placeholder} />

      {category && (
        <div className="flex items-center gap-2 -mt-1.5">
          <button
            type="button"
            onClick={() => setCat(null)}
            aria-label="Zurück zu allen Elementen"
            className="size-9 rounded-[10px] grid place-items-center border-none bg-transparent cursor-pointer text-[var(--editor-text)] hover:bg-[var(--editor-tile)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"
          >
            <PiCaretLeftBold size={20} />
          </button>
          <h3 className="m-0 flex-1 text-lg font-extrabold text-[var(--editor-text)] truncate">
            {category.label}
          </h3>
          {category.count !== null && (
            <span className="text-[13px] text-[var(--editor-text-muted)]">
              {countLabel(category.count)}
            </span>
          )}
        </div>
      )}

      {showResultsHeader && (
        <div className="flex items-baseline justify-between gap-2 -mt-1.5">
          <SectionHeading>
            {results.length > 0
              ? `${results.length} ${results.length === 1 ? 'Ergebnis' : 'Ergebnisse'} für „${q}“`
              : `Keine Treffer für „${q}“`}
          </SectionHeading>
          {category && (
            <button
              type="button"
              onClick={() => setCat(null)}
              className="p-0 border-none bg-transparent cursor-pointer whitespace-nowrap text-[13px] font-semibold text-[var(--editor-active-fg)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)] rounded"
            >
              Überall suchen
            </button>
          )}
        </div>
      )}

      {showNoResults ? (
        <div className="flex flex-col items-center gap-1.5 px-3 py-10 text-center">
          <strong className="text-[15px] text-[var(--editor-text)]">Nichts gefunden</strong>
          <span className="text-sm text-[var(--editor-text-muted)] [text-wrap:pretty]">
            {noResultsHint}
          </span>
        </div>
      ) : category ? (
        <>
          {selectedIllustration && (
            <IllustrationSettings
              selectedIllustration={selectedIllustration}
              onUpdateIllustration={props.onUpdateIllustration ?? (() => {})}
              onRemoveIllustration={props.onRemoveIllustration ?? (() => {})}
              {...(props.onDuplicateIllustration
                ? { onDuplicateIllustration: props.onDuplicateIllustration }
                : {})}
            />
          )}
          {renderCategoryBody()}
        </>
      ) : hasQuery ? (
        grid(results)
      ) : (
        <>
          {recent.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between">
                <SectionHeading>Zuletzt verwendet</SectionHeading>
                <span className="text-xs text-[var(--editor-text-muted)]">
                  {countLabel(recent.length)}
                </span>
              </div>
              <RecentCarousel
                items={recent}
                onActivate={activate}
                enterIndexOf={enterIndexOf}
                canDrag={canDrag}
              />
            </section>
          )}

          {brand && (
            <section className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between">
                <SectionHeading>Eure Marke</SectionHeading>
                <button
                  type="button"
                  onClick={() => openCategory('marke')}
                  className="p-0 border-none bg-transparent cursor-pointer text-[13px] font-semibold text-[var(--editor-active-fg)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)] rounded"
                >
                  Alle anzeigen
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {brand.items.slice(0, BRAND_COUNT).map((item, i) => (
                  <ElementTile
                    key={item.key}
                    item={item}
                    variant="brand"
                    onActivate={activate}
                    enterIndex={enterIndexOf(i)}
                    canDrag={canDrag}
                    eager
                  />
                ))}
              </div>
            </section>
          )}

          {cards.length > 0 && (
            <section className="flex flex-col gap-3.5">
              <SectionHeading>Kategorien durchsuchen</SectionHeading>
              <div className="grid grid-cols-3 gap-x-3.5 gap-y-[22px]">
                {cards.map((c, i) => (
                  <CategoryCard
                    key={c.id}
                    label={c.label}
                    countLabel={c.count !== null ? countLabel(c.count) : null}
                    tint={c.tint}
                    cover={c.cover}
                    enterIndex={enterIndexOf(i)}
                    onOpen={() => openCategory(c.id)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

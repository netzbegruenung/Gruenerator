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
import { useDebounce } from '../../../hooks/useDebounce';
import { useIsCanvasMobile } from '../../../hooks/useIsCanvasMobile';
import { cn } from '../../../utils/cn';
import { matchesQuery } from '../../../utils/filterUtils';
import { getEnglishSearchTerms } from '../../../utils/searchTranslations';
import { IllustrationSettings } from '../IllustrationSettings';
import { FramePreviewDefs } from '../RahmenSection';

import { BackgroundCatalog } from './BackgroundCatalog';
import { CategoryCard } from './CategoryCard';
import { ElementGrid } from './ElementGrid';
import { ElementTile } from './ElementTile';
import { RecentCarousel } from './RecentCarousel';
import { StickerCatalog } from './StickerCatalog';
import { canRun, useElementCatalog, type CategoryId } from './useElementCatalog';
import { useRecentElements } from './useRecentElements';

import type { ExtendedAssetsSectionProps } from './AssetsSection';
import type { ElementItem } from './elementTypes';
import type { StickerRef } from '@gruenerator/shared/stickers';

/** Entrance: 12 staggered steps of 45 ms plus the 550 ms rise of the last one. */
const ENTRANCE_MS = 12 * 45 + 600;
const BRAND_COUNT = 4;
/** Caps per kind in the search across all categories; a category's own search pages instead. */
const GLOBAL_CAP: Partial<Record<CategoryId, number>> = { illustrationen: 30, icons: 20 };
const DEFAULT_MAX_ICONS = 3;

function matches(item: ElementItem, q: string, english: readonly string[]): boolean {
  if (matchesQuery(q, item.label, item.keywords)) return true;
  return english.some((term) => matchesQuery(term, item.label, item.keywords));
}

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

  const catalog = useElementCatalog(props, {
    illustrations: hasQuery || cat === 'illustrationen',
    icons: hasQuery,
    photos: true,
  });
  const category = cat ? (catalog.find((c) => c.id === cat) ?? null) : null;

  // Handlers come in fresh props every render; the tiles get one stable callback.
  const propsRef = useRef(props);
  useLayoutEffect(() => {
    propsRef.current = props;
  });
  const remember = useRecentElements((s) => s.remember);

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
          p.onAddImageFromUrl?.(
            action.url,
            action.name,
            action.attribution ? { attribution: action.attribution } : {}
          );
          break;
        case 'icon': {
          const selected = p.selectedIcons ?? [];
          const isOn = selected.includes(action.iconId);
          if (!isOn && selected.length >= (p.maxIconSelections ?? DEFAULT_MAX_ICONS)) return;
          p.onIconToggle?.(action.iconId, !isOn);
          if (isOn) return;
          break;
        }
      }
      remember(item);
    },
    [remember]
  );

  // A gallery sticker goes through the same path, so it lands in "Zuletzt" too.
  const addGallerySticker = useCallback(
    (ref: StickerRef) =>
      activate({
        key: `sticker:${ref.id}`,
        label: 'Sticker',
        keywords: ['sticker'],
        action: { kind: 'sticker', ref },
        thumb: { t: 'share', src: ref.src },
      }),
    [activate]
  );

  const selectedIcons = props.selectedIcons;
  const maxIcons = props.maxIconSelections ?? DEFAULT_MAX_ICONS;
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
    () => storedRecent.filter((item) => canRun(item.action, props)),
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
    ]
  );

  const results = useMemo(() => {
    if (!hasQuery) return [];
    const english = getEnglishSearchTerms(q.toLowerCase());
    if (category) return category.items.filter((item) => matches(item, q, english));
    const seen = new Set<string>();
    const out: ElementItem[] = [];
    for (const c of catalog) {
      if (!c.searchable) continue;
      let n = 0;
      const cap = GLOBAL_CAP[c.id] ?? Infinity;
      for (const item of c.items) {
        if (n >= cap) break;
        if (!matches(item, q, english)) continue;
        // A sticker can share its file with a brand graphic; show it once.
        const dedupe = item.thumb.t === 'img' ? item.thumb.src : item.key;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        out.push(item);
        n++;
      }
    }
    return out;
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
    if (category.id === 'sticker' && props.onAddAsset) {
      return (
        <StickerCatalog
          {...(props.onAddStickerAsset ? { onAddStickerAsset: addGallerySticker } : {})}
          searchQuery={q}
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

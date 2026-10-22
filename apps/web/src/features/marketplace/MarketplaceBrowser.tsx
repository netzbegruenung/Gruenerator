import { useUserLandesverbaende } from '@gruenerator/chat';
import {
  MARKETPLACE_KINDS,
  type MarketplaceCollectionId,
  type MarketplaceItem,
  type MarketplaceKind,
  type MarketplaceOrigin,
  type MarketplaceSort,
} from '@gruenerator/contracts';
import {
  DEFAULT_MARKETPLACE_FILTERS,
  DEFAULT_MARKETPLACE_SORT,
  MARKETPLACE_ORIGINS,
  MARKETPLACE_SORTS,
  MARKETPLACE_TABS,
  marketplaceEmptyText,
  isFrontpageView,
  marketplaceHref,
  marketplaceOriginLabel,
  tabForKind,
  useMarketplaceItem,
  useMarketplaceKind,
  useMarketplaceSections,
  type MarketplaceFilters,
  type MarketplaceTab,
  type MarketplaceTabSlug,
} from '@gruenerator/shared/marketplace';
import { useDebouncedSearch } from '@gruenerator/shared/studio-assets';
import { Button, cn } from '@gruenerator/ui';
import { type JSX } from 'react';
import { LuArrowDownUp } from 'react-icons/lu';
import { PiFunnel, PiFunnelFill } from 'react-icons/pi';

import {
  FilterChip,
  FilterMenuButton,
  GalleryCountRow,
  GalleryEmptyState,
  GallerySkeleton,
  GridSizeToggle,
  useGridSize,
} from '../../components/common/Gallery/parts';
import { PageHeroSearch } from '../../components/common/PageHero';
import { MarketSection } from '../agentura/components/MarketSection';

import { type MarketplaceAssetItem } from './kindViews';
import { MarketplaceCard } from './MarketplaceCard';
import { MarketplaceCategoryView } from './MarketplaceCategoryView';
import { MarketplaceCollectionView } from './MarketplaceCollections';
import { MarketplaceFrontpage } from './MarketplaceFrontpage';
import { MarketplaceItemDetail } from './MarketplaceItemDetail';
import { useMarketplaceActions } from './useMarketplaceActions';

/** Origins tell Agents, Rezepte, Sticker and Hintergründe apart; Vorlagen are always public. */
const ORIGIN_KINDS: readonly MarketplaceKind[] = ['agent', 'recipe', 'sticker', 'background'];
const ALL_ORIGINS = 'alle';

/**
 * The tabs a view offers: „Alle" (= every allowed kind) when there is more than
 * one kind, then each single-kind tab whose kind is allowed.
 */
export function tabsFor(kinds: readonly MarketplaceKind[]): MarketplaceTab[] {
  const single = MARKETPLACE_TABS.filter(
    (t) => t.slug !== 'alle' && t.kinds.every((k) => kinds.includes(k))
  );
  return single.length > 1 ? [MARKETPLACE_TABS[0], ...single] : single;
}

/** The tab actually shown — a link to a tab the view does not offer falls back to the first. */
export function shownTab(
  tab: MarketplaceTabSlug,
  kinds: readonly MarketplaceKind[]
): MarketplaceTabSlug {
  const tabs = tabsFor(kinds);
  return tabs.some((t) => t.slug === tab) ? tab : (tabs[0]?.slug ?? 'alle');
}

/** The kinds a tab shows within what the view allows. */
function kindsOfTab(tab: MarketplaceTabSlug, kinds: readonly MarketplaceKind[]) {
  if (tab === 'alle') return kinds;
  return MARKETPLACE_TABS.find((t) => t.slug === tab)?.kinds ?? kinds;
}

const showsOrigins = (kinds: readonly MarketplaceKind[]) =>
  kinds.some((k) => ORIGIN_KINDS.includes(k));

/**
 * Search, origin and sort — the page puts them in its hero, the dialog in its
 * header row, the same icon toolbar as the Agentura and `/vorlagen`.
 */
export function MarketplaceToolbar({
  filters,
  onChange,
  kinds = MARKETPLACE_KINDS,
}: {
  filters: MarketplaceFilters;
  onChange: (next: MarketplaceFilters) => void;
  kinds?: readonly MarketplaceKind[];
}): JSX.Element {
  const { lvIds } = useUserLandesverbaende();
  const tabKinds = kindsOfTab(shownTab(filters.tab, kinds), kinds);
  // The Landesverband aisle only for people with a Landesverband — the assignment is the access.
  const origins = MARKETPLACE_ORIGINS.filter(
    (o) =>
      o.value !== 'landesverband' || (lvIds?.length ?? 0) > 0 || filters.origin === 'landesverband'
  );
  const originLabel = filters.origin ? marketplaceOriginLabel(filters.origin, lvIds) : null;
  const sortLabel = MARKETPLACE_SORTS.find((s) => s.value === filters.sort)?.label ?? '';

  return (
    <>
      <PageHeroSearch
        query={filters.q}
        onQuery={(q) => onChange({ ...filters, q })}
        placeholder="Marktplatz durchsuchen…"
      />
      {showsOrigins(tabKinds) && (
        <FilterMenuButton
          label={originLabel ? `Herkunft: ${originLabel}` : 'Herkunft'}
          menuLabel="Herkunft"
          value={filters.origin ?? ALL_ORIGINS}
          options={[
            { id: ALL_ORIGINS, label: 'Alle' },
            ...origins.map((o) => ({ id: o.value, label: marketplaceOriginLabel(o.value, lvIds) })),
          ]}
          onChange={(value) =>
            onChange({
              ...filters,
              origin: value === ALL_ORIGINS ? null : (value as MarketplaceOrigin),
            })
          }
          active={filters.origin !== null}
          icon={
            filters.origin ? (
              <PiFunnelFill aria-hidden className="size-[18px]" />
            ) : (
              <PiFunnel aria-hidden className="size-[18px]" />
            )
          }
        />
      )}
      <FilterMenuButton
        label={
          filters.sort === DEFAULT_MARKETPLACE_SORT ? 'Sortierung' : `Sortierung: ${sortLabel}`
        }
        menuLabel="Sortieren"
        value={filters.sort}
        options={MARKETPLACE_SORTS.map((s) => ({ id: s.value, label: s.label }))}
        onChange={(sort) => onChange({ ...filters, sort: sort as MarketplaceSort })}
        active={filters.sort !== DEFAULT_MARKETPLACE_SORT}
        icon={<LuArrowDownUp aria-hidden className="size-[18px]" />}
      />
    </>
  );
}

interface MarketplaceBrowserProps {
  filters: MarketplaceFilters;
  onChange: (next: MarketplaceFilters) => void;
  /** The kinds this view shows; the tabs follow. Default: all. */
  kinds?: readonly MarketplaceKind[];
  /** Picker mode: choosing a sticker or background hands it over instead of opening it. */
  onPick?: (item: MarketplaceAssetItem) => void;
  /** The opened item's title: 2 on the page (under its `h1`), 3 in a dialog (under its `h2`). */
  headingLevel?: 2 | 3;
  /** `/marktplatz` only: the unfiltered first tab is „Start", the front page, instead of „Alle". */
  frontpage?: boolean;
}

const isAsset = (item: MarketplaceItem): item is MarketplaceAssetItem =>
  item.kind === 'sticker' || item.kind === 'background';

/**
 * The Marktplatz body, the same on `/marktplatz` and in every popup, in the
 * Agentura's layout: kind tabs, the active filters as chips, then one aisle
 * per kind („Alle") or the paged aisle of one kind. A tile opens its detail in
 * place. Filters are controlled — the page keeps them in the address, the
 * dialog in local state — and so is the opened item (`filters.item`), which
 * lets a shared link open its detail directly.
 */
export function MarketplaceBrowser({
  filters,
  onChange,
  kinds = MARKETPLACE_KINDS,
  onPick,
  headingLevel = 2,
  frontpage = false,
}: MarketplaceBrowserProps): JSX.Element {
  const tabs = tabsFor(kinds);
  const tab = shownTab(filters.tab, kinds);
  const showFrontpage = frontpage && isFrontpageView({ ...filters, tab });
  const tabKinds = kindsOfTab(tab, kinds);
  const singleKind = tab === 'alle' ? null : (tabKinds[0] ?? null);
  const q = useDebouncedSearch(filters.q);
  const { lvIds } = useUserLandesverbaende();
  const { actions, dialogs } = useMarketplaceActions();
  const [gridSize, toggleGridSize] = useGridSize('marketplace-grid-size', 'large');
  const opened = filters.item;

  const origin = showsOrigins(tabKinds) ? filters.origin : null;
  const base = { origin, q, sort: filters.sort, scope: 'shop', platform: 'web' } as const;
  const sectionsQuery = useMarketplaceSections({
    ...base,
    kinds: tabKinds,
    enabled: singleKind === null && !showFrontpage && !(frontpage && filters.category),
  });
  const kindQuery = useMarketplaceKind({
    ...base,
    kind: singleKind ?? 'agent',
    enabled: singleKind !== null,
  });

  const sections =
    singleKind === null
      ? sectionsQuery.sections.filter((s) => s.items.length > 0)
      : [{ kind: singleKind, items: kindQuery.items, hasMore: false }];
  const items = sections.flatMap((s) => s.items);
  const active = singleKind === null ? sectionsQuery : kindQuery;

  const set = (patch: Partial<MarketplaceFilters>) => onChange({ ...filters, ...patch });
  const searching = filters.q.trim() !== '';
  const sorted = filters.sort !== DEFAULT_MARKETPLACE_SORT;
  const filtered = searching || origin !== null || sorted;
  const reset = () => set({ q: '', origin: null, sort: DEFAULT_MARKETPLACE_SORT });

  const select = (item: MarketplaceItem) => {
    if (onPick && isAsset(item)) onPick(item);
    else set({ item: { kind: item.kind, ref: item.ref } });
  };
  // The detail follows the cache, so a like or save shows there at once. An
  // item the lists do not hold (a shared link, another tab) is loaded alone.
  const listed = opened
    ? (items.find((i) => i.kind === opened.kind && i.ref === opened.ref) ?? null)
    : null;
  const single = useMarketplaceItem(opened, { enabled: listed === null });
  const openedItem = listed ?? single.data ?? null;
  const back = () => set({ item: null });

  if (opened) {
    if (openedItem) {
      return (
        <>
          <MarketplaceItemDetail
            item={openedItem}
            actions={actions}
            onBack={back}
            shareHref={marketplaceHref({ ...filters, tab: shownTab(filters.tab, kinds) })}
            headingLevel={headingLevel}
            onSelect={select}
            {...(frontpage && {
              onOpenCollection: (collection: MarketplaceCollectionId) =>
                onChange({ ...DEFAULT_MARKETPLACE_FILTERS, collection }),
            })}
          />
          {dialogs}
        </>
      );
    }
    return (
      <div className="flex flex-col gap-md">
        <Button variant="ghost" size="sm" className="self-start" onClick={back}>
          Zurück zum Marktplatz
        </Button>
        {single.isError ? (
          <GalleryEmptyState
            title="Dieser Eintrag ist nicht verfügbar"
            hint="Vielleicht wurde er gelöscht oder ist nicht mehr öffentlich."
          />
        ) : (
          <p className="m-0 text-sm text-foreground-muted">Lädt …</p>
        )}
      </div>
    );
  }

  if (frontpage && filters.category) {
    return (
      <>
        <MarketplaceCategoryView id={filters.category} actions={actions} onSelect={select} />
        {dialogs}
      </>
    );
  }

  if (frontpage && filters.collection) {
    return (
      <>
        <MarketplaceCollectionView
          id={filters.collection}
          actions={actions}
          onSelect={select}
          onBack={() => set({ collection: null })}
          onOpen={(collection) => set({ collection })}
        />
        {dialogs}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-md">
      {/* On `/marktplatz` the categories at the end of the front page replace the tabs. */}
      {tabs.length > 1 && !frontpage && (
        <div
          role="group"
          aria-label="Art"
          className="flex gap-lg overflow-x-auto border-b border-grey-200 dark:border-grey-700"
        >
          {tabs.map((t) => (
            <button
              key={t.slug}
              type="button"
              aria-pressed={t.slug === tab}
              onClick={() => set({ tab: t.slug })}
              className={cn(
                '-mb-px shrink-0 cursor-pointer border-b-[3px] bg-transparent px-0.5 pt-xs pb-sm text-[15px] whitespace-nowrap transition-colors',
                t.slug === tab
                  ? 'border-primary-600 font-semibold text-primary-700 dark:border-primary-300 dark:text-primary-300'
                  : 'border-transparent text-foreground-muted hover:text-foreground-heading'
              )}
            >
              {frontpage && t.slug === 'alle' ? 'Start' : t.label}
            </button>
          ))}
        </div>
      )}

      {showFrontpage ? (
        <MarketplaceFrontpage actions={actions} onSelect={select} onBrowse={set} />
      ) : (
        <>
          <span role="status" aria-live="polite" className="sr-only">
            {`${items.length} ${items.length === 1 ? 'Eintrag' : 'Einträge'}`}
          </span>
          {filtered && (
            <GalleryCountRow count={null} onReset={reset}>
              {origin && (
                <FilterChip
                  label={marketplaceOriginLabel(origin, lvIds)}
                  onRemove={() => set({ origin: null })}
                />
              )}
              {sorted && (
                <FilterChip
                  label={MARKETPLACE_SORTS.find((s) => s.value === filters.sort)?.label ?? ''}
                  onRemove={() => set({ sort: DEFAULT_MARKETPLACE_SORT })}
                />
              )}
              {searching && (
                <FilterChip label={`„${filters.q.trim()}“`} onRemove={() => set({ q: '' })} />
              )}
            </GalleryCountRow>
          )}

          {items.length > 0 ? (
            <div className="flex flex-col gap-xl">
              {sections.map((section, index) => {
                const sectionTab = tabForKind(section.kind);
                const showAll = singleKind === null && tabs.some((t) => t.slug === sectionTab.slug);
                return (
                  <div key={section.kind} className="flex flex-col">
                    <MarketSection
                      title={sectionTab.label}
                      gridSize={gridSize}
                      aside={
                        <div className="flex items-center gap-xs">
                          {showAll && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => set({ tab: sectionTab.slug })}
                            >
                              Alle anzeigen
                            </Button>
                          )}
                          {index === 0 && (
                            <GridSizeToggle gridSize={gridSize} onToggle={toggleGridSize} />
                          )}
                        </div>
                      }
                    >
                      {section.items.map((item) => (
                        <MarketplaceCard
                          key={item.key}
                          item={item}
                          actions={actions}
                          onSelect={() => select(item)}
                        />
                      ))}
                    </MarketSection>
                    {singleKind !== null && kindQuery.hasNextPage && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-md self-center"
                        onClick={() => void kindQuery.fetchNextPage()}
                        disabled={kindQuery.isFetchingNextPage}
                      >
                        {kindQuery.isFetchingNextPage ? 'Lädt …' : 'Mehr laden'}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : active.isError ? (
            <GalleryEmptyState
              title="Der Marktplatz konnte nicht geladen werden"
              hint={active.error?.message ?? 'Versuch es gleich noch einmal.'}
              action={
                <Button variant="outline" size="sm" onClick={() => void active.refetch()}>
                  Erneut versuchen
                </Button>
              }
            />
          ) : active.isPending ? (
            <div className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-3">
              <GallerySkeleton count={6} className="h-[190px]" />
            </div>
          ) : (
            <GalleryEmptyState
              title={filtered ? 'Nichts gefunden' : 'Hier ist gerade nichts'}
              hint={marketplaceEmptyText(tab, filters.q)}
              action={
                filtered ? (
                  <Button variant="outline" size="sm" onClick={reset}>
                    Zurücksetzen
                  </Button>
                ) : undefined
              }
            />
          )}
        </>
      )}
      {dialogs}
    </div>
  );
}

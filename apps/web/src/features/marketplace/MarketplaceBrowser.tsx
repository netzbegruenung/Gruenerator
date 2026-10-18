import { useUserLandesverbaende } from '@gruenerator/chat';
import {
  MARKETPLACE_KINDS,
  type MarketplaceItem,
  type MarketplaceKind,
  type MarketplaceOrigin,
  type MarketplaceSort,
} from '@gruenerator/contracts';
import {
  DEFAULT_MARKETPLACE_SORT,
  MARKETPLACE_ORIGINS,
  MARKETPLACE_SORTS,
  MARKETPLACE_TABS,
  marketplaceEmptyText,
  marketplaceOriginLabel,
  tabForKind,
  useMarketplaceKind,
  useMarketplaceSections,
  type MarketplaceFilters,
  type MarketplaceTab,
  type MarketplaceTabSlug,
} from '@gruenerator/shared/marketplace';
import { useDebouncedSearch } from '@gruenerator/shared/studio-assets';
import { Button, cn, pillActive, pillBase, pillInactive } from '@gruenerator/ui';
import { useState, type JSX } from 'react';
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
import { MarketplaceItemDetail } from './MarketplaceItemDetail';
import { useMarketplaceActions } from './useMarketplaceActions';

/** Origins only tell Agents and Rezepte apart; Vorlagen, Sticker and Hintergründe are always public. */
const ORIGIN_KINDS: readonly MarketplaceKind[] = ['agent', 'recipe'];
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
}

const isAsset = (item: MarketplaceItem): item is MarketplaceAssetItem =>
  item.kind === 'sticker' || item.kind === 'background';

/**
 * The Marktplatz body, the same on `/marktplatz` and in every popup, in the
 * Agentura's layout: kind tabs, the active filters as chips, then one aisle
 * per kind („Alle") or the paged aisle of one kind. A tile opens its detail in
 * place. Filters are controlled — the page keeps them in the address, the
 * dialog in local state.
 */
export function MarketplaceBrowser({
  filters,
  onChange,
  kinds = MARKETPLACE_KINDS,
  onPick,
}: MarketplaceBrowserProps): JSX.Element {
  const tabs = tabsFor(kinds);
  const tab = shownTab(filters.tab, kinds);
  const tabKinds = kindsOfTab(tab, kinds);
  const singleKind = tab === 'alle' ? null : (tabKinds[0] ?? null);
  const q = useDebouncedSearch(filters.q);
  const { lvIds } = useUserLandesverbaende();
  const { actions, dialogs } = useMarketplaceActions();
  const [gridSize, toggleGridSize] = useGridSize('marketplace-grid-size', 'large');
  const [opened, setOpened] = useState<MarketplaceItem | null>(null);

  const origin = showsOrigins(tabKinds) ? filters.origin : null;
  const base = { origin, q, sort: filters.sort, scope: 'shop', platform: 'web' } as const;
  const sectionsQuery = useMarketplaceSections({
    ...base,
    kinds: tabKinds,
    enabled: singleKind === null,
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
    else setOpened(item);
  };
  // The detail follows the cache, so a like or save shows there at once.
  const openedLive = opened ? (items.find((i) => i.key === opened.key) ?? opened) : null;

  if (openedLive) {
    return (
      <>
        <MarketplaceItemDetail item={openedLive} actions={actions} onBack={() => setOpened(null)} />
        {dialogs}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-md">
      {tabs.length > 1 && (
        <div role="group" aria-label="Art" className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.slug}
              type="button"
              aria-pressed={t.slug === tab}
              onClick={() => set({ tab: t.slug })}
              className={cn(pillBase, 'text-sm', t.slug === tab ? pillActive : pillInactive)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

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
      {dialogs}
    </div>
  );
}

import { useUserProfileStore } from '@gruenerator/chat/stores';
import {
  MARKETPLACE_KINDS,
  type MarketplaceCollectionId,
  type MarketplaceItem,
  type MarketplaceKind,
} from '@gruenerator/contracts';
import { landesverbandIdsForRoles } from '@gruenerator/shared/agents';
import {
  DEFAULT_MARKETPLACE_SORT,
  MARKETPLACE_SORTS,
  isFrontpageView,
  kindsOfMarketplaceTab,
  marketplaceEmptyText,
  marketplaceOriginLabel,
  marketplaceOriginsFor,
  marketplaceTabsFor,
  showsMarketplaceOrigins,
  shownMarketplaceTab,
  tabForKind,
  useMarketplaceItem,
  useMarketplaceKind,
  useMarketplaceSections,
  type MarketplaceFilters,
  type MarketplaceTabSlug,
  type MarketplaceTarget,
} from '@gruenerator/shared/marketplace';
import { useDebouncedSearch } from '@gruenerator/shared/studio-assets';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import {
  BODY_FONT,
  HEADING_FONT_BOLD,
  HEADING_FONT_SEMIBOLD,
  borderRadius,
  colors,
  spacing,
} from '../../theme';
import { SearchField } from '../agentura/SearchField';
import { Button } from '../common/Button';
import { SkeletonRows } from '../common/Skeleton';
import { useShareToken } from '../studio-assets/useShareToken';

import { marketplaceCardProps } from './kindViews';
import { MarketCard } from './MarketCard';
import { MarketplaceCategoryView } from './MarketplaceCategoryView';
import { MarketplaceCollectionView } from './MarketplaceCollectionView';
import { MarketplaceFrontpage } from './MarketplaceFrontpage';
import { MarketplaceItemDetail } from './MarketplaceItemDetail';
import { marketplaceHubRoute, marketplaceRoute, marketplaceShareUrl } from './marketplaceTarget';
import { useMarketplaceActions, type Navigate } from './useMarketplaceActions';

/** How many cards a kind previews under „Alle". */
const SECTION_PREVIEW = 4;

export interface MarketplaceBrowserProps {
  initialFilters: MarketplaceFilters;
  /** The kinds this place offers; the server answers only these. Default: all. */
  kinds?: readonly MarketplaceKind[];
  /** Picker mode: a tap hands the item back instead of opening it. */
  onPick?: (item: MarketplaceItem) => void;
  /** How leaving for another screen works here (a sheet closes first). */
  navigate?: Navigate;
  /** Heading over the search — the sheet has no navigation bar to carry it. */
  title?: string;
  description?: string;
  /** Inside a sheet: no report form (a modal over the modal). */
  inSheet?: boolean;
  /**
   * The Marktplatz screen: the front page while nothing narrows the list, the
   * categories at its end in place of the kind tabs, and collections and
   * categories as pages of their own (`?kollektion=`, `?kategorie=`).
   */
  frontpage?: boolean;
}

interface Aisle {
  key: string;
  title: string;
  data: MarketplaceItem[];
  /** „Alle anzeigen" switches to this tab. */
  more: MarketplaceTabSlug | null;
}

/**
 * The Marktplatz body (web: `MarketplaceBrowser`): the search on top, then
 * aisles of cards — one per kind under „Alle", the paged aisle of one kind,
 * which loads more as it scrolls. In the sheet the kind tabs, origins and sort
 * sit under the search; on the screen the front page leads instead, and the
 * active filters show as chips. A card opens the item's page (`?item=`), in the
 * sheet a short view in place; in picker mode it is handed back instead.
 */
export function MarketplaceBrowser({
  initialFilters,
  kinds = MARKETPLACE_KINDS,
  onPick,
  navigate,
  title,
  description,
  inSheet = false,
  frontpage = false,
}: MarketplaceBrowserProps) {
  const theme = useTheme();
  const router = useRouter();
  const token = useShareToken();
  const lvIds = useLandesverbandIds();
  const locale = useUserProfileStore((s) => s.locale) === 'de-AT' ? 'de-AT' : 'de-DE';
  const tabs = marketplaceTabsFor(kinds);
  const [tab, setTab] = useState(shownMarketplaceTab(initialFilters.tab, kinds));
  const [origin, setOrigin] = useState(initialFilters.origin);
  const [sort, setSort] = useState(initialFilters.sort);
  const [searchInput, setSearchInput] = useState(initialFilters.q);
  const q = useDebouncedSearch(searchInput);
  // `item=<kind>:<ref>` in the address (a shared link) opens its detail at once.
  const [opened, setOpened] = useState<MarketplaceTarget | null>(initialFilters.item);
  const actions = useMarketplaceActions(navigate);

  const tabKinds = kindsOfMarketplaceTab(tab, kinds);
  const multi = tab === 'alle';
  const singleKind = tabKinds[0]!;
  const showsOrigins = showsMarketplaceOrigins(tabKinds);
  const shownOrigin = showsOrigins ? origin : null;
  const { collection, category } = frontpage
    ? initialFilters
    : { collection: null, category: null };
  const showFrontpage =
    frontpage &&
    isFrontpageView({
      tab,
      origin: shownOrigin,
      q: searchInput,
      sort,
      item: null,
      collection: null,
      category: null,
    });
  const base = { origin: shownOrigin, q, sort, scope: 'shop', platform: 'mobile' } as const;
  const sections = useMarketplaceSections({
    ...base,
    kinds: tabKinds,
    enabled: multi && !showFrontpage && !category && !collection,
  });
  const paged = useMarketplaceKind({ ...base, kind: singleKind, enabled: !multi });
  const query = multi ? sections : paged;

  const aisles: Aisle[] = multi
    ? sections.sections
        .filter((s) => s.items.length > 0)
        .map((s) => ({
          key: s.kind,
          title: tabForKind(s.kind).label,
          data: s.items.slice(0, SECTION_PREVIEW),
          more: tabForKind(s.kind).slug,
        }))
    : paged.items.length > 0
      ? [{ key: singleKind, title: tabForKind(singleKind).label, data: paged.items, more: null }]
      : [];

  // The short view follows the lists, so a like or save shows there at once. An
  // item the lists do not hold (a shared link, another tab) is loaded alone.
  const listed = opened
    ? (aisles.flatMap((a) => a.data).find((i) => i.kind === opened.kind && i.ref === opened.ref) ??
      null)
    : null;
  const single = useMarketplaceItem(opened, { platform: 'mobile', enabled: listed === null });
  const current = listed ?? single.data ?? null;

  const searching = searchInput.trim() !== '';
  const sorted = sort !== DEFAULT_MARKETPLACE_SORT;
  const filtered = searching || shownOrigin !== null || sorted;
  const reset = () => {
    setSearchInput('');
    setOrigin(null);
    setSort(DEFAULT_MARKETPLACE_SORT);
  };
  // On the screen an item is a page of its own, so the system back leads to
  // where it was tapped; the sheet has no stack and opens it in place.
  const select = (item: MarketplaceItem) =>
    onPick
      ? onPick(item)
      : frontpage
        ? actions.show(item)
        : setOpened({ kind: item.kind, ref: item.ref });
  // Collections, categories and Landesverbände are pages of their own, so the
  // system back leads out of them again (web: a history entry).
  const browse = (patch: Partial<MarketplaceFilters>) => {
    if (patch.collection || patch.category) {
      router.push(marketplaceRoute({ collection: patch.collection, category: patch.category }));
      return;
    }
    if (patch.tab) setTab(patch.tab);
    if ('origin' in patch) setOrigin(patch.origin ?? null);
    if (patch.sort) setSort(patch.sort);
  };
  const openCollection = (id: MarketplaceCollectionId) =>
    router.push(marketplaceRoute({ collection: id }));

  const note = (title: string, hint: string | null, action: ReactNode = null) => (
    <View style={styles.note}>
      <Ionicons name="storefront-outline" size={40} color={theme.textSecondary} />
      <Text style={[styles.noteTitle, { color: theme.text }]}>{title}</Text>
      {hint ? <Text style={[styles.noteText, { color: theme.textSecondary }]}>{hint}</Text> : null}
      {action}
    </View>
  );
  const placeholder = query.isLoading ? (
    <SkeletonRows count={4} leading={40} on="card" style={styles.loading} />
  ) : query.isError ? (
    note(
      'Der Marktplatz konnte nicht geladen werden',
      'Versuch es gleich noch einmal.',
      <Button variant="outline" onPress={() => void query.refetch()}>
        Erneut versuchen
      </Button>
    )
  ) : (
    note(
      filtered ? 'Nichts gefunden' : 'Hier ist gerade nichts',
      marketplaceEmptyText(tab, q),
      filtered ? (
        <Button variant="outline" onPress={reset}>
          Zurücksetzen
        </Button>
      ) : null
    )
  );

  if (opened) {
    if (current) {
      return (
        <View style={styles.root}>
          <MarketplaceItemDetail
            item={current}
            token={token}
            actions={actions}
            onBack={frontpage ? undefined : () => setOpened(null)}
            shareUrl={marketplaceShareUrl({ tab, origin: shownOrigin, q, sort, item: opened })}
            allowReport={!inSheet}
            onSelect={select}
            onOpenCollection={frontpage ? openCollection : undefined}
          />
        </View>
      );
    }
    return (
      <View style={styles.root}>
        {frontpage ? null : (
          <Pressable
            onPress={() => setOpened(null)}
            hitSlop={8}
            accessibilityRole="button"
            style={styles.back}
          >
            <Ionicons name="arrow-back" size={16} color={theme.textSecondary} />
            <Text style={[styles.backText, { color: theme.textSecondary }]}>
              Zurück zum Marktplatz
            </Text>
          </Pressable>
        )}
        {single.isError ? (
          note(
            'Dieser Eintrag ist nicht verfügbar',
            'Vielleicht wurde er gelöscht oder ist nicht mehr öffentlich.'
          )
        ) : (
          <SkeletonRows count={3} leading={40} on="card" style={styles.loading} />
        )}
      </View>
    );
  }

  if (category) {
    return (
      <View style={styles.root}>
        <MarketplaceCategoryView id={category} token={token} actions={actions} onSelect={select} />
      </View>
    );
  }

  if (collection) {
    return (
      <View style={styles.root}>
        <MarketplaceCollectionView
          id={collection}
          token={token}
          actions={actions}
          onSelect={select}
          onBack={() => router.back()}
          onOpen={openCollection}
        />
      </View>
    );
  }

  const origins = marketplaceOriginsFor(lvIds, origin);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        {title ? (
          <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        {description ? (
          <Text style={[styles.description, { color: theme.textSecondary }]}>{description}</Text>
        ) : null}
        <SearchField
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Marktplatz durchsuchen"
        />
        {frontpage ? (
          // The front page's ways in are its shelves and categories; what narrows the list shows as chips.
          !showFrontpage && filtered ? (
            <ChipRow label="Aktive Filter">
              {shownOrigin ? (
                <FilterChip
                  label={marketplaceOriginLabel(shownOrigin, lvIds)}
                  onRemove={() => setOrigin(null)}
                />
              ) : null}
              {sorted ? (
                <FilterChip
                  label={MARKETPLACE_SORTS.find((s) => s.value === sort)?.label ?? ''}
                  onRemove={() => setSort(DEFAULT_MARKETPLACE_SORT)}
                />
              ) : null}
              {searching ? (
                <FilterChip label={`„${searchInput.trim()}“`} onRemove={() => setSearchInput('')} />
              ) : null}
              <Pressable
                onPress={reset}
                hitSlop={8}
                accessibilityRole="button"
                style={styles.reset}
              >
                <Text style={[styles.more, { color: theme.textGreen }]}>Zurücksetzen</Text>
              </Pressable>
            </ChipRow>
          ) : null
        ) : (
          <>
            {tabs.length > 1 ? (
              <ChipRow label="Art">
                {tabs.map((t) => (
                  <Chip
                    key={t.slug}
                    label={t.label}
                    selected={t.slug === tab}
                    onPress={() => setTab(t.slug)}
                  />
                ))}
              </ChipRow>
            ) : null}
            <ChipRow label="Herkunft und Sortierung">
              {showsOrigins
                ? origins.map((o) => (
                    <Chip
                      key={o.value}
                      label={marketplaceOriginLabel(o.value, lvIds)}
                      selected={origin === o.value}
                      // A second tap shows every origin again.
                      onPress={() => setOrigin(origin === o.value ? null : o.value)}
                    />
                  ))
                : null}
              <SortChip value={sort} onChange={setSort} />
            </ChipRow>
          </>
        )}
      </View>
      {showFrontpage ? (
        <MarketplaceFrontpage
          locale={locale}
          lvIds={lvIds}
          token={token}
          actions={actions}
          onSelect={select}
          onBrowse={browse}
          onOpenHub={(slug) => router.push(marketplaceHubRoute(slug))}
        />
      ) : (
        <SectionList
          sections={aisles}
          keyExtractor={(item) => item.key}
          renderSectionHeader={({ section }) => (
            <View style={styles.aisleHeader}>
              <Text style={[styles.aisle, { color: theme.text }]} accessibilityRole="header">
                {section.title}
              </Text>
              {section.more ? (
                <Pressable
                  onPress={() => section.more && setTab(section.more)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Alle ${section.title} anzeigen`}
                >
                  <Text style={[styles.more, { color: theme.textGreen }]}>Alle anzeigen</Text>
                </Pressable>
              ) : null}
            </View>
          )}
          renderItem={({ item }) => (
            <MarketCard
              {...marketplaceCardProps(item, token)}
              onPress={() => select(item)}
              onToggleAdded={() => actions.toggleSave(item)}
            />
          )}
          ItemSeparatorComponent={Gap}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={<>{placeholder}</>}
          ListFooterComponent={
            !multi && paged.isFetchingNextPage ? (
              <ActivityIndicator color={theme.textGreen} style={styles.footer} />
            ) : undefined
          }
          onEndReached={() => {
            if (!multi && paged.hasNextPage && !paged.isFetchingNextPage)
              void paged.fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          initialNumToRender={8}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

/**
 * The person's Landesverbände for the origin label (`Grüne Hessen`), the same
 * as `useUserLandesverbaende` — read from the store directly, because the chat
 * package's entry pulls the whole chat runtime into every screen that shows
 * the Marktplatz.
 */
function useLandesverbandIds(): readonly string[] | null {
  const roles = useUserProfileStore((s) => s.roles);
  const locale = useUserProfileStore((s) => s.locale);
  const isHydrated = useUserProfileStore((s) => s.isHydrated);
  return useMemo(
    () => (isHydrated ? landesverbandIdsForRoles(roles, locale) : null),
    [roles, locale, isHydrated]
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
      accessibilityLabel={label}
    >
      {children}
    </ScrollView>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.secondary[600] : theme.surface,
          borderColor: selected ? colors.secondary[600] : theme.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? colors.white : theme.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** An active filter with its own ×, as on the web's filter row. */
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onRemove}
      accessibilityRole="button"
      accessibilityLabel={`Filter entfernen: ${label}`}
      style={({ pressed }) => [
        styles.chip,
        styles.sort,
        {
          backgroundColor: theme.backgroundAlt,
          borderColor: theme.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: theme.text }]}>{label}</Text>
      <Ionicons name="close" size={14} color={theme.text} />
    </Pressable>
  );
}

/** Cycles Empfohlen → Neu → Beliebt. */
function SortChip({
  value,
  onChange,
}: {
  value: MarketplaceFilters['sort'];
  onChange: (sort: MarketplaceFilters['sort']) => void;
}) {
  const theme = useTheme();
  const index = Math.max(
    0,
    MARKETPLACE_SORTS.findIndex((s) => s.value === value)
  );
  const current = MARKETPLACE_SORTS[index]!;
  const next = MARKETPLACE_SORTS[(index + 1) % MARKETPLACE_SORTS.length]!;
  return (
    <Pressable
      onPress={() => onChange(next.value)}
      accessibilityRole="button"
      accessibilityLabel={`Sortierung: ${current.label}`}
      accessibilityHint={`Wechselt zu ${next.label}`}
      style={({ pressed }) => [
        styles.chip,
        styles.sort,
        { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Ionicons name="swap-vertical" size={14} color={theme.text} />
      <Text style={[styles.chipText, { color: theme.text }]}>{current.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    gap: spacing.small,
    paddingBottom: spacing.small,
  },
  title: {
    fontFamily: HEADING_FONT_BOLD,
    fontSize: 24,
  },
  description: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    lineHeight: 20,
  },
  chips: { gap: spacing.xsmall },
  chip: {
    height: 34,
    paddingHorizontal: spacing.medium,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '600' },
  sort: { flexDirection: 'row', gap: spacing.xxsmall },
  list: { flex: 1 },
  listContent: {
    paddingBottom: spacing.xlarge,
  },
  aisleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.medium,
    paddingBottom: spacing.small,
  },
  aisle: {
    fontFamily: HEADING_FONT_SEMIBOLD,
    fontSize: 17,
  },
  more: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '600' },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    alignSelf: 'flex-start',
    paddingTop: spacing.small,
  },
  backText: {
    fontFamily: HEADING_FONT_SEMIBOLD,
    fontSize: 14,
  },
  gap: {
    height: spacing.small,
  },
  loading: { paddingTop: spacing.medium },
  footer: { paddingVertical: spacing.medium },
  note: {
    alignItems: 'center',
    gap: spacing.medium,
    paddingVertical: spacing.xxlarge,
    paddingHorizontal: spacing.large,
  },
  reset: { justifyContent: 'center', paddingHorizontal: spacing.xsmall },
  noteTitle: {
    fontFamily: BODY_FONT,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  noteText: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});

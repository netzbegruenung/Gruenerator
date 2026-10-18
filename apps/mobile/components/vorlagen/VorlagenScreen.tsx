import { type MarketplaceItemOf, type SharepicVorlage } from '@gruenerator/contracts';
import { MARKETPLACE_QUERY_KEY, useMarketplaceKind } from '@gruenerator/shared/marketplace';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { Image, type ImageSource } from 'expo-image';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { useSharepicVorlagen } from '../../hooks/useSharepicVorlagen';
import { useTheme } from '../../hooks/useTheme';
import { secureStorage } from '../../services/storage';
import {
  fetchMyTemplates,
  fetchTemplateInteractions,
  getPublicImageUrl,
  setTemplateBookmark,
  setTemplateLike,
  type Template,
} from '../../services/vorlagen';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { borderRadius, colors, spacing, typography } from '../../theme';
import { GRID_MAX_WIDTH, gridColumns } from '../../theme/layout';
import { SkeletonTiles } from '../common/Skeleton';
import { marketplaceRoute } from '../marketplace/marketplaceTarget';
import { useMarketplaceActions } from '../marketplace/useMarketplaceActions';

import { SharepicVorlageSheet } from './SharepicVorlageSheet';
import { VorlagenFilterSheet, type VorlagenFilter } from './VorlagenFilterSheet';
import { VorlagenHeaderActions } from './VorlagenHeaderActions';
import { vorlageAspectRatio, vorlageThumbSource } from './vorlageThumb';

const ALL = 'all';
const MEINE = 'meine';
const FILTERS: VorlagenFilter[] = [
  { id: ALL, label: 'Alle Vorlagen' },
  { id: MEINE, label: 'Meine Vorlagen' },
];
const ITEM_GAP = spacing.small;
const MIN_TILE = { small: 160, large: 260 } as const;

type Item =
  | { kind: 'catalog'; id: string; vorlage: SharepicVorlage }
  | { kind: 'mine'; id: string; template: Template }
  /** A bookmarked public Vorlage — the public ones themselves live in the Marktplatz. */
  | { kind: 'public'; id: string; item: MarketplaceItemOf<'template'> };

type EmptyCause = 'favorites' | 'meine' | 'none';

const EMPTY_TEXT: Record<EmptyCause, { title: string; hint?: string }> = {
  favorites: {
    title: 'Noch keine gemerkten Vorlagen',
    hint: 'Tippe an einer Vorlage auf das Lesezeichen, um sie dir zu merken.',
  },
  meine: { title: 'Noch keine eigenen Vorlagen' },
  none: { title: 'Noch keine Vorlagen' },
};

/**
 * The Grünerator-Vorlagen, the own ones and the bookmarked ones, like web's
 * /vorlagen: own country only (the server decides), a filter for „Meine
 * Vorlagen", a bookmark toggle and a card size switch in the header. What
 * others share publicly is in the Marktplatz („Öffentliche Vorlagen").
 */
export function VorlagenScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const gridSize = usePreferencesStore((s) => s.vorlagenGridSize);
  const setGridSize = usePreferencesStore((s) => s.setVorlagenGridSize);

  const available = Math.min(width, GRID_MAX_WIDTH) - spacing.medium * 2;
  const numColumns =
    gridSize === 'large'
      ? Math.max(1, Math.floor((available + ITEM_GAP) / (MIN_TILE.large + ITEM_GAP)))
      : gridColumns(available, MIN_TILE.small, ITEM_GAP);
  const itemSize = Math.floor((available - ITEM_GAP * (numColumns - 1)) / numColumns);

  const [filter, setFilter] = useState(ALL);
  const [filterOpen, setFilterOpen] = useState(false);
  const [onlyBookmarked, setOnlyBookmarked] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [bookmarked, setBookmarked] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [openVorlage, setOpenVorlage] = useState<SharepicVorlage | null>(null);
  const catalogQuery = useSharepicVorlagen();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { open: openPublic } = useMarketplaceActions();

  const isMeine = filter === MEINE;
  const showSaved = onlyBookmarked && !isMeine;
  const savedQuery = useMarketplaceKind({
    kind: 'template',
    scope: 'saved',
    platform: 'mobile',
    origin: null,
    q: '',
    sort: 'neu',
    enabled: showSaved,
  });

  useEffect(() => {
    void secureStorage.getToken().then(setToken);
  }, []);

  // Re-read on focus: a public Vorlage saved in the Marktplatz changes these
  // sets through another path, and „Gemerkt" filters by them.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void fetchTemplateInteractions().then((r) => {
        if (cancelled) return;
        setLiked(r.liked);
        setBookmarked(r.bookmarked);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const loadTemplates = useCallback(
    () => (filter === MEINE ? fetchMyTemplates() : Promise.resolve([])).then(setTemplates),
    [filter]
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true); // eslint-disable-line react-hooks/set-state-in-effect -- loading state must be set synchronously before async call
    void loadTemplates().finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadTemplates]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadTemplates(),
      catalogQuery.refetch(),
      showSaved ? savedQuery.refetch() : null,
    ]);
    setRefreshing(false);
  }, [loadTemplates, catalogQuery, showSaved, savedQuery]);

  const filterLabel =
    filter === ALL ? null : (FILTERS.find((f) => f.id === filter)?.label ?? filter);

  const items = useMemo<Item[]>(() => {
    if (isMeine) return templates.map((t): Item => ({ kind: 'mine', id: t.id, template: t }));
    const catalog = (catalogQuery.data ?? []).map((v): Item => ({
      kind: 'catalog',
      id: v.id,
      vorlage: v,
    }));
    if (!showSaved) return catalog;
    const saved = savedQuery.items.flatMap((i): Item[] =>
      i.kind === 'template' ? [{ kind: 'public', id: i.ref, item: i }] : []
    );
    return [...catalog, ...saved].filter((i) => bookmarked.has(i.id));
  }, [isMeine, templates, catalogQuery.data, showSaved, savedQuery.items, bookmarked]);

  const toggle = useCallback(
    async (
      id: string,
      current: Set<string>,
      update: (fn: (prev: Set<string>) => Set<string>) => void,
      write: (id: string, on: boolean) => Promise<boolean>
    ) => {
      const on = !current.has(id);
      const flip = (prev: Set<string>) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      };
      update(flip);
      if (!(await write(id, on))) update(flip);
      // The bookmarked public Vorlagen come from the Marktplatz's „Gemerkt".
      else void queryClient.invalidateQueries({ queryKey: MARKETPLACE_QUERY_KEY });
    },
    [queryClient]
  );

  const openTemplate = useCallback(async (template: Template) => {
    const url = template.external_url;
    if (!url) {
      Alert.alert('Keine URL', 'Diese Vorlage hat keine verknüpfte URL.');
      return;
    }
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.error('[Vorlagen] Failed to open URL:', error);
      Alert.alert('Fehler', 'Die URL konnte nicht geöffnet werden.');
    }
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Item }) => {
      const title =
        item.kind === 'catalog'
          ? item.vorlage.titel
          : item.kind === 'mine'
            ? item.template.title
            : item.item.title;
      const slides = item.kind === 'catalog' ? item.vorlage.spec.slides.length : 1;
      const imageHeight =
        item.kind === 'catalog' ? itemSize / vorlageAspectRatio(item.vorlage) : itemSize * 0.75;
      let source: ImageSource | null = null;
      if (item.kind === 'catalog') {
        source = token ? vorlageThumbSource(item.id, 1, token, item.vorlage.thumbVersion) : null;
      } else {
        const uri =
          item.kind === 'mine'
            ? item.template.thumbnail_url
            : getPublicImageUrl(item.item.thumbnailUrl ?? undefined);
        source = uri ? { uri } : null;
      }
      const isLiked = liked.has(item.id);
      const isBookmarked = bookmarked.has(item.id);
      const badge =
        item.kind === 'catalog'
          ? 'Grünerator'
          : item.kind === 'mine'
            ? (item.template.template_type ?? null)
            : item.item.template.templateType;

      return (
        <View style={{ width: itemSize }}>
          <Pressable
            onPress={() => {
              if (item.kind === 'catalog') setOpenVorlage(item.vorlage);
              else if (item.kind === 'mine') void openTemplate(item.template);
              else openPublic(item.item);
            }}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={slides > 1 ? `${title}, ${slides} Seiten` : title}
          >
            <View style={[styles.thumb, { height: imageHeight, backgroundColor: theme.surface }]}>
              {source ? (
                <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <Ionicons name="image-outline" size={32} color={colors.grey[400]} />
              )}
              {slides > 1 && (
                <View style={styles.pages}>
                  <Text style={styles.pagesText}>{slides} Seiten</Text>
                </View>
              )}
            </View>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
              {title}
            </Text>
            {badge ? (
              <View style={[styles.badge, { borderColor: theme.border }]}>
                <Text style={[styles.badgeText, { color: theme.textSecondary }]}>{badge}</Text>
              </View>
            ) : null}
          </Pressable>
          <View style={styles.actions}>
            <Pressable
              onPress={() => void toggle(item.id, liked, setLiked, setTemplateLike)}
              hitSlop={6}
              style={styles.action}
              accessibilityRole="button"
              accessibilityLabel="Gefällt mir"
              accessibilityState={{ selected: isLiked }}
            >
              <Ionicons
                name={isLiked ? 'heart' : 'heart-outline'}
                size={18}
                color={isLiked ? colors.primary[600] : colors.white}
              />
            </Pressable>
            <Pressable
              onPress={() => void toggle(item.id, bookmarked, setBookmarked, setTemplateBookmark)}
              hitSlop={6}
              style={styles.action}
              accessibilityRole="button"
              accessibilityLabel="Merken"
              accessibilityState={{ selected: isBookmarked }}
            >
              <Ionicons
                name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                size={18}
                color={isBookmarked ? colors.primary[600] : colors.white}
              />
            </Pressable>
          </View>
        </View>
      );
    },
    [itemSize, token, liked, bookmarked, theme, openTemplate, openPublic, toggle]
  );

  const settled = !isLoading && !catalogQuery.isLoading && !(showSaved && savedQuery.isLoading);
  const emptyCause: EmptyCause = isMeine ? 'meine' : showSaved ? 'favorites' : 'none';
  const empty = (
    <View style={styles.empty}>
      <Ionicons name="document-outline" size={56} color={theme.textSecondary} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>{EMPTY_TEXT[emptyCause].title}</Text>
      {EMPTY_TEXT[emptyCause].hint ? (
        <Text style={[styles.emptyHint, { color: theme.textSecondary }]}>
          {EMPTY_TEXT[emptyCause].hint}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <VorlagenHeaderActions
              filterLabel={filterLabel}
              onOpenFilter={() => setFilterOpen(true)}
              showListControls={!isMeine}
              onlyBookmarked={onlyBookmarked}
              onToggleBookmarked={() => setOnlyBookmarked((on) => !on)}
              gridSize={gridSize}
              onToggleGridSize={() => void setGridSize(gridSize === 'large' ? 'small' : 'large')}
            />
          ),
        }}
      />
      <FlatList
        key={numColumns}
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        numColumns={numColumns}
        contentContainerStyle={styles.list}
        columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
        ListHeaderComponent={
          isMeine ? null : (
            <Pressable
              onPress={() => router.push(marketplaceRoute({ tab: 'vorlagen' }))}
              style={({ pressed }) => [
                styles.public,
                { backgroundColor: theme.surface, borderColor: theme.border },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Öffentliche Vorlagen"
              accessibilityHint="Öffnet den Marktplatz"
            >
              <Ionicons name="storefront-outline" size={20} color={theme.text} />
              <View style={styles.publicText}>
                <Text style={[styles.publicTitle, { color: theme.text }]}>
                  Öffentliche Vorlagen
                </Text>
                <Text style={[styles.publicHint, { color: theme.textSecondary }]}>
                  Was andere teilen, im Marktplatz
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
            </Pressable>
          )
        }
        ListEmptyComponent={
          settled ? (
            empty
          ) : (
            <SkeletonTiles
              count={numColumns * 3}
              itemWidth={itemSize}
              columns={numColumns}
              gap={ITEM_GAP}
              aspectRatio={4 / 5}
              radius={borderRadius.medium}
            />
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={colors.primary[600]}
          />
        }
      />
      <VorlagenFilterSheet
        visible={filterOpen}
        filters={FILTERS}
        selected={filter}
        onSelect={setFilter}
        onClose={() => setFilterOpen(false)}
      />
      <SharepicVorlageSheet
        vorlage={openVorlage}
        token={token}
        onClose={() => setOpenVorlage(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: {
    width: '100%',
    maxWidth: GRID_MAX_WIDTH,
    alignSelf: 'center',
    padding: spacing.medium,
    paddingBottom: spacing.xxlarge,
  },
  row: { gap: ITEM_GAP, marginBottom: ITEM_GAP },
  card: { marginBottom: spacing.small },
  pressed: { opacity: 0.8 },
  public: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    padding: spacing.medium,
    marginBottom: spacing.medium,
    borderRadius: borderRadius.medium,
    borderWidth: StyleSheet.hairlineWidth,
  },
  publicText: { flex: 1, gap: 2 },
  publicTitle: { ...typography.body, fontWeight: '600' },
  publicHint: { ...typography.caption },
  thumb: {
    borderRadius: borderRadius.medium,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pages: {
    position: 'absolute',
    bottom: spacing.xxsmall,
    left: spacing.xxsmall,
    paddingHorizontal: spacing.xsmall,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(15, 18, 16, 0.6)',
  },
  pagesText: { ...typography.caption, fontSize: 11, color: colors.white, fontWeight: '600' },
  title: { ...typography.caption, fontWeight: '600', marginTop: spacing.xxsmall },
  badge: {
    alignSelf: 'flex-start',
    marginTop: spacing.xxsmall,
    paddingHorizontal: spacing.xsmall,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeText: { ...typography.caption, fontSize: 11 },
  actions: {
    position: 'absolute',
    top: spacing.xxsmall,
    right: spacing.xxsmall,
    flexDirection: 'row',
    gap: spacing.xxsmall,
  },
  action: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 18, 16, 0.55)',
  },
  empty: { alignItems: 'center', paddingTop: spacing.xxlarge * 2, gap: spacing.xsmall },
  emptyTitle: { ...typography.h4, marginTop: spacing.small, textAlign: 'center' },
  emptyHint: {
    ...typography.body,
    textAlign: 'center',
    paddingHorizontal: spacing.xlarge,
  },
});

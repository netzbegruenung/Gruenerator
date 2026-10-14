import {
  type StudioAssetItem,
  type StudioAssetKind,
  type StudioAssetScope,
  type StudioAssetSort,
} from '@gruenerator/contracts';
import { profilbildAssetParams } from '@gruenerator/shared/stickers';
import {
  STUDIO_ASSET_RIGHTS_LABEL,
  STUDIO_ASSET_SCOPES,
  useStudioAssetMutations,
  useStudioAssets,
} from '@gruenerator/shared/studio-assets';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { secureStorage } from '../../services/storage';
import { BODY_FONT, borderRadius, colors, spacing, typography } from '../../theme';
import { GRID_MAX_WIDTH, gridColumns } from '../../theme/layout';
import { Button } from '../common/Button';
import { ReportSheet, type ReportTarget } from '../common/ReportSheet';
import { SegmentedControl } from '../common/SegmentedControl';
import { galleryErrorText } from '../profilbild/galleryModel';

import { KIND_OPTIONS, studioAssetEmptyText } from './studioAssetModel';
import { StudioAssetRenameSheet } from './StudioAssetRenameSheet';
import { StudioAssetTile, type StudioAssetAction } from './StudioAssetTile';

const SEARCH_DEBOUNCE_MS = 400;
const ITEM_GAP = spacing.small;
const MIN_TILE = 100;

const segments = <T extends string>(list: readonly { value: T; label: string }[]) =>
  list.map((o) => ({ ...o, short: o.label, disabled: false }));

const failed = (title: string) => (error: Error) => Alert.alert(title, error.message);

/** Web's /studio/sticker on the phone: browse, like, merken, manage own items, report others'. */
export function StudioAssetsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const available = Math.min(width, GRID_MAX_WIDTH) - spacing.medium * 2;
  const numColumns = gridColumns(available, MIN_TILE, ITEM_GAP);
  const itemSize = Math.floor((available - ITEM_GAP * (numColumns - 1)) / numColumns);

  const [kind, setKind] = useState<StudioAssetKind>('sticker');
  const [scope, setScope] = useState<StudioAssetScope>('shop');
  const [sort, setSort] = useState<StudioAssetSort>('new');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [renaming, setRenaming] = useState<StudioAssetItem | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let alive = true;
    void secureStorage.getToken().then((t) => {
      if (alive) setToken(t);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Only Entdecken has a popularity order; own and saved lists are newest first.
  const effectiveSort = scope === 'shop' ? sort : 'new';
  const {
    items,
    isLoading,
    isError,
    isFetchNextPageError,
    isFetchingNextPage,
    isRefetching,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useStudioAssets({ kind, scope, q, sort: effectiveSort });
  const { update, remove } = useStudioAssetMutations();

  const publish = (item: StudioAssetItem) =>
    Alert.alert(
      'Öffentlich machen',
      `„${item.title}“ erscheint dann unter „Entdecken“ und alle können es in ihren Bildern verwenden.\n\nMit „Öffentlich machen“ bestätigst du: ${STUDIO_ASSET_RIGHTS_LABEL}`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Öffentlich machen',
          onPress: () =>
            update.mutate(
              { id: item.id, body: { visibility: 'public', rightsConfirmed: true } },
              { onError: failed('Nicht veröffentlicht') }
            ),
        },
      ]
    );

  const confirmDelete = (item: StudioAssetItem) =>
    Alert.alert(
      'Löschen?',
      `„${item.title}“ landet im Papierkorb. Dort kannst du es 30 Tage lang wiederherstellen.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => remove.mutate(item.id, { onError: failed('Nicht gelöscht') }),
        },
      ]
    );

  const handleAction = (action: StudioAssetAction, item: StudioAssetItem) => {
    switch (action) {
      case 'use':
        router.push({ pathname: '/(focused)/profilbild', params: profilbildAssetParams(item) });
        return;
      case 'report':
        setReportTarget({ kind: 'studio_asset', targetId: item.id });
        return;
      case 'publish':
        publish(item);
        return;
      case 'private':
        update.mutate(
          { id: item.id, body: { visibility: 'private' } },
          { onError: failed('Nicht gespeichert') }
        );
        return;
      case 'rename':
        setRenaming(item);
        return;
      case 'delete':
        confirmDelete(item);
    }
  };

  const rename = (item: StudioAssetItem, title: string) =>
    update.mutate({ id: item.id, body: { title } }, { onError: failed('Nicht umbenannt') });

  const hint = [styles.hint, { color: theme.textSecondary }];
  const empty = isLoading ? (
    <ActivityIndicator color={theme.textGreen} style={styles.loading} />
  ) : isError ? (
    <View accessibilityRole="alert" style={styles.message}>
      <Text style={hint}>{galleryErrorText(kind)}</Text>
      <Button variant="outline" onPress={() => void refetch()}>
        Erneut versuchen
      </Button>
    </View>
  ) : (
    <Text style={[hint, styles.empty]}>{studioAssetEmptyText(kind, scope, q !== '')}</Text>
  );

  const footer = isFetchingNextPage ? (
    <ActivityIndicator color={theme.textGreen} style={styles.loading} />
  ) : isFetchNextPageError ? (
    <View accessibilityRole="alert" style={styles.message}>
      <Text style={hint}>{galleryErrorText(kind)}</Text>
      <Button variant="outline" onPress={() => void fetchNextPage()}>
        Erneut versuchen
      </Button>
    </View>
  ) : null;

  const searchLabel = kind === 'sticker' ? 'Sticker durchsuchen' : 'Hintergründe durchsuchen';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/(focused)/sticker-neu')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Sticker erstellen"
              style={styles.create}
            >
              <Ionicons name="add" size={20} color={theme.textGreen} />
              <Text style={[styles.createText, { color: theme.textGreen }]}>Erstellen</Text>
            </Pressable>
          ),
        }}
      />
      <View style={styles.controls}>
        <SegmentedControl
          accessibilityLabel="Art"
          value={kind}
          onChange={(v) => setKind(v as StudioAssetKind)}
          options={segments(KIND_OPTIONS)}
        />
        <SegmentedControl
          accessibilityLabel="Liste"
          value={scope}
          onChange={(v) => setScope(v as StudioAssetScope)}
          options={segments(STUDIO_ASSET_SCOPES)}
        />
        <View style={styles.searchRow}>
          <View
            style={[
              styles.searchField,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Ionicons name="search" size={18} color={theme.textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={searchLabel}
              placeholderTextColor={theme.textSecondary}
              style={[styles.searchInput, { color: theme.text }]}
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel={searchLabel}
            />
            {search.length > 0 ? (
              <Pressable
                onPress={() => setSearch('')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Suche zurücksetzen"
              >
                <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </View>
          {scope === 'shop' ? (
            <Pressable
              onPress={() => setSort(sort === 'new' ? 'popular' : 'new')}
              style={[styles.sort, { backgroundColor: theme.surface, borderColor: theme.border }]}
              accessibilityRole="button"
              accessibilityLabel={`Sortierung: ${sort === 'new' ? 'Neu' : 'Beliebt'}`}
              accessibilityHint="Wechselt zwischen Neu und Beliebt"
            >
              <Ionicons name="swap-vertical" size={16} color={theme.text} />
              <Text style={[styles.sortText, { color: theme.text }]}>
                {sort === 'new' ? 'Neu' : 'Beliebt'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <FlatList
        key={numColumns}
        data={items}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        renderItem={({ item }) => (
          <StudioAssetTile item={item} size={itemSize} token={token} onAction={handleAction} />
        )}
        contentContainerStyle={styles.list}
        columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
        }}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && !isFetchingNextPage}
            onRefresh={() => void refetch()}
            tintColor={colors.primary[600]}
          />
        }
      />
      <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
      <StudioAssetRenameSheet item={renaming} onSave={rename} onClose={() => setRenaming(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  create: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxsmall, minHeight: 44 },
  createText: { ...typography.bodyBold },
  controls: {
    width: '100%',
    maxWidth: GRID_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.small,
    paddingBottom: spacing.small,
    gap: spacing.small,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xsmall },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.medium,
    height: 44,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, fontFamily: BODY_FONT, fontSize: 15, paddingVertical: 0 },
  sort: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    height: 44,
    paddingHorizontal: spacing.small,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sortText: { ...typography.caption, fontWeight: '600' },
  list: {
    width: '100%',
    maxWidth: GRID_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.xxlarge,
  },
  row: { gap: ITEM_GAP },
  hint: { ...typography.body, textAlign: 'center' },
  empty: { paddingTop: spacing.large },
  message: { gap: spacing.small, alignItems: 'center', paddingTop: spacing.large },
  loading: { paddingVertical: spacing.large },
});

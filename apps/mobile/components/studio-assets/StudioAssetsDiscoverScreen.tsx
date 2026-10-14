import { type StudioAssetSort } from '@gruenerator/contracts';
import { useDebouncedSearch, useDiscoverStudioAssets } from '@gruenerator/shared/studio-assets';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { borderRadius, spacing, typography } from '../../theme';
import { GRID_MAX_WIDTH } from '../../theme/layout';

import { StudioAssetEmpty, StudioAssetSearchField, useTileSize } from './StudioAssetParts';
import { StudioAssetSection } from './StudioAssetSection';
import { useShareToken } from './useShareToken';
import { useStudioAssetActions } from './useStudioAssetActions';

const OVERVIEW_ROUTE = '/(focused)/sticker';

/**
 * „Entdecken“ — what others share publicly, as a modal over the own collection
 * (web: the popup at `/studio/sticker/entdecken`).
 */
export function StudioAssetsDiscoverScreen({ initialQuery }: { initialQuery: string }) {
  const theme = useTheme();
  const router = useRouter();
  const tileSize = useTileSize();
  const token = useShareToken();
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [sort, setSort] = useState<StudioAssetSort>('new');
  const q = useDebouncedSearch(searchInput);
  const { onAction, sheets } = useStudioAssetActions();
  const stickers = useDiscoverStudioAssets('sticker', q, sort);
  const backgrounds = useDiscoverStudioAssets('background', q, sort);

  const sections = [
    { title: 'Sticker', ...stickers },
    { title: 'Hintergründe', ...backgrounds },
  ].filter((s) => s.data.isLoading || s.data.items.length > 0);
  const settled = stickers.settled && backgrounds.settled;
  const error = stickers.error ?? backgrounds.error;

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace(OVERVIEW_ROUTE);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          headerLeft: () => null,
          headerRight: () => (
            <Pressable
              onPress={close}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Schließen"
              style={styles.headerButton}
            >
              <Ionicons name="close" size={24} color={theme.text} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          Was andere öffentlich teilen. Merke dir, was dir gefällt — es steht dann bei deinen
          Stickern und Hintergründen.
        </Text>
        <View style={styles.searchRow}>
          <StudioAssetSearchField value={searchInput} onChange={setSearchInput} />
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
        </View>

        {sections.length > 0 ? (
          sections.map((s) => (
            <StudioAssetSection
              key={s.title}
              title={s.title}
              data={s.data}
              tileSize={tileSize}
              token={token}
              onAction={onAction}
            />
          ))
        ) : error ? (
          <StudioAssetEmpty alert title="Konnte nicht geladen werden" hint={error.message} />
        ) : settled ? (
          <StudioAssetEmpty
            title={q ? 'Nichts gefunden' : 'Hier ist gerade nichts'}
            hint={
              q
                ? 'Versuch ein anderes Stichwort.'
                : 'Sobald jemand Sticker oder Hintergründe öffentlich teilt, stehen sie hier.'
            }
          />
        ) : null}
      </ScrollView>
      {sheets}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  content: {
    width: '100%',
    maxWidth: GRID_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.small,
    paddingBottom: spacing.xxlarge,
    gap: spacing.large,
  },
  description: { ...typography.body },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    marginTop: -spacing.small,
  },
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
});

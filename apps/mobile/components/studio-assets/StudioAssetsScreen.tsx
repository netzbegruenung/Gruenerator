import {
  STUDIO_ASSETS_QUERY_KEY,
  useDebouncedSearch,
  useOwnStudioAssets,
} from '@gruenerator/shared/studio-assets';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, typography } from '../../theme';
import { GRID_MAX_WIDTH } from '../../theme/layout';
import { Button } from '../common/Button';
import { marketplaceRoute } from '../marketplace/marketplaceTarget';

import { StudioAssetEmpty, StudioAssetSearchField, useTileSize } from './StudioAssetParts';
import { StudioAssetSection } from './StudioAssetSection';
import { useShareToken } from './useShareToken';
import { useStudioAssetActions } from './useStudioAssetActions';

const CREATE_ROUTE = '/(focused)/sticker-neu';

/**
 * „Sticker & Hintergründe“: the person's own collection — created and saved —
 * by kind, without tabs. What others share is in the Marktplatz.
 */
export function StudioAssetsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const tileSize = useTileSize();
  const token = useShareToken();
  const [searchInput, setSearchInput] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const q = useDebouncedSearch(searchInput);
  const { onAction, sheets } = useStudioAssetActions();
  const stickers = useOwnStudioAssets('sticker', q);
  const backgrounds = useOwnStudioAssets('background', q);

  const sections = [
    { title: 'Sticker', ...stickers },
    { title: 'Hintergründe', ...backgrounds },
  ].filter((s) => s.data.isLoading || s.data.items.length > 0);
  const settled = stickers.settled && backgrounds.settled;
  const error = stickers.error ?? backgrounds.error;

  const discover = (q = '') => router.push(marketplaceRoute({ tab: 'sticker', q }));
  const create = () => router.push(CREATE_ROUTE);

  const refresh = () => {
    setRefreshing(true);
    void queryClient
      .invalidateQueries({ queryKey: STUDIO_ASSETS_QUERY_KEY })
      .finally(() => setRefreshing(false));
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => discover()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Marktplatz"
                style={styles.headerButton}
              >
                <Ionicons name="storefront-outline" size={22} color={theme.text} />
              </Pressable>
              {/* Hintergründe lädt die App noch nicht hoch; „Neu“ ist hier der Sticker-Creator. */}
              <Pressable
                onPress={create}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Sticker erstellen"
                style={styles.headerButton}
              >
                <Ionicons name="add" size={26} color={theme.text} />
              </Pressable>
            </View>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.primary[600]}
          />
        }
      >
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          Deine Sticker und Hintergründe für Profilbild und Canvas. Was andere teilen, findest du im
          Marktplatz.
        </Text>
        <View style={styles.searchRow}>
          <StudioAssetSearchField value={searchInput} onChange={setSearchInput} />
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
          <StudioAssetEmpty
            alert
            title="Deine Sticker konnten nicht geladen werden"
            hint="Zieh die Seite nach unten oder versuch es gleich noch einmal."
          />
        ) : !settled ? null : q ? (
          <StudioAssetEmpty
            title="Keine Treffer"
            hint="Bei deinen Stickern und Hintergründen ist nichts dabei — vielleicht im Marktplatz."
          >
            <Button variant="outline" onPress={() => discover(q)}>
              Im Marktplatz suchen
            </Button>
          </StudioAssetEmpty>
        ) : (
          <StudioAssetEmpty
            title="Noch keine Sticker oder Hintergründe"
            hint="Erstelle einen Sticker oder merke dir etwas im Marktplatz."
          >
            <Button onPress={create}>Sticker erstellen</Button>
            <Button variant="outline" onPress={() => discover()}>
              Zum Marktplatz
            </Button>
          </StudioAssetEmpty>
        )}
      </ScrollView>
      {sheets}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xsmall },
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
  searchRow: { flexDirection: 'row', marginTop: -spacing.small },
});

import { useActionSheet } from '@expo/react-native-action-sheet';
import { useAuth } from '@gruenerator/shared/hooks';
import { findNamedRegion } from '@gruenerator/shared/utils';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';

import { BottomComposerBar } from '../../components/common/BottomComposerBar';
import { ScreenScaffold } from '../../components/navigation/ScreenScaffold';
import { MarketplaceNotebooksTile } from '../../components/notebook/MarketplaceNotebooksTile';
import { NotebookCreator } from '../../components/notebook/NotebookCreator';
import { NotebookSection } from '../../components/notebook/NotebookSection';
import { useNotebookTileGrid } from '../../components/notebook/NotebookTile';
import { NotebookShelf, type NotebookTarget } from '../../components/wissen/NotebookShelf';
import { PollCard } from '../../components/wissen/PollCard';
import { TrendsCard } from '../../components/wissen/TrendsCard';
import { WissenHeadlines } from '../../components/wissen/WissenHeadlines';
import { CARD_GAP, PAGE_GAP } from '../../components/wissen/WissenLayout';
import {
  getResearchRegions,
  getVisibleNotebooks,
  type MobileNotebookEntry,
} from '../../config/notebooksConfig';
import { useMonitorLocale } from '../../hooks/monitor/monitorLocale';
import { useNotebookSharing } from '../../hooks/notebook/useNotebookSharing';
import { useContentColumn } from '../../hooks/useLayout';
import { useNotebookCollections } from '../../hooks/useNotebookCollections';
import { useTabBarClearance } from '../../hooks/useTabBarClearance';
import { useFavoritesStore } from '../../stores/favoritesStore';
import { colors, spacing, useDashboardColors } from '../../theme';
import { getSurfaceFab } from '../../theme/toolTheme';
import { route, routeWithParams } from '../../types/routes';
import { goBackOr } from '../../utils/navigation';

type NotebookRef = { id: string; name: string };

export default function NotebooksScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { size: tileSize } = useNotebookTileGrid();
  const gridColumn = useContentColumn('grid');
  const dash = useDashboardColors();
  // Without this the last shelf scrolls to a stop underneath the tab bar.
  const bottomClearance = useTabBarClearance(spacing.xxlarge);
  const fabBottom = useTabBarClearance(spacing.small);
  const fabTone = getSurfaceFab('wissen', colorScheme === 'dark');
  const [creatorVisible, setCreatorVisible] = useState(false);
  // The ask-all-sources composer is opt-in: the gallery is what the tab is for,
  // and a permanently pinned bar ate a sixth of the screen for it.
  const [askVisible, setAskVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();
  const locale: 'de-DE' | 'de-AT' = user?.locale === 'de-AT' ? 'de-AT' : 'de-DE';
  const monitorLocale = useMonitorLocale();
  const {
    createCollection,
    deleteCollection,
    refetch: refetchCollections,
  } = useNotebookCollections();
  const { showActionSheetWithOptions } = useActionSheet();
  const { listGroups, shareToGroup, getShareUrl } = useNotebookSharing();
  const { favouriteIds, load: loadFavourites, toggle: toggleFavourite } = useFavoritesStore();

  useEffect(() => {
    void loadFavourites();
  }, [loadFavourites]);

  // Hoisted out of the section props below: an inline arrow there is a new function
  // on every render, which would defeat the tiles' `memo`.
  const handleToggleFavourite = useCallback(
    (nb: MobileNotebookEntry) => toggleFavourite(nb.id),
    [toggleFavourite]
  );

  const favouriteNotebooks = useMemo(
    () => getVisibleNotebooks(locale).filter((nb) => favouriteIds.includes(nb.id)),
    [locale, favouriteIds]
  );

  const handleNotebookPress = useCallback(
    (notebook: MobileNotebookEntry) => {
      router.push(routeWithParams('/notebook/[id]', { id: notebook.id, title: notebook.title }));
    },
    [router]
  );

  const handleOpen = useCallback(
    ({ id, title }: NotebookTarget) => {
      router.push(routeWithParams('/notebook/[id]', { id, title }));
    },
    [router]
  );

  const openBriefing = useCallback(() => router.push(route('/(focused)/briefing')), [router]);
  const openKeywords = useCallback(
    () => router.push(routeWithParams('/(focused)/briefing', { karte: 'keywords' })),
    [router]
  );
  const openPolls = useCallback(() => router.push(route('/(focused)/umfragen')), [router]);
  const openCreator = useCallback(() => setCreatorVisible(true), []);

  // Pull to refresh reloads everything on the screen: the monitor cards, the shared and
  // saved notebooks and the user's own.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // `.finally()` statt try/finally: der React Compiler übersetzt kein try ohne catch.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['monitor'] }),
      queryClient.invalidateQueries({ queryKey: ['notebookCollections'] }),
      refetchCollections(),
    ]).finally(() => setRefreshing(false));
  }, [queryClient, refetchCollections]);

  // The hero composer starts a notebook chat (scoped to the notebook, it
  // auto-sends `initialMessage`), with the notebook page beneath it. Route Austrian users
  // to their aggregate — Austria is a first-class locale.
  const handleHeroSend = useCallback(
    (text: string) => {
      // A named region ("was hat berlin … beschlossen") scopes the chat to that
      // notebook; otherwise the aggregate.
      const aggregateId = locale === 'de-AT' ? 'oesterreich-notebook' : 'gruenerator-notebook';
      const notebookId =
        findNamedRegion(text, getResearchRegions(locale))?.notebookId ?? aggregateId;
      router.push(
        routeWithParams('/notebook/[id]/chat', { id: notebookId, initialMessage: text }),
        {
          withAnchor: true,
        }
      );
    },
    [router, locale]
  );

  const handleDeleteCollection = useCallback(
    (id: string, name: string) => {
      Alert.alert('Notebook löschen', `„${name}" wirklich löschen?`, [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => deleteCollection(id),
        },
      ]);
    },
    [deleteCollection]
  );

  const handleShareCollection = useCallback(
    async (c: NotebookRef) => {
      const groups = await listGroups();
      const options = ['Link kopieren', ...groups.map((g) => `An „${g.name}" teilen`), 'Abbrechen'];
      showActionSheetWithOptions(
        { title: 'Teilen', options, cancelButtonIndex: options.length - 1 },
        async (i) => {
          if (i == null || i === options.length - 1) return;
          if (i === 0) {
            const url = await getShareUrl(c.id, c.name);
            if (url) {
              await Clipboard.setStringAsync(url);
              Alert.alert('Link kopiert', url);
            } else {
              Alert.alert('Fehler', 'Link konnte nicht erstellt werden.');
            }
            return;
          }
          const ok = await shareToGroup(c.id, groups[i - 1].id);
          Alert.alert(
            ok ? 'Geteilt' : 'Fehler',
            ok ? `„${c.name}" wurde geteilt.` : 'Teilen fehlgeschlagen.'
          );
        }
      );
    },
    [listGroups, shareToGroup, getShareUrl, showActionSheetWithOptions]
  );

  const handleCollectionActions = useCallback(
    (c: NotebookRef) => {
      const options = ['Öffnen', 'Teilen', 'Löschen', 'Abbrechen'];
      showActionSheetWithOptions(
        { title: c.name, options, destructiveButtonIndex: 2, cancelButtonIndex: 3 },
        (i) => {
          if (i === 0) handleOpen({ id: c.id, title: c.name });
          else if (i === 1) void handleShareCollection(c);
          else if (i === 2) handleDeleteCollection(c.id, c.name);
        }
      );
    },
    [showActionSheetWithOptions, handleOpen, handleShareCollection, handleDeleteCollection]
  );

  return (
    <ScreenScaffold
      title="Wissen"
      backdrop={<View style={[StyleSheet.absoluteFill, { backgroundColor: dash.page }]} />}
      // Opened from its tile on Arbeiten; a cold link has nothing beneath it.
      onBack={() => goBackOr('/start')}
    >
      <View style={styles.container}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={[
            gridColumn,
            styles.scrollContent,
            { paddingBottom: bottomClearance },
          ]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />
          }
        >
          <WissenHeadlines locale={monitorLocale} onOpenBriefing={openBriefing} />

          <View style={styles.cards}>
            <TrendsCard locale={monitorLocale} onOpen={openKeywords} />
            <PollCard locale={monitorLocale} onOpen={openPolls} />
          </View>

          <NotebookShelf
            onOpen={handleOpen}
            onCreate={openCreator}
            onOwnActions={handleCollectionActions}
          />

          {/* The app keeps its favourites (the web page has none) and the way into the
              Marktplatz' public notebooks. */}
          <NotebookSection
            title="Favoriten"
            notebooks={favouriteNotebooks}
            onNotebookPress={handleNotebookPress}
            onNotebookLongPress={handleToggleFavourite}
          />
          {user ? (
            <View style={styles.marketplace}>
              <MarketplaceNotebooksTile enabled size={tileSize} />
            </View>
          ) : null}

          <NotebookCreator
            visible={creatorVisible}
            onClose={() => setCreatorVisible(false)}
            createCollection={createCollection}
          />
        </ScrollView>

        {askVisible ? (
          <BottomComposerBar
            placeholder="Frage an alle Quellen…"
            onSend={handleHeroSend}
            autoFocus
            onDismissEmpty={() => setAskVisible(false)}
            onClose={() => setAskVisible(false)}
          />
        ) : (
          <Pressable
            onPress={() => setAskVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Frage an alle Quellen stellen"
            style={({ pressed }) => [
              styles.fab,
              {
                backgroundColor: fabTone.background,
                bottom: fabBottom,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              },
            ]}
          >
            <Ionicons name="search" size={24} color={fabTone.icon} />
          </Pressable>
        )}
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    right: spacing.medium,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
  },
  // Horizontal margin comes from the content column; the blocks are spaced by `gap`.
  // `paddingBottom` is not here: it depends on the safe-area inset and on the Android
  // tab capsule, neither of which a StyleSheet evaluated at import can see. See
  // `bottomClearance`.
  scrollContent: {
    paddingTop: spacing.small,
    gap: PAGE_GAP,
  },
  // Trends and Umfragen side by side, equally high.
  cards: {
    flexDirection: 'row',
    gap: CARD_GAP,
  },
  marketplace: {
    flexDirection: 'row',
  },
});

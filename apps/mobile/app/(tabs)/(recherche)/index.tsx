import { useActionSheet } from '@expo/react-native-action-sheet';
import { useUserLandesverbaende } from '@gruenerator/chat';
import { isLvNotebookVisibleForRoles } from '@gruenerator/shared/agents';
import { useAuth } from '@gruenerator/shared/hooks';
import { parseNotebookQuery } from '@gruenerator/shared/utils';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, useColorScheme, Pressable, Alert } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomComposerBar } from '../../../components/common/BottomComposerBar';
import { NotebookGradientBackground } from '../../../components/common/NotebookGradientBackground';
import { ScreenScaffold } from '../../../components/navigation/ScreenScaffold';
import { CommunityNotebooksSection } from '../../../components/notebook/CommunityNotebooksSection';
import { NotebookCard, useNotebookGrid } from '../../../components/notebook/NotebookCard';
import { NotebookCreator } from '../../../components/notebook/NotebookCreator';
import { NotebookSection } from '../../../components/notebook/NotebookSection';
import {
  getMobileNotebooksByCategory,
  getVisibleNotebooks,
  type MobileNotebookEntry,
} from '../../../config/notebooksConfig';
import { useNotebookSharing } from '../../../hooks/notebook/useNotebookSharing';
import { useContentColumn } from '../../../hooks/useLayout';
import {
  collectionIndexingState,
  useNotebookCollections,
  type MobileNotebookCollection,
} from '../../../hooks/useNotebookCollections';
import { useTabNavigationSwipe } from '../../../hooks/useTabSwipe';
import { useFavoritesStore } from '../../../stores/favoritesStore';
import { colors, spacing, typography, borderRadius, lightTheme, darkTheme } from '../../../theme';
import { FLOATING_TAB_BAR_HEIGHT } from '../../../theme/layout';
import { getSurfaceFab } from '../../../theme/toolTheme';
import { routeWithParams } from '../../../types/routes';

/**
 * "12 Dokumente · Beschreibung" line for a user's own notebook card.
 *
 * Readiness displaces the description rather than joining it: the card gives
 * this one truncated line, and a notebook that cannot answer yet is the more
 * useful thing to read there. Wording matches the web notebook cards.
 */
function collectionSubtitle(c: MobileNotebookCollection): string {
  const docs = `${c.document_count} Dokument${c.document_count === 1 ? '' : 'e'}`;
  const state = collectionIndexingState(c);
  if (state === 'indexing') return `${docs} · Wird indexiert`;
  if (state === 'failed') return `${docs} · Nicht durchsuchbar`;
  if (state === 'partial') return `${docs} · Teilweise indexiert`;
  return c.description ? `${docs} · ${c.description}` : docs;
}

export default function NotebooksScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const notebookGrid = useNotebookGrid();
  const gridColumn = useContentColumn('grid');
  const insets = useSafeAreaInsets();
  const fabTone = getSurfaceFab('wissen', colorScheme === 'dark');
  const [creatorVisible, setCreatorVisible] = useState(false);
  // The ask-all-sources composer is opt-in: the gallery is what the tab is for,
  // and a permanently pinned bar ate a sixth of the screen for it.
  const [askVisible, setAskVisible] = useState(false);
  const { user } = useAuth();
  const locale: 'de-DE' | 'de-AT' = user?.locale === 'de-AT' ? 'de-AT' : 'de-DE';
  const { collections, isLoading, createCollection, deleteCollection } = useNotebookCollections();
  // Last tab: swiping right walks back to Studio, swiping left does nothing.
  const swipe = useTabNavigationSwipe('/(tabs)/(recherche)');
  const { showActionSheetWithOptions } = useActionSheet();
  const { listGroups, shareToGroup, getShareUrl } = useNotebookSharing();
  const { favouriteIds, load: loadFavourites, toggle: toggleFavourite } = useFavoritesStore();

  useEffect(() => {
    void loadFavourites();
  }, [loadFavourites]);

  // Hoisted out of the five section props below: an inline arrow there is a new
  // function on every render, which would defeat the tiles' `memo` and re-render
  // all 19 covers whenever anything on this screen changed.
  const handleToggleFavourite = useCallback(
    (nb: MobileNotebookEntry) => toggleFavourite(nb.id),
    [toggleFavourite]
  );

  // Das Notizbuch eines Landesverbands gehört den Leuten dieses Verbands —
  // gebunden an die Rolle „Mitarbeiter*in Landesgeschäftsstelle", wie im Web.
  // Über ALLE Kategorien gelegt, nicht nur über `landesebene`: welche Kachel in
  // welchem Regal steht, ist eine Frage der Darstellung, die Zuteilung nicht.
  // Nicht-LV-Notizbücher passieren unverändert, `lvIds === null` (Rollen noch
  // nicht geladen) lässt alles durch.
  const { lvIds } = useUserLandesverbaende();
  const visible = useCallback(
    (list: MobileNotebookEntry[]) => list.filter((nb) => isLvNotebookVisibleForRoles(nb.id, lvIds)),
    [lvIds]
  );

  const bundesebene = useMemo(
    () => visible(getMobileNotebooksByCategory('bundesebene', locale)),
    [locale, visible]
  );
  const landesebene = useMemo(
    () => visible(getMobileNotebooksByCategory('landesebene', locale)),
    [locale, visible]
  );
  const weitere = useMemo(
    () => visible(getMobileNotebooksByCategory('weitere', locale)),
    [locale, visible]
  );
  const oesterreich = useMemo(
    () => visible(getMobileNotebooksByCategory('oesterreich', locale)),
    [locale, visible]
  );

  const favouriteNotebooks = useMemo(
    () => visible(getVisibleNotebooks(locale)).filter((nb) => favouriteIds.includes(nb.id)),
    [locale, favouriteIds, visible]
  );

  const handleNotebookPress = useCallback(
    (notebook: MobileNotebookEntry) => {
      router.push(
        routeWithParams('/(focused)/notebook-detail', {
          notebookId: notebook.id,
          title: notebook.title,
          kind: 'system',
        })
      );
    },
    [router]
  );

  const handleCollectionPress = useCallback(
    (collectionId: string, name: string) => {
      router.push(
        routeWithParams('/(focused)/notebook-detail', {
          notebookId: collectionId,
          title: name,
          kind: 'user',
        })
      );
    },
    [router]
  );

  // The hero composer starts a notebook-scoped chat (chat-conversation already
  // scopes to `notebookId` and auto-sends `initialMessage`). Route Austrian users
  // to their aggregate — Austria is a first-class locale.
  const handleHeroSend = useCallback(
    (text: string) => {
      // Intelligent routing: parse a named region (e.g. "was hat berlin … beschlossen")
      // and scope the notebook chat to that region's collection; otherwise the aggregate.
      const parsed = parseNotebookQuery(text);
      const aggregateId = locale === 'de-AT' ? 'oesterreich-notebook' : 'gruenerator-notebook';
      let notebookId = aggregateId;
      if (parsed.region) {
        const match = getVisibleNotebooks(locale).find(
          (nb) => nb.title.toLowerCase() === parsed.region?.toLowerCase()
        );
        if (match) notebookId = match.id;
      }
      router.push(
        routeWithParams('/(focused)/chat-conversation', {
          threadId: 'new',
          notebookId,
          initialMessage: text,
        })
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
    async (c: MobileNotebookCollection) => {
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
    (c: MobileNotebookCollection) => {
      const options = ['Öffnen', 'Teilen', 'Löschen', 'Abbrechen'];
      showActionSheetWithOptions(
        { title: c.name, options, destructiveButtonIndex: 2, cancelButtonIndex: 3 },
        (i) => {
          if (i === 0) handleCollectionPress(c.id, c.name);
          else if (i === 1) void handleShareCollection(c);
          else if (i === 2) handleDeleteCollection(c.id, c.name);
        }
      );
    },
    [
      showActionSheetWithOptions,
      handleCollectionPress,
      handleShareCollection,
      handleDeleteCollection,
    ]
  );

  return (
    <ScreenScaffold title="Wissen" backdrop={<NotebookGradientBackground />}>
      <GestureDetector gesture={swipe}>
        <View style={styles.container}>
          <ScrollView
            style={styles.container}
            contentContainerStyle={[gridColumn, styles.scrollContent]}
            keyboardShouldPersistTaps="handled"
          >
            <View>
              <NotebookSection
                title="Favoriten"
                notebooks={favouriteNotebooks}
                onNotebookPress={handleNotebookPress}
                onNotebookLongPress={handleToggleFavourite}
              />
              <NotebookSection
                title="Bundesebene"
                notebooks={bundesebene}
                onNotebookPress={handleNotebookPress}
                onNotebookLongPress={handleToggleFavourite}
              />
              <NotebookSection
                title="Landesebene"
                notebooks={landesebene}
                onNotebookPress={handleNotebookPress}
                onNotebookLongPress={handleToggleFavourite}
              />
              <NotebookSection
                title="Weitere"
                notebooks={weitere}
                onNotebookPress={handleNotebookPress}
                onNotebookLongPress={handleToggleFavourite}
              />
              <NotebookSection
                title="Österreich"
                notebooks={oesterreich}
                onNotebookPress={handleNotebookPress}
                onNotebookLongPress={handleToggleFavourite}
              />

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>Meine Notebooks</Text>
                  <Pressable
                    onPress={() => setCreatorVisible(true)}
                    style={[styles.addButton, { backgroundColor: colors.primary[600] + '15' }]}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Notebook erstellen"
                  >
                    <Ionicons name="add" size={20} color={colors.primary[600]} />
                  </Pressable>
                </View>
                {isLoading ? (
                  <View style={styles.loadingPlaceholder}>
                    {[0, 1, 2].map((i) => (
                      <View
                        key={i}
                        style={[
                          styles.skeletonCard,
                          { backgroundColor: theme.surface, borderColor: theme.cardBorder },
                        ]}
                      />
                    ))}
                  </View>
                ) : collections.length === 0 ? (
                  <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                    Noch keine eigenen Notebooks.
                  </Text>
                ) : (
                  <View style={notebookGrid.container}>
                    {collections.map((c) => (
                      <NotebookCard
                        key={c.id}
                        icon="book"
                        title={c.name}
                        subtitle={collectionSubtitle(c)}
                        onPress={() => handleCollectionPress(c.id, c.name)}
                        onLongPress={() => handleCollectionActions(c)}
                        isProcessing={collectionIndexingState(c) === 'indexing'}
                        style={notebookGrid.item}
                      />
                    ))}
                  </View>
                )}
              </View>

              <CommunityNotebooksSection enabled={!!user} onOpen={handleCollectionPress} />
            </View>

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
                  bottom: insets.bottom + FLOATING_TAB_BAR_HEIGHT + spacing.small,
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                },
              ]}
            >
              <Ionicons name="search" size={24} color={fabTone.icon} />
            </Pressable>
          )}
        </View>
      </GestureDetector>
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
  // Horizontal margin comes from the content column; only the vertical rhythm
  // is this screen's own.
  scrollContent: {
    // The hero above the first section is gone, so the sections carry the top
    // spacing themselves — without this the first heading sits on the header.
    paddingTop: spacing.small,
    paddingBottom: spacing.xxlarge,
  },
  section: {
    marginBottom: spacing.large,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 17,
    marginBottom: spacing.small,
  },
  addButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...typography.bodySmall,
    textAlign: 'center',
    paddingVertical: spacing.large,
  },
  loadingPlaceholder: {
    gap: spacing.xsmall,
  },
  skeletonCard: {
    height: 44,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
  },
});

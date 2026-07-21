import { useActionSheet } from '@expo/react-native-action-sheet';
import { useAuth } from '@gruenerator/shared/hooks';
import { parseNotebookQuery } from '@gruenerator/shared/utils';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, useColorScheme, Pressable, Alert } from 'react-native';

import { BottomComposerBar } from '../../../components/common/BottomComposerBar';
import { NotebookGradientBackground } from '../../../components/common/NotebookGradientBackground';
import { ScreenScaffold } from '../../../components/navigation/ScreenScaffold';
import { CommunityNotebooksSection } from '../../../components/notebook/CommunityNotebooksSection';
import { NotebookCard, notebookGridStyles } from '../../../components/notebook/NotebookCard';
import { NotebookCreator } from '../../../components/notebook/NotebookCreator';
import { NotebookSection } from '../../../components/notebook/NotebookSection';
import { NotebooksHero } from '../../../components/notebook/NotebooksHero';
import {
  getMobileNotebooksByCategory,
  getVisibleNotebooks,
  type MobileNotebookEntry,
} from '../../../config/notebooksConfig';
import { useNotebookSharing } from '../../../hooks/notebook/useNotebookSharing';
import { useIsTablet } from '../../../hooks/useIsTablet';
import {
  useNotebookCollections,
  type MobileNotebookCollection,
} from '../../../hooks/useNotebookCollections';
import { useFavoritesStore } from '../../../stores/favoritesStore';
import { colors, spacing, typography, borderRadius, lightTheme, darkTheme } from '../../../theme';
import { routeWithParams } from '../../../types/routes';

/** "12 Dokumente · Beschreibung" line for a user's own notebook card. */
function collectionSubtitle(c: MobileNotebookCollection): string {
  const docs = `${c.document_count} Dokument${c.document_count === 1 ? '' : 'e'}`;
  return c.description ? `${docs} · ${c.description}` : docs;
}

export default function NotebooksScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const isTablet = useIsTablet();
  const [creatorVisible, setCreatorVisible] = useState(false);
  const { user } = useAuth();
  const locale: 'de-DE' | 'de-AT' = user?.locale === 'de-AT' ? 'de-AT' : 'de-DE';
  const { collections, isLoading, processingIds, createCollection, deleteCollection } =
    useNotebookCollections();
  const { showActionSheetWithOptions } = useActionSheet();
  const { listGroups, shareToGroup, getShareUrl } = useNotebookSharing();
  const { favouriteIds, load: loadFavourites, toggle: toggleFavourite } = useFavoritesStore();

  useEffect(() => {
    void loadFavourites();
  }, [loadFavourites]);

  const bundesebene = useMemo(() => getMobileNotebooksByCategory('bundesebene', locale), [locale]);
  const landesebene = useMemo(() => getMobileNotebooksByCategory('landesebene', locale), [locale]);
  const weitere = useMemo(() => getMobileNotebooksByCategory('weitere', locale), [locale]);
  const oesterreich = useMemo(() => getMobileNotebooksByCategory('oesterreich', locale), [locale]);

  const favouriteNotebooks = useMemo(
    () => getVisibleNotebooks(locale).filter((nb) => favouriteIds.includes(nb.id)),
    [locale, favouriteIds]
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
    <ScreenScaffold title="Notebooks" backdrop={<NotebookGradientBackground />}>
      <View style={styles.container}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <NotebooksHero />

            <NotebookSection
              title="Favoriten"
              notebooks={favouriteNotebooks}
              onNotebookPress={handleNotebookPress}
              onNotebookLongPress={(nb) => toggleFavourite(nb.id)}
            />
            <NotebookSection
              title="Bundesebene"
              notebooks={bundesebene}
              onNotebookPress={handleNotebookPress}
              onNotebookLongPress={(nb) => toggleFavourite(nb.id)}
            />
            <NotebookSection
              title="Landesebene"
              notebooks={landesebene}
              onNotebookPress={handleNotebookPress}
              onNotebookLongPress={(nb) => toggleFavourite(nb.id)}
            />
            <NotebookSection
              title="Weitere"
              notebooks={weitere}
              onNotebookPress={handleNotebookPress}
              onNotebookLongPress={(nb) => toggleFavourite(nb.id)}
            />
            <NotebookSection
              title="Österreich"
              notebooks={oesterreich}
              onNotebookPress={handleNotebookPress}
              onNotebookLongPress={(nb) => toggleFavourite(nb.id)}
            />

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Meine Notebooks</Text>
                <Pressable
                  onPress={() => setCreatorVisible(true)}
                  style={[styles.addButton, { backgroundColor: colors.primary[600] + '15' }]}
                  hitSlop={8}
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
                <View style={isTablet ? notebookGridStyles.grid : undefined}>
                  {collections.map((c) => (
                    <NotebookCard
                      key={c.id}
                      icon="book"
                      title={c.name}
                      subtitle={collectionSubtitle(c)}
                      onPress={() => handleCollectionPress(c.id, c.name)}
                      onLongPress={() => handleCollectionActions(c)}
                      isProcessing={processingIds.has(c.id)}
                      style={isTablet ? notebookGridStyles.item : undefined}
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

        <BottomComposerBar placeholder="Frage an alle Quellen…" onSend={handleHeroSend} />
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.medium,
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

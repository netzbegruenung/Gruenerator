import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useColorScheme,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NotebookCreator } from '../../../components/notebook/NotebookCreator';
import {
  getMobileNotebooksByCategory,
  getVisibleNotebooks,
  type MobileNotebookEntry,
} from '../../../config/notebooksConfig';
import { useNotebookCollections } from '../../../hooks/useNotebookCollections';
import { colors, spacing, typography, borderRadius, lightTheme, darkTheme } from '../../../theme';
import { routeWithParams } from '../../../types/routes';

function NotebookCard({
  icon,
  title,
  onPress,
  onLongPress,
  isProcessing,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  onPress: () => void;
  onLongPress?: () => void;
  isProcessing?: boolean;
}) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? theme.surface : theme.card,
          borderColor: theme.cardBorder,
        },
      ]}
    >
      <Ionicons name={icon} size={18} color={colors.primary[600]} />
      <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
        {title}
      </Text>
      {isProcessing ? (
        <ActivityIndicator size="small" color={colors.primary[600]} />
      ) : (
        <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
      )}
    </Pressable>
  );
}

function NotebookSection({
  title,
  notebooks,
  onNotebookPress,
}: {
  title: string;
  notebooks: MobileNotebookEntry[];
  onNotebookPress: (notebook: MobileNotebookEntry) => void;
}) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  if (notebooks.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <View style={styles.grid}>
        {notebooks.map((notebook) => (
          <View key={notebook.id} style={styles.gridItem}>
            <NotebookCard
              icon={notebook.icon}
              title={notebook.title}
              onPress={() => onNotebookPress(notebook)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

function ToolCard({
  icon,
  title,
  description,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
}) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.toolCard,
        {
          backgroundColor: pressed ? theme.surface : theme.card,
          borderColor: theme.cardBorder,
        },
      ]}
    >
      <View style={[styles.toolIcon, { backgroundColor: colors.primary[600] + '15' }]}>
        <Ionicons name={icon} size={18} color={colors.primary[600]} />
      </View>
      <View style={styles.toolContent}>
        <Text style={[styles.toolTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.toolDescription, { color: theme.textSecondary }]} numberOfLines={1}>
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

export default function NotebooksScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const [creatorVisible, setCreatorVisible] = useState(false);
  const { collections, isLoading, processingIds, createCollection, deleteCollection } =
    useNotebookCollections();

  const bundesebene = useMemo(() => getMobileNotebooksByCategory('bundesebene'), []);
  const landesebene = useMemo(() => getMobileNotebooksByCategory('landesebene'), []);
  const weitere = useMemo(() => getMobileNotebooksByCategory('weitere'), []);

  const filteredResults = useMemo(() => {
    if (!searchQuery) return null;
    const q = searchQuery.toLowerCase();
    return getVisibleNotebooks().filter(
      (nb) => nb.title.toLowerCase().includes(q) || nb.description.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const filteredCollections = useMemo(() => {
    if (!searchQuery) return collections;
    const q = searchQuery.toLowerCase();
    return collections.filter((c) => c.name.toLowerCase().includes(q));
  }, [searchQuery, collections]);

  const handleNotebookPress = (notebook: MobileNotebookEntry) => {
    router.push(
      routeWithParams('/(focused)/chat-conversation', {
        threadId: 'new',
        notebookId: notebook.id,
      })
    );
  };

  const handleCollectionPress = (collectionId: string) => {
    router.push(
      routeWithParams('/(focused)/chat-conversation', {
        threadId: 'new',
        notebookId: collectionId,
      })
    );
  };

  const toggleSearch = useCallback(() => {
    if (searchOpen) {
      setSearchQuery('');
      setSearchOpen(false);
    } else {
      setSearchOpen(true);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [searchOpen]);

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
    {searchOpen && (
      <View style={[styles.searchBar, { backgroundColor: theme.background, borderColor: theme.cardBorder }]}>
        <Ionicons name="search" size={18} color={theme.textSecondary} />
        <TextInput
          ref={searchInputRef}
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Notebooks durchsuchen..."
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
        />
        <Pressable onPress={toggleSearch} hitSlop={8}>
          <Ionicons name="close" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>
    )}
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >

      {filteredResults ? (
        <View>
          {filteredResults.length > 0 && (
            <NotebookSection
              title="Notebooks"
              notebooks={filteredResults}
              onNotebookPress={handleNotebookPress}
            />
          )}
          {filteredCollections.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Meine Notebooks</Text>
              {filteredCollections.map((c) => (
                <NotebookCard
                  key={c.id}
                  icon="book"
                  title={c.name}
                  onPress={() => handleCollectionPress(c.id)}
                  isProcessing={processingIds.has(c.id)}
                />
              ))}
            </View>
          )}
          {filteredResults.length === 0 && filteredCollections.length === 0 && (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Keine Ergebnisse für &ldquo;{searchQuery}&rdquo;
            </Text>
          )}
        </View>
      ) : (
        <View>
          <NotebookSection
            title="Bundesebene"
            notebooks={bundesebene}
            onNotebookPress={handleNotebookPress}
          />
          <NotebookSection
            title="Landesebene"
            notebooks={landesebene}
            onNotebookPress={handleNotebookPress}
          />
          <NotebookSection
            title="Weitere"
            notebooks={weitere}
            onNotebookPress={handleNotebookPress}
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
                    style={[styles.skeletonCard, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}
                  />
                ))}
              </View>
            ) : collections.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                Noch keine eigenen Notebooks.
              </Text>
            ) : (
              collections.map((c) => (
                <NotebookCard
                  key={c.id}
                  icon="book"
                  title={c.name}
                  onPress={() => handleCollectionPress(c.id)}
                  onLongPress={() => handleDeleteCollection(c.id, c.name)}
                  isProcessing={processingIds.has(c.id)}
                />
              ))
            )}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Tools</Text>
        <View style={styles.toolGrid}>
          <View style={styles.gridItem}>
            <ToolCard
              icon="search"
              title="Suche"
              description="Webrecherche mit KI"
              onPress={() => router.push('/(tabs)/(recherche)/suche' as Href)}
            />
          </View>
          <View style={styles.gridItem}>
            <ToolCard
              icon="document-text"
              title="Recherche"
              description="Dokumentensuche"
              onPress={() => router.push('/(tabs)/(recherche)/research' as Href)}
            />
          </View>
        </View>
      </View>

      <NotebookCreator
        visible={creatorVisible}
        onClose={() => setCreatorVisible(false)}
        createCollection={createCollection}
      />
    </ScrollView>
    {!searchOpen && (
      <Pressable
        onPress={toggleSearch}
        style={[styles.fab, { backgroundColor: colors.primary[600] }]}
      >
        <Ionicons name="search" size={22} color={colors.white} />
      </Pressable>
    )}
    </SafeAreaView>
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    gap: spacing.small,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: spacing.xxsmall,
  },
  fab: {
    position: 'absolute',
    right: spacing.medium,
    bottom: spacing.medium,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.27,
    shadowRadius: 4.65,
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
    ...typography.bodyBold,
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xsmall,
  },
  gridItem: {
    width: '48.5%',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    gap: spacing.xsmall,
    marginBottom: spacing.xxsmall,
  },
  cardTitle: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
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
  toolGrid: {
    flexDirection: 'row',
    gap: spacing.xsmall,
  },
  toolCard: {
    padding: spacing.medium,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    gap: spacing.small,
  },
  toolIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolContent: {
    gap: 2,
  },
  toolTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  toolDescription: {
    fontSize: 11,
  },
});

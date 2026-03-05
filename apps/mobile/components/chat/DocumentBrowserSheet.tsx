import { Ionicons } from '@expo/vector-icons';
import { useFileMentionData, registerDocumentSlug, documentToSlug } from '@gruenerator/chat';
import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  FlatList,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';

import { colors, spacing, borderRadius } from '../../theme';

import type { Theme } from '../../theme/colors';
import type { DocumentSearchResult, NotebookCollectionItem } from '@gruenerator/chat';

interface DocumentBrowserSheetProps {
  visible: boolean;
  theme: Theme;
  onSelect: (slug: string) => void;
  onDismiss: () => void;
}

type BrowserLevel = { type: 'root' } | { type: 'collection'; id: string; name: string };

export function DocumentBrowserSheet({
  visible,
  theme,
  onSelect,
  onDismiss,
}: DocumentBrowserSheetProps) {
  const {
    collections,
    documents,
    texts,
    loadingCollections,
    loadingContent,
    fetchAll,
    searchInCollection,
  } = useFileMentionData();

  const [level, setLevel] = useState<BrowserLevel>({ type: 'root' });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DocumentSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (visible) {
      fetchAll();
      setLevel({ type: 'root' });
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [visible, fetchAll]);

  const handleSearch = useCallback(
    async (query: string) => {
      setSearchQuery(query);
      if (level.type !== 'collection' || query.length < 2) {
        setSearchResults([]);
        return;
      }
      setSearching(true);
      const results = await searchInCollection(level.id, query);
      setSearchResults(results);
      setSearching(false);
    },
    [level, searchInCollection]
  );

  const handleDocSelect = useCallback(
    (
      doc: { id: string; title: string; sourceType?: string },
      collectionId?: string,
      collectionName?: string
    ) => {
      const slug = documentToSlug(doc.title);
      registerDocumentSlug(slug, {
        documentId: doc.id,
        documentTitle: doc.title,
        collectionId: collectionId ?? '',
        collectionName: collectionName ?? '',
        slug,
        sourceType: (doc.sourceType as 'notebook' | 'document' | 'text') ?? 'document',
      });
      onSelect(slug);
    },
    [onSelect]
  );

  if (!visible) return null;

  const isLoading = loadingCollections || loadingContent;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <View />
      </Pressable>
      <View
        style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}
      >
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          {level.type === 'collection' ? (
            <Pressable
              onPress={() => {
                setLevel({ type: 'root' });
                setSearchQuery('');
                setSearchResults([]);
              }}
              style={styles.backButton}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={22} color={theme.text} />
              <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
                {level.name}
              </Text>
            </Pressable>
          ) : (
            <Text style={[styles.headerTitle, { color: theme.text }]}>Dokumente</Text>
          )}
          <Pressable onPress={onDismiss} hitSlop={8}>
            <Ionicons name="close" size={22} color={theme.textSecondary} />
          </Pressable>
        </View>

        {level.type === 'collection' && (
          <View style={[styles.searchRow, { backgroundColor: theme.surface }]}>
            <Ionicons name="search" size={16} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Suchen..."
              placeholderTextColor={theme.textSecondary}
              value={searchQuery}
              onChangeText={handleSearch}
              autoFocus
            />
            {searching && <ActivityIndicator size="small" color={colors.primary[600]} />}
          </View>
        )}

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.primary[600]} />
          </View>
        ) : level.type === 'root' ? (
          <RootLevel
            collections={collections}
            documents={documents}
            texts={texts}
            theme={theme}
            onSelectCollection={(c) => setLevel({ type: 'collection', id: c.id, name: c.name })}
            onSelectDoc={handleDocSelect}
          />
        ) : searchQuery.length >= 2 ? (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.documentId}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <DocRow
                title={item.title}
                subtitle={item.excerpt}
                theme={theme}
                onPress={() =>
                  handleDocSelect(
                    { id: item.documentId, title: item.title, sourceType: 'document' },
                    level.id,
                    level.name
                  )
                }
              />
            )}
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                Keine Ergebnisse
              </Text>
            }
          />
        ) : (
          <CollectionDocs
            collection={collections.find((c) => c.id === level.id)}
            theme={theme}
            onSelect={(doc) => handleDocSelect(doc, level.id, level.name)}
          />
        )}
      </View>
    </Modal>
  );
}

function RootLevel({
  collections,
  documents,
  texts,
  theme,
  onSelectCollection,
  onSelectDoc,
}: {
  collections: NotebookCollectionItem[];
  documents: { id: string; title: string; sourceType?: string }[];
  texts: { id: string; title: string }[];
  theme: Theme;
  onSelectCollection: (c: NotebookCollectionItem) => void;
  onSelectDoc: (doc: { id: string; title: string; sourceType?: string }) => void;
}) {
  return (
    <FlatList
      data={[]}
      keyboardShouldPersistTaps="handled"
      renderItem={null}
      ListHeaderComponent={
        <>
          {collections.length > 0 && (
            <>
              <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>
                Notizbücher
              </Text>
              {collections.map((c) => (
                <Pressable
                  key={c.id}
                  style={({ pressed }) => [
                    styles.row,
                    { backgroundColor: pressed ? theme.surface : 'transparent' },
                  ]}
                  onPress={() => onSelectCollection(c)}
                >
                  <Ionicons name="folder-outline" size={20} color={colors.primary[600]} />
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: theme.text }]}>{c.name}</Text>
                  </View>
                  <Text style={[styles.badge, { color: theme.textSecondary }]}>
                    {c.documentCount}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
                </Pressable>
              ))}
            </>
          )}

          {documents.length > 0 && (
            <>
              <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>
                Letzte Dokumente
              </Text>
              {documents.slice(0, 10).map((doc) => (
                <DocRow
                  key={doc.id}
                  title={doc.title}
                  theme={theme}
                  onPress={() => onSelectDoc(doc)}
                />
              ))}
            </>
          )}

          {texts.length > 0 && (
            <>
              <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>
                Gespeicherte Texte
              </Text>
              {texts.slice(0, 10).map((t) => (
                <DocRow
                  key={t.id}
                  title={t.title}
                  theme={theme}
                  onPress={() => onSelectDoc({ id: t.id, title: t.title, sourceType: 'text' })}
                />
              ))}
            </>
          )}
        </>
      }
    />
  );
}

function CollectionDocs({
  collection,
  theme,
  onSelect,
}: {
  collection: NotebookCollectionItem | undefined;
  theme: Theme;
  onSelect: (doc: { id: string; title: string; sourceType?: string }) => void;
}) {
  if (!collection || !collection.documents?.length) {
    return <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Keine Dokumente</Text>;
  }

  return (
    <FlatList
      data={collection.documents}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => (
        <DocRow
          title={item.title}
          theme={theme}
          onPress={() => onSelect({ id: item.id, title: item.title, sourceType: item.sourceType })}
        />
      )}
    />
  );
}

function DocRow({
  title,
  subtitle,
  theme,
  onPress,
}: {
  title: string;
  subtitle?: string;
  theme: Theme;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.surface : 'transparent' },
      ]}
      onPress={onPress}
    >
      <Ionicons name="document-text-outline" size={18} color={theme.textSecondary} />
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    maxHeight: '80%',
    minHeight: 300,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.xxsmall,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.medium,
    marginVertical: spacing.xsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
    borderRadius: borderRadius.medium,
    gap: spacing.xsmall,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: spacing.xxsmall,
  },
  loading: {
    paddingVertical: spacing.xlarge,
    alignItems: 'center',
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.small,
    paddingBottom: spacing.xxsmall,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.xsmall,
    gap: spacing.small,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  rowSubtitle: {
    fontSize: 13,
  },
  badge: {
    fontSize: 13,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: spacing.xlarge,
    fontSize: 14,
  },
});

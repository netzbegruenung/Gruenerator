import { templates, type DocumentTemplate } from '@gruenerator/docs/templates';
import { useAuth } from '@gruenerator/shared/hooks';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useCallback, useState, useMemo, type ReactNode } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  RefreshControl,
  Alert,
  TextInput,
  useColorScheme,
} from 'react-native';

import { useIsTablet } from '../../hooks/useIsTablet';
import { useDocsStore } from '../../stores/docsStore';
import { lightTheme, darkTheme, colors } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';
import { DocPreview } from '../common/DocPreview';
import { Fab } from '../common/Fab';

import { AIDocumentCreatorSheet } from './AIDocumentCreatorSheet';
import { NativeShareModal } from './NativeShareModal';

const TEMPLATE_ICONS: Record<string, IoniconsIconName> = {
  blank: 'document-outline',
  antrag: 'clipboard-outline',
  pressemitteilung: 'newspaper-outline',
  protokoll: 'create-outline',
  notizen: 'bulb-outline',
  redaktionsplan: 'calendar-outline',
  checkliste: 'checkbox-outline',
  einladung: 'mail-outline',
  tabelle: 'grid-outline',
};

/**
 * Documents body without the surrounding ScreenScaffold, so it can render both
 * standalone (the /(tabs)/(docs) route) and inside the merged Arbeiten tab.
 *
 * `header` scrolls above the document grid (the Arbeiten tab feeds its Werkzeuge
 * grid in here so tools + docs read as one page). `showSearch` hides the doc
 * search bar in contexts where it would be redundant.
 */
export function DocumentsView({
  header,
  showSearch = true,
  showFab = true,
}: {
  header?: ReactNode;
  showSearch?: boolean;
  showFab?: boolean;
} = {}) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { user } = useAuth();
  const gridCols = useIsTablet() ? 3 : 2;

  const {
    documents,
    isLoading,
    error,
    fetchDocuments,
    createDocument,
    generateDocument,
    deleteDocument,
  } = useDocsStore();
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAICreator, setShowAICreator] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeDoc, setActiveDoc] = useState<{ id: string; title: string } | null>(null);

  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter((doc) => (doc.title || 'Unbenannt').toLowerCase().includes(q));
  }, [documents, searchQuery]);

  const { prefetchRecentDocs } = useDocsStore();

  useEffect(() => {
    if (user) {
      void fetchDocuments();
      void prefetchRecentDocs();
    }
  }, [fetchDocuments, prefetchRecentDocs, user]);

  const handleRefresh = useCallback(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  const handleSelectTemplate = async (template: DocumentTemplate) => {
    if (isCreating) return;
    setIsCreating(true);
    setShowTemplates(false);
    try {
      const doc = await createDocument(
        template.defaultTitle,
        template.id === 'blank' ? undefined : template.id
      );
      if (doc) {
        router.push({ pathname: '/(fullscreen)/doc-editor', params: { id: doc.id } });
      }
    } catch {
      Alert.alert('Fehler', 'Dokument konnte nicht erstellt werden.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleGenerate = async (description: string) => {
    if (isCreating) return;
    setIsCreating(true);
    setShowAICreator(false);
    try {
      const doc = await generateDocument(description);
      if (doc) {
        router.push({ pathname: '/(fullscreen)/doc-editor', params: { id: doc.id } });
      }
    } catch {
      Alert.alert('Fehler', 'Dokument konnte nicht generiert werden.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenActions = (id: string, title: string) => {
    setActiveDoc({ id, title: title || 'Unbenannt' });
  };

  const handleDelete = (id: string, title: string) => {
    setActiveDoc(null);
    Alert.alert('Dokument löschen', `Möchtest du "${title}" wirklich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => void deleteDocument(id),
      },
    ]);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const renderDocument = ({
    item,
  }: {
    item: { id: string; title: string; updated_at: string; content?: string };
  }) => (
    <TouchableOpacity
      style={[styles.gridCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
      onPress={() => {
        router.push({ pathname: '/(fullscreen)/doc-editor', params: { id: item.id } });
      }}
      activeOpacity={0.7}
    >
      {item.content ? (
        <DocPreview content={item.content} style={styles.cardThumbnailDoc} />
      ) : (
        <View style={[styles.cardThumbnail, { backgroundColor: theme.surface }]}>
          <Ionicons name="document-text" size={36} color={colors.grey[300]} />
        </View>
      )}
      <View style={styles.cardInfoRow}>
        <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
          {item.title || 'Unbenannt'}
        </Text>
        <TouchableOpacity
          onPress={() => handleOpenActions(item.id, item.title)}
          style={styles.cardMenuButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="ellipsis-vertical" size={16} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>
      <Text style={[styles.cardDate, { color: theme.textSecondary }]}>
        {formatDate(item.updated_at)}
      </Text>
    </TouchableOpacity>
  );

  const renderListItem = ({
    item,
  }: {
    item: { id: string; title: string; updated_at: string };
  }) => (
    <TouchableOpacity
      style={[styles.listCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
      onPress={() => router.push({ pathname: '/(fullscreen)/doc-editor', params: { id: item.id } })}
      activeOpacity={0.7}
    >
      <Ionicons name="document-text" size={24} color={colors.grey[300]} style={styles.listIcon} />
      <View style={styles.listInfo}>
        <Text style={[styles.listTitle, { color: theme.text }]} numberOfLines={1}>
          {item.title || 'Unbenannt'}
        </Text>
        <Text style={[styles.listDate, { color: theme.textSecondary }]}>
          {formatDate(item.updated_at)}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => handleOpenActions(item.id, item.title)}
        style={styles.cardMenuButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="ellipsis-vertical" size={16} color={theme.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="document-text-outline" size={64} color={theme.textSecondary} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>Keine Dokumente</Text>
      <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        Erstelle ein neues Dokument, um loszulegen.
      </Text>
    </View>
  );

  if (error) {
    return (
      <View style={styles.fill}>
        {header ? <View style={styles.headerPad}>{header}</View> : null}
        <View style={styles.errorState}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.error[500]} />
          <Text style={[styles.errorTitle, { color: theme.text }]}>Fehler beim Laden</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary[600] }]}
            onPress={handleRefresh}
          >
            <Text style={styles.retryButtonText}>Erneut versuchen</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

      {/* Top Bar */}
      {showSearch && (
        <View style={styles.topBar}>
          <View
            style={[
              styles.searchBar,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Ionicons
              name="search"
              size={18}
              color={theme.textSecondary}
              style={styles.searchIcon}
            />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="In Dokumenten suchen"
              placeholderTextColor={theme.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClear}>
                <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            onPress={() => setViewMode((v) => (v === 'grid' ? 'list' : 'grid'))}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={viewMode === 'grid' ? 'list-outline' : 'grid-outline'}
              size={20}
              color={theme.textSecondary}
            />
          </TouchableOpacity>
        </View>
      )}

      {/* Document Grid */}
      {isLoading && documents.length === 0 ? (
        <View style={styles.gridContent}>
          {header}
          <View style={styles.gridRow}>
            {[0, 1].map((i) => (
              <View
                key={i}
                style={[
                  styles.gridCard,
                  { backgroundColor: theme.card, borderColor: theme.cardBorder },
                ]}
              >
                <View style={[styles.cardThumbnail, { backgroundColor: theme.surface }]} />
                <View style={{ paddingHorizontal: 10, paddingVertical: 10, gap: 6 }}>
                  <View
                    style={{
                      height: 12,
                      width: '75%',
                      borderRadius: 4,
                      backgroundColor: theme.surface,
                    }}
                  />
                  <View
                    style={{
                      height: 10,
                      width: '40%',
                      borderRadius: 4,
                      backgroundColor: theme.surface,
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
          <View style={styles.gridRow}>
            {[2, 3].map((i) => (
              <View
                key={i}
                style={[
                  styles.gridCard,
                  { backgroundColor: theme.card, borderColor: theme.cardBorder },
                ]}
              >
                <View style={[styles.cardThumbnail, { backgroundColor: theme.surface }]} />
                <View style={{ paddingHorizontal: 10, paddingVertical: 10, gap: 6 }}>
                  <View
                    style={{
                      height: 12,
                      width: '60%',
                      borderRadius: 4,
                      backgroundColor: theme.surface,
                    }}
                  />
                  <View
                    style={{
                      height: 10,
                      width: '35%',
                      borderRadius: 4,
                      backgroundColor: theme.surface,
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : filteredDocuments.length === 0 && searchQuery.trim() ? (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Keine Ergebnisse</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            Keine Dokumente für „{searchQuery}“ gefunden.
          </Text>
        </View>
      ) : viewMode === 'grid' ? (
        <FlatList
          key={`grid-${gridCols}`}
          data={filteredDocuments}
          keyExtractor={(item) => item.id}
          renderItem={renderDocument}
          numColumns={gridCols}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={[
            styles.gridContent,
            filteredDocuments.length === 0 && styles.listEmpty,
          ]}
          ListHeaderComponent={header ? <View>{header}</View> : undefined}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={handleRefresh}
              tintColor={colors.primary[600]}
              colors={[colors.primary[600]]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          key="list"
          data={filteredDocuments}
          keyExtractor={(item) => item.id}
          renderItem={renderListItem}
          contentContainerStyle={[
            styles.listContent,
            filteredDocuments.length === 0 && styles.listEmpty,
          ]}
          ListHeaderComponent={header ? <View>{header}</View> : undefined}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={handleRefresh}
              tintColor={colors.primary[600]}
              colors={[colors.primary[600]]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {showFab && (
        <Fab
          icon="add"
          onPress={() => setShowTemplates(true)}
          loading={isCreating}
          accessibilityLabel="Neues Dokument"
        />
      )}

      {/* Template selection bottom sheet */}
      <BottomSheet visible={showTemplates} onClose={() => setShowTemplates(false)}>
        <Text style={[styles.bottomSheetTitle, { color: theme.text }]}>Neues Dokument</Text>
        <TouchableOpacity
          style={[styles.templateRow, { borderBottomColor: theme.border }]}
          onPress={() => {
            setShowTemplates(false);
            setShowAICreator(true);
          }}
          activeOpacity={0.7}
        >
          <View
            style={[
              styles.templateIconTile,
              { backgroundColor: theme.card, borderColor: theme.cardBorder },
            ]}
          >
            <Ionicons name="sparkles-outline" size={20} color={colors.secondary[600]} />
          </View>
          <View style={styles.templateInfo}>
            <Text style={[styles.templateName, { color: theme.text }]}>Mit KI erstellen</Text>
            <Text style={[styles.templateDescription, { color: theme.textSecondary }]}>
              Aus einer Beschreibung generieren
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
        </TouchableOpacity>
        {templates.map((template) => (
          <TouchableOpacity
            key={template.id}
            style={[styles.templateRow, { borderBottomColor: theme.border }]}
            onPress={() => handleSelectTemplate(template)}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.templateIconTile,
                { backgroundColor: theme.card, borderColor: theme.cardBorder },
              ]}
            >
              <Ionicons
                name={TEMPLATE_ICONS[template.id] ?? 'document-outline'}
                size={20}
                color={colors.secondary[600]}
              />
            </View>
            <View style={styles.templateInfo}>
              <Text style={[styles.templateName, { color: theme.text }]}>{template.name}</Text>
              <Text style={[styles.templateDescription, { color: theme.textSecondary }]}>
                {template.description}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
          </TouchableOpacity>
        ))}
      </BottomSheet>

      {/* AI document generation sheet */}
      <AIDocumentCreatorSheet
        visible={showAICreator}
        onClose={() => setShowAICreator(false)}
        onGenerate={handleGenerate}
        isLoading={isCreating}
      />

      {/* Document share/actions modal — reuses the same share modal as the editor */}
      {activeDoc && (
        <NativeShareModal
          visible={true}
          onClose={() => setActiveDoc(null)}
          documentId={activeDoc.id}
          userDisplayName={user?.display_name ?? undefined}
          isOwner={true}
          onDelete={() => handleDelete(activeDoc.id, activeDoc.title)}
        />
      )}
    </>
  );
}

const CARD_GAP = 16;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  headerPad: { paddingHorizontal: 12, paddingTop: 8 },

  // Top Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 14,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  searchClear: {
    padding: 4,
    marginLeft: 4,
  },

  // Grid
  gridContent: {
    paddingTop: 8,
    paddingHorizontal: 12,
    paddingBottom: 96,
  },
  gridRow: {
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },
  listEmpty: {
    flex: 1,
  },
  gridCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardThumbnail: {
    aspectRatio: 3 / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardThumbnailDoc: {
    aspectRatio: 3 / 2,
  },
  cardInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  cardTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
  cardMenuButton: {
    padding: 4,
    marginLeft: 4,
    flexShrink: 0,
  },
  cardDate: {
    fontSize: 11,
    paddingHorizontal: 10,
    paddingTop: 2,
    paddingBottom: 10,
    marginLeft: 0,
  },

  // List view
  listContent: {
    paddingTop: 8,
    paddingHorizontal: 12,
    paddingBottom: 96,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  listIcon: {
    marginRight: 12,
  },
  listInfo: {
    flex: 1,
    marginRight: 8,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  listDate: {
    fontSize: 12,
  },

  // Empty / Loading / Error
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontFamily: 'Raleway_600SemiBold',
    fontSize: 18,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontFamily: 'Raleway_600SemiBold',
    fontSize: 18,
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },

  bottomSheetTitle: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 20,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  templateIconTile: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateInfo: {
    flex: 1,
    marginRight: 8,
  },
  templateName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  templateDescription: {
    fontSize: 13,
  },
});

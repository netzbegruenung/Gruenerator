import { type DocumentTemplate } from '@gruenerator/docs/templates';
import { useAuth } from '@gruenerator/shared/hooks';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useCallback, useState, useMemo } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  RefreshControl,
  Alert,
  Platform,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsTablet } from '../../hooks/useIsTablet';
import { useDocsStore } from '../../stores/docsStore';
import { lightTheme, darkTheme, colors, spacing, BODY_FONT } from '../../theme';
import { FLOATING_TAB_BAR_HEIGHT } from '../../theme/layout';
import { officeTypeColor } from '../../theme/officeColors';
import { getSurfaceFab } from '../../theme/toolTheme';
import { DocPreview } from '../common/DocPreview';
import { Fab } from '../common/Fab';
import {
  isDocFamily,
  kindFromSubtype,
  officeIconFor,
  pushOfficeItem,
  type OfficeItem,
} from '../office/officeItem';

import { CreateDocSheet } from './CreateDocSheet';
import { NativeShareModal } from './NativeShareModal';

/**
 * Documents body without the surrounding ScreenScaffold — the Arbeiten tab's
 * content.
 *
 * Creating and finding are one surface, as on web (`features/docs/DocsComposer`):
 * the FAB opens a sheet whose single input either generates a document from the
 * text or jumps to a document/template matching it. Templates are never
 * enumerated up front — they sit behind one "Vorlagen" row until asked for.
 */
export function DocumentsView({
  extraItems,
}: {
  /**
   * Non-doc Office items (boards + canvas) merged into the list — they have their
   * own endpoints and are fetched by the screen, not by the docs store.
   */
  extraItems?: OfficeItem[];
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
    clearError,
  } = useDocsStore();
  const insets = useSafeAreaInsets();
  const fabTones = getSurfaceFab('arbeiten', colorScheme === 'dark');
  // The Android tab bar is an absolutely positioned capsule, so nothing reserves
  // space for it — the FABs and the list's bottom padding clear it themselves.
  // On iOS the native tab bar is already inside insets.bottom.
  const fabBottom =
    Platform.OS === 'ios'
      ? insets.bottom + spacing.medium
      : insets.bottom + FLOATING_TAB_BAR_HEIGHT + spacing.small;
  const [createOpen, setCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeDoc, setActiveDoc] = useState<{ id: string; title: string } | null>(null);

  // Normalize docs (+ merged boards/canvas) into one type-tagged list, newest
  // first. Sheets/presentations already arrive in `documents` via /docs — the
  // subtype decides which viewer they open.
  const officeItems = useMemo<OfficeItem[]>(() => {
    const docItems: OfficeItem[] = documents.map((doc) => ({
      id: doc.id,
      title: doc.title,
      updatedAt: doc.updated_at,
      kind: kindFromSubtype(doc.document_subtype),
      content: doc.content,
    }));
    const merged = extraItems ? [...docItems, ...extraItems] : docItems;
    return merged.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [documents, extraItems]);

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
    setCreateOpen(false);
    try {
      const doc = await createDocument(
        template.defaultTitle,
        template.id === 'blank' ? undefined : template.id
      );
      if (doc) {
        router.push({ pathname: '/(fullscreen)/doc-editor', params: { id: doc.id } });
      } else {
        // The store swallows the failure into `error`; clearing it keeps a failed
        // create from replacing the whole list with the load-error screen.
        clearError();
        Alert.alert('Fehler', 'Dokument konnte nicht erstellt werden.');
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
    setCreateOpen(false);
    try {
      const doc = await generateDocument(description);
      if (doc) {
        router.push({ pathname: '/(fullscreen)/doc-editor', params: { id: doc.id } });
      } else {
        clearError();
        Alert.alert('Fehler', 'Dokument konnte nicht generiert werden.');
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

  const renderDocument = ({ item }: { item: OfficeItem }) => {
    const typeColor = officeTypeColor(item.kind, colorScheme === 'dark');
    const showActions = isDocFamily(item.kind);
    return (
      <TouchableOpacity
        style={[styles.gridCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
        onPress={() => pushOfficeItem(router, item)}
        activeOpacity={0.7}
      >
        {item.kind === 'canvas' && item.thumbnailUrl ? (
          <Image
            source={{ uri: item.thumbnailUrl }}
            style={styles.cardThumbnail}
            contentFit="cover"
            transition={150}
          />
        ) : item.kind === 'doc' && item.content ? (
          <DocPreview content={item.content} style={styles.cardThumbnailDoc} />
        ) : (
          <View style={[styles.cardThumbnail, { backgroundColor: typeColor.tile }]}>
            <Ionicons name={officeIconFor(item.kind)} size={36} color={typeColor.icon} />
          </View>
        )}
        <View style={styles.cardInfoRow}>
          <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
            {item.title || 'Unbenannt'}
          </Text>
          {showActions && (
            <TouchableOpacity
              onPress={() => handleOpenActions(item.id, item.title)}
              style={styles.cardMenuButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="ellipsis-vertical" size={16} color={theme.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={[styles.cardDate, { color: theme.textSecondary }]}>
          {formatDate(item.updatedAt)}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderListItem = ({ item }: { item: OfficeItem }) => {
    const typeColor = officeTypeColor(item.kind, colorScheme === 'dark');
    const showActions = isDocFamily(item.kind);
    return (
      <TouchableOpacity
        style={[styles.listCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
        onPress={() => pushOfficeItem(router, item)}
        activeOpacity={0.7}
      >
        <View style={[styles.listIconTile, { backgroundColor: typeColor.tile }]}>
          <Ionicons name={officeIconFor(item.kind)} size={18} color={typeColor.icon} />
        </View>
        <View style={styles.listInfo}>
          <Text style={[styles.listTitle, { color: theme.text }]} numberOfLines={1}>
            {item.title || 'Unbenannt'}
          </Text>
          <Text style={[styles.listDate, { color: theme.textSecondary }]}>
            {formatDate(item.updatedAt)}
          </Text>
        </View>
        {showActions && (
          <TouchableOpacity
            onPress={() => handleOpenActions(item.id, item.title)}
            style={styles.cardMenuButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="ellipsis-vertical" size={16} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="document-text-outline" size={64} color={theme.textSecondary} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>Keine Dokumente</Text>
      <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        Erstelle ein neues Dokument, um loszulegen.
      </Text>
    </View>
  );

  // Only a failed *load* takes over the screen; with items on hand the list wins
  // and the failure is reported by the Alert that raised it.
  if (error && officeItems.length === 0) {
    return (
      <View style={styles.fill}>
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

      {/* Search moved into the create sheet (web parity), so the only chrome left
          above the list is the grid/list switch. */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => setViewMode((v) => (v === 'grid' ? 'list' : 'grid'))}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={viewMode === 'grid' ? 'Als Liste anzeigen' : 'Als Raster anzeigen'}
        >
          <Ionicons
            name={viewMode === 'grid' ? 'list-outline' : 'grid-outline'}
            size={20}
            color={theme.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {/* Document Grid */}
      {isLoading && officeItems.length === 0 ? (
        <View style={styles.gridContent}>
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
      ) : viewMode === 'grid' ? (
        <FlatList
          key={`grid-${gridCols}`}
          data={officeItems}
          keyExtractor={(item) => item.id}
          renderItem={renderDocument}
          numColumns={gridCols}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={[
            styles.gridContent,
            { paddingBottom: fabBottom + 88 },
            officeItems.length === 0 && styles.listEmpty,
          ]}
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
          data={officeItems}
          keyExtractor={(item) => item.id}
          renderItem={renderListItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: fabBottom + 88 },
            officeItems.length === 0 && styles.listEmpty,
          ]}
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

      <Fab
        icon="add"
        onPress={() => setCreateOpen(true)}
        loading={isCreating}
        accessibilityLabel="Erstellen oder finden"
        color={fabTones.icon}
        style={{ backgroundColor: fabTones.background, bottom: fabBottom }}
      />

      <CreateDocSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        items={officeItems}
        isCreating={isCreating}
        onGenerate={(description) => void handleGenerate(description)}
        onSelectTemplate={(template) => void handleSelectTemplate(template)}
        onOpenItem={(item) => {
          setCreateOpen(false);
          pushOfficeItem(router, item);
        }}
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

  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  // Grid
  gridContent: {
    paddingTop: 16,
    paddingHorizontal: 16,
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
    fontFamily: BODY_FONT,
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
    fontFamily: BODY_FONT,
    fontSize: 11,
    paddingHorizontal: 10,
    paddingTop: 2,
    paddingBottom: 10,
    marginLeft: 0,
  },

  // List view
  listContent: {
    paddingTop: 16,
    paddingHorizontal: 16,
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
  listIconTile: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  listInfo: {
    flex: 1,
    marginRight: 8,
  },
  listTitle: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  listDate: {
    fontFamily: BODY_FONT,
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
    fontFamily: BODY_FONT,
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
    fontFamily: BODY_FONT,
    fontSize: 16,
    fontWeight: '600',
  },
});

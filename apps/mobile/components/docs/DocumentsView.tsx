import { templates, type DocumentTemplate } from '@gruenerator/docs/templates';
import { useAuth } from '@gruenerator/shared/hooks';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useCallback, useState, useMemo, memo } from 'react';
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

import { useContentColumn, useLayout } from '../../hooks/useLayout';
import { useDocsStore } from '../../stores/docsStore';
import { lightTheme, darkTheme, colors, spacing, BODY_FONT } from '../../theme';
import { FLOATING_TAB_BAR_HEIGHT, gridColumns } from '../../theme/layout';
import { officeTypeColor } from '../../theme/officeColors';
import { getSurfaceFab } from '../../theme/toolTheme';
import { DocPreview } from '../common/DocPreview';
import { EmptyState, type EmptyStateAction } from '../common/EmptyState';
import { Fab } from '../common/Fab';
import { type ViewMode } from '../common/ViewModeToggle';
import {
  isDocFamily,
  officeIconFor,
  pushOfficeItem,
  type OfficeItem,
  type OfficeKind,
} from '../office/officeItem';

import { CreateDocSheet } from './CreateDocSheet';
import { toDocListItems } from './docListItems';
import { NativeShareModal } from './NativeShareModal';

/**
 * One formatter for the whole list. `toLocaleDateString` builds a fresh
 * `Intl.DateTimeFormat` on every call, which on a grid of cards means one per
 * card per render — the most expensive thing a date label can do.
 */
const DATE_FORMAT = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const formatDate = (dateString: string): string => DATE_FORMAT.format(new Date(dateString));

/**
 * Windowing for both lists. FlatList's defaults keep roughly ten screens of
 * cells alive (`windowSize: 21`, measured in viewports either side), which for a
 * grid of document cards means dozens of mounted previews and thumbnails for a
 * list nobody has scrolled. Four screens either way is still far more than a
 * flick can outrun.
 */
const GRID_WINDOWING = {
  initialNumToRender: 8,
  maxToRenderPerBatch: 6,
  windowSize: 9,
  removeClippedSubviews: true,
} as const;

/** The empty state's fanned stack — doc in the middle, the tab's centre of gravity. */
const EMPTY_TILE_KINDS: OfficeKind[] = ['presentation', 'doc', 'sheet'];

/** Theme slice the cards need — narrow so their props stay comparable. */
interface CardTheme {
  card: string;
  cardBorder: string;
  text: string;
  textSecondary: string;
  surface: string;
}

/**
 * Grid card, memoised.
 *
 * Split out of `DocumentsView` for one reason: as inline JSX inside a
 * `renderItem` closure there was nothing to memoise, so every card re-rendered
 * whenever anything on the screen changed — including `DocPreview`, which regexes
 * document HTML, and the canvas thumbnails. `item` is a fresh object per list
 * rebuild but a stable one between renders, and the three remaining props are
 * module constants or `useCallback`s, so the comparison actually holds.
 */
const OfficeGridCard = memo(function OfficeGridCard({
  item,
  isDark,
  theme,
  onOpen,
  onActions,
}: {
  item: OfficeItem;
  isDark: boolean;
  theme: CardTheme;
  onOpen: (item: OfficeItem) => void;
  onActions: (item: OfficeItem) => void;
}) {
  const typeColor = officeTypeColor(item.kind, isDark);
  const handleOpen = useCallback(() => onOpen(item), [onOpen, item]);
  const handleActions = useCallback(() => onActions(item), [onActions, item]);

  return (
    <TouchableOpacity
      style={[styles.gridCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
      onPress={handleOpen}
      activeOpacity={0.7}
    >
      {item.kind === 'canvas' && item.thumbnailUrl ? (
        <Image
          source={{ uri: item.thumbnailUrl }}
          style={styles.cardThumbnail}
          contentFit="cover"
          transition={150}
          // Without this the recycled view keeps the previous item's image until
          // the new one decodes, which in a fast scroll reads as cards swapping
          // pictures.
          recyclingKey={item.id}
        />
      ) : item.kind === 'doc' && item.preview ? (
        <DocPreview content={item.preview} style={styles.cardThumbnailDoc} />
      ) : (
        <View style={[styles.cardThumbnail, { backgroundColor: typeColor.tile }]}>
          <Ionicons name={officeIconFor(item.kind)} size={36} color={typeColor.icon} />
        </View>
      )}
      <View style={styles.cardInfoRow}>
        <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
          {item.title || 'Unbenannt'}
        </Text>
        {isDocFamily(item.kind) && (
          <TouchableOpacity
            onPress={handleActions}
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
});

/** List-mode row. Same memoisation reasoning as the grid card. */
const OfficeListRow = memo(function OfficeListRow({
  item,
  isDark,
  theme,
  onOpen,
  onActions,
}: {
  item: OfficeItem;
  isDark: boolean;
  theme: CardTheme;
  onOpen: (item: OfficeItem) => void;
  onActions: (item: OfficeItem) => void;
}) {
  const typeColor = officeTypeColor(item.kind, isDark);
  const handleOpen = useCallback(() => onOpen(item), [onOpen, item]);
  const handleActions = useCallback(() => onActions(item), [onActions, item]);

  return (
    <TouchableOpacity
      style={[styles.listCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
      onPress={handleOpen}
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
      {isDocFamily(item.kind) && (
        <TouchableOpacity
          onPress={handleActions}
          style={styles.cardMenuButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="ellipsis-vertical" size={16} color={theme.textSecondary} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
});

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
  viewMode = 'grid',
}: {
  /**
   * Non-doc Office items (boards + canvas) merged into the list — they have their
   * own endpoints and are fetched by the screen, not by the docs store.
   */
  extraItems?: OfficeItem[];
  /**
   * Grid or list. Owned by the screen because the switch now sits in the header
   * bar, which the screen renders — this view only reads it.
   */
  viewMode?: ViewMode;
} = {}) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const { user } = useAuth();
  // Columns from the card size rather than from the device class: `isTablet ? 3 : 2`
  // held the count near the phone's and let the card inflate instead.
  const { gridWidth } = useLayout();
  const gridCols = gridColumns(gridWidth, MIN_CARD, CARD_GAP);
  const gridColumn = useContentColumn('grid');

  // One selector per field rather than `useDocsStore()`. The bare call subscribes
  // to the whole store, so this view re-rendered — and with it every visible
  // card — whenever `prefetchedDocs` was replaced, a Map it never reads.
  const documents = useDocsStore((s) => s.documents);
  const isLoading = useDocsStore((s) => s.isLoading);
  const error = useDocsStore((s) => s.error);
  const fetchDocuments = useDocsStore((s) => s.fetchDocuments);
  const createDocument = useDocsStore((s) => s.createDocument);
  const generateDocument = useDocsStore((s) => s.generateDocument);
  const deleteDocument = useDocsStore((s) => s.deleteDocument);
  const clearError = useDocsStore((s) => s.clearError);
  const prefetchRecentDocs = useDocsStore((s) => s.prefetchRecentDocs);
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
  const [createTemplates, setCreateTemplates] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [activeDoc, setActiveDoc] = useState<{ id: string; title: string } | null>(null);

  // Sheets/presentations already arrive in `documents` via /docs — the subtype
  // decides which viewer they open. See `docListItems` for the merge itself.
  const officeItems = useMemo<OfficeItem[]>(
    () => toDocListItems(documents, extraItems),
    [documents, extraItems]
  );

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

  // Stable identities: these reach every card as props, and a fresh function per
  // render would undo the cards' `memo` exactly as the inline closures did.
  const handleOpenItem = useCallback((item: OfficeItem) => pushOfficeItem(router, item), [router]);

  const handleOpenActions = useCallback((item: OfficeItem) => {
    setActiveDoc({ id: item.id, title: item.title || 'Unbenannt' });
  }, []);

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

  const isDark = colorScheme === 'dark';

  const renderDocument = useCallback(
    ({ item }: { item: OfficeItem }) => (
      <OfficeGridCard
        item={item}
        isDark={isDark}
        theme={theme}
        onOpen={handleOpenItem}
        onActions={handleOpenActions}
      />
    ),
    [isDark, theme, handleOpenItem, handleOpenActions]
  );

  const renderListItem = useCallback(
    ({ item }: { item: OfficeItem }) => (
      <OfficeListRow
        item={item}
        isDark={isDark}
        theme={theme}
        onOpen={handleOpenItem}
        onActions={handleOpenActions}
      />
    ),
    [isDark, theme, handleOpenItem, handleOpenActions]
  );

  // Three rows, three destinations: straight into a blank document, into the
  // sheet's KI input, into the template catalogue. The tiles above them wear the
  // office hues, so the empty tab already shows the palette it will fill with.
  //
  // Not memoised, unlike the card renderers: this one renders only while the
  // list is empty, so there is nothing underneath it that a fresh identity could
  // make re-render.
  const emptyActions: EmptyStateAction[] = [
    {
      key: 'blank',
      glyph: 'document-outline',
      title: 'Leeres Dokument',
      description: 'Sofort losschreiben',
      tone: officeTypeColor('doc', isDark),
      onPress: () => {
        const blank = templates.find((t) => t.id === 'blank');
        if (blank) void handleSelectTemplate(blank);
      },
    },
    {
      key: 'ai',
      glyph: 'sparkles-outline',
      title: 'Mit KI erstellen',
      description: 'Beschreiben, den Entwurf schreibt die KI',
      tone: officeTypeColor('canvas', isDark),
      onPress: () => {
        setCreateTemplates(false);
        setCreateOpen(true);
      },
    },
    {
      key: 'templates',
      glyph: 'albums-outline',
      title: 'Vorlage wählen',
      description: 'Antrag, Pressemitteilung, Protokoll und mehr',
      tone: officeTypeColor('sheet', isDark),
      onPress: () => {
        setCreateTemplates(true);
        setCreateOpen(true);
      },
    },
  ];

  const renderEmptyState = () => (
    <EmptyState
      tiles={EMPTY_TILE_KINDS.map((kind) => ({
        glyph: officeIconFor(kind),
        ...officeTypeColor(kind, isDark),
      }))}
      title="Noch nichts erstellt"
      description="Dokumente, Präsentationen, Tabellen, Boards und Sharepics sammeln sich hier — alles an einem Ort."
      actions={emptyActions}
    />
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

      {/* No chrome of its own any more: search moved into the create sheet (web
          parity), and the grid/list switch moved up into the header bar, where it
          is the screen's one trailing control. */}

      {/* Document Grid */}
      {isLoading && officeItems.length === 0 ? (
        <View style={[gridColumn, styles.gridContent]}>
          <View style={styles.gridRow}>
            {Array.from({ length: gridCols }, (_, i) => i).map((i) => (
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
            gridColumn,
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
          {...GRID_WINDOWING}
        />
      ) : (
        <FlatList
          key="list"
          data={officeItems}
          keyExtractor={(item) => item.id}
          renderItem={renderListItem}
          contentContainerStyle={[
            gridColumn,
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
          {...GRID_WINDOWING}
        />
      )}

      <Fab
        icon="add"
        onPress={() => {
          setCreateTemplates(false);
          setCreateOpen(true);
        }}
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
        expandTemplates={createTemplates}
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

/**
 * Smallest a document card may get before a column is dropped. Wider than a tool
 * tile because a card carries a title, a type badge and a date under its
 * preview; a phone already draws two of these at ~156dp, so the floor of 2 in
 * `gridColumns` keeps the phone exactly as it is.
 */
const MIN_CARD = 180;

const styles = StyleSheet.create({
  fill: { flex: 1 },

  // Grid. The horizontal margin comes from the content column now, so that the
  // grid, the list and the header all stop at the same edge.
  gridContent: {
    paddingTop: 16,
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

  // Loading / Error — the empty state is `components/common/EmptyState`.
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

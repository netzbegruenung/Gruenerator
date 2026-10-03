import { templates } from '@gruenerator/docs/templates';
import { useAuth } from '@gruenerator/shared/hooks';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';

import { useContentColumn, useLayout } from '../../hooks/useLayout';
import { useOfficeSearch } from '../../hooks/useOfficeSearch';
import {
  useOpenRecentItem,
  useRecentActivity,
  type RecentItem,
} from '../../hooks/useRecentActivity';
import { useStudioMedia } from '../../hooks/useStudioMedia';
import { useTabBarClearance } from '../../hooks/useTabBarClearance';
import { useDocsStore } from '../../stores/docsStore';
import { useToolFavoritesStore } from '../../stores/toolFavoritesStore';
import { colors, darkTheme, lightTheme, spacing, BODY_FONT } from '../../theme';
import { officeTypeColor } from '../../theme/officeColors';
import { getSurfaceFab, getToolTheme } from '../../theme/toolTheme';
import { CreateMenuSheet, SHEET_HANDOFF_MS, type CreateMenuEntry } from '../common/CreateMenuSheet';
import { EmptyState, type EmptyStateAction } from '../common/EmptyState';
import { Fab } from '../common/Fab';
import { RecentItemsSection, useRecentCardColumns } from '../common/RecentItemsSection';
import { ViewModeToggle, type ViewMode } from '../common/ViewModeToggle';
import { CreateDocSheet } from '../docs/CreateDocSheet';
import { toDocListItems } from '../docs/docListItems';
import { NativeShareModal } from '../docs/NativeShareModal';
import { useDocCreation } from '../docs/useDocCreation';
import { MenuIcon } from '../icons/WebMirrorIcons';
import {
  isDocFamily,
  officeIconFor,
  pushOfficeItem,
  type OfficeItem,
  type OfficeKind,
} from '../office/officeItem';
import { useOfficeExtraItems } from '../office/useOfficeExtraItems';
import { STUDIO_TOOLS, STUDIO_TOOL_GLYPHS, WORKPLACE_TILES } from '../tools/toolsConfig';
import { ToolSquareGrid } from '../tools/ToolSquareGrid';

import { LoadErrorNotice } from './LoadErrorNotice';
import {
  OFFICE_SECTIONS,
  filterByTitle,
  fromOfficeSearchItem,
  groupOfficeItems,
  toRecentItem,
} from './officeSections';
import { WorkplaceSearchBar } from './WorkplaceSearchBar';

/** "Zuletzt" shows two rows until it is unfolded — a 2×2 block on a phone. */
const RECENT_ROWS = 2;
/** At least as many items as the Studio tab shows per section, rounded up to whole rows. */
const SECTION_MIN = 6;
/** The empty state's fanned stack, as the old Arbeiten tab drew it. */
const EMPTY_TILE_KINDS: OfficeKind[] = ['presentation', 'doc', 'sheet'];

/** "N weitere anzeigen" / "Weniger anzeigen" under a capped section. */
function MoreToggle({
  hidden,
  expanded,
  onToggle,
  color,
}: {
  hidden: number;
  expanded: boolean;
  onToggle: () => void;
  color: string;
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      hitSlop={8}
      style={styles.more}
    >
      <Text style={[styles.moreText, { color }]}>
        {expanded ? 'Weniger anzeigen' : `${hidden} weitere anzeigen`}
      </Text>
    </Pressable>
  );
}

/**
 * The Arbeiten page of the workplace pager (`WorkplacePager`): the former
 * Arbeiten and Studio tabs on one page, in web's order — tool tiles, "Zuletzt",
 * then one section per kind, office first, studio media after. The FAB opens
 * Studio's "Neu erstellen" menu with Dokument as a fourth entry, which hands
 * over to the docs sheet (describe, find or pick a template).
 *
 * Everything the two old tabs offered is still here: every item is reachable
 * (each section unfolds past its cap), documents keep their ⋮ menu (share,
 * delete), a failed load says so instead of looking like an empty account, and
 * an empty account gets the create entry points of both old empty states.
 * Favourited tiles move to the front of the row, as on web.
 */
export function WorkplaceArbeitenPage() {
  const isDark = useColorScheme() === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { gridWidth } = useLayout();
  const gridColumn = useContentColumn('grid');
  // Caps in whole rows, so a three- or five-column tablet grid never ends on a
  // lone card under a full row.
  const cardColumns = useRecentCardColumns();
  const recentCap = cardColumns * RECENT_ROWS;
  const sectionCap = cardColumns * Math.ceil(SECTION_MIN / cardColumns);
  const bottomClearance = useTabBarClearance(spacing.xxlarge);
  const fabBottom = useTabBarClearance(spacing.medium);
  const fabTone = getSurfaceFab('arbeiten', isDark);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [docSheetTemplates, setDocSheetTemplates] = useState(false);
  const [activeDoc, setActiveDoc] = useState<{ id: string; title: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [docSheetPending, setDocSheetPending] = useState(false);
  const [docSheetOpen, setDocSheetOpen] = useState(false);

  const recent = useRecentActivity();
  const openRecent = useOpenRecentItem();
  const studio = useStudioMedia();
  const extra = useOfficeExtraItems();
  const documents = useDocsStore((s) => s.documents);
  const docsLoading = useDocsStore((s) => s.isLoading);
  const docsError = useDocsStore((s) => s.error);
  const deleteDocument = useDocsStore((s) => s.deleteDocument);
  const fetchDocuments = useDocsStore((s) => s.fetchDocuments);
  const { isCreating, createFromTemplate, generate } = useDocCreation(() => setDocSheetOpen(false));

  useEffect(() => {
    if (user) {
      void fetchDocuments();
    }
  }, [fetchDocuments, user]);

  const officeItems = useMemo(
    () => toDocListItems(documents, extra.items),
    [documents, extra.items]
  );
  // With a query the same sections show the hits instead: office by title and
  // body from the server, media by title from what is already loaded.
  const officeSearch = useOfficeSearch(searchOpen ? searchQuery : '');
  const searching = searchOpen && searchQuery.trim() !== '';
  const shownOffice = useMemo(
    () => (searching ? officeSearch.items.map(fromOfficeSearchItem) : officeItems),
    [searching, officeSearch.items, officeItems]
  );
  const officeGroups = useMemo(() => groupOfficeItems(shownOffice), [shownOffice]);
  const officeById = useMemo(
    () => new Map(shownOffice.map((item) => [item.id, item])),
    [shownOffice]
  );
  const media = searching
    ? {
        sharepics: filterByTitle(studio.sharepics, searchQuery),
        kiImages: filterByTitle(studio.kiImages, searchQuery),
        reels: filterByTitle(studio.reels, searchQuery),
      }
    : studio;
  const noHits =
    searching &&
    !officeSearch.isSearching &&
    shownOffice.length === 0 &&
    media.sharepics.length === 0 &&
    media.kiImages.length === 0 &&
    media.reels.length === 0;

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  const openOffice = useCallback(
    (item: RecentItem) => {
      const office = officeById.get(item.id);
      if (office) pushOfficeItem(router, office);
    },
    [officeById, router]
  );
  const openOfficeItem = useCallback((item: OfficeItem) => pushOfficeItem(router, item), [router]);

  const [refreshing, setRefreshing] = useState(false);
  const { refresh: refreshExtra } = extra;
  const { refetch: refetchStudio } = studio;
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    refreshExtra();
    refetchStudio();
    await Promise.all([
      fetchDocuments(),
      queryClient.invalidateQueries({ queryKey: ['recent-activity'] }),
    ]);
    setRefreshing(false);
  }, [refreshExtra, refetchStudio, fetchDocuments, queryClient]);

  const toggleExpanded = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  /** A section's items, capped unless unfolded or searching, plus its toggle. */
  const capped = <T,>(key: string, items: T[], cap: number) => {
    const open = searching || expanded.has(key);
    const hidden = items.length - cap;
    return {
      items: open ? items : items.slice(0, cap),
      toggle:
        !searching && hidden > 0 ? (
          <MoreToggle
            hidden={hidden}
            expanded={expanded.has(key)}
            onToggle={() => toggleExpanded(key)}
            color={theme.textSecondary}
          />
        ) : null,
    };
  };

  const favorites = useToolFavoritesStore((s) => s.favorites);
  const tiles = useMemo(() => {
    const rank = (id: string) => {
      const i = favorites.indexOf(id);
      return i === -1 ? favorites.length : i;
    };
    return [...WORKPLACE_TILES].sort((a, b) => rank(a.id) - rank(b.id));
  }, [favorites]);

  // The ⋮ menu the old Arbeiten list had on docs, sheets and presentations.
  const openActions = useCallback(
    (item: RecentItem) => {
      const office = officeById.get(item.id);
      if (office && isDocFamily(office.kind)) {
        setActiveDoc({ id: office.id, title: office.title || 'Unbenannt' });
      }
    },
    [officeById]
  );
  const handleDelete = (id: string, title: string) => {
    setActiveDoc(null);
    Alert.alert('Dokument löschen', `Möchtest du "${title}" wirklich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => {
          void deleteDocument(id).then(() =>
            queryClient.invalidateQueries({ queryKey: ['office-search'] })
          );
        },
      },
    ]);
  };

  const openDocSheet = (withTemplates: boolean) => {
    setDocSheetTemplates(withTemplates);
    setDocSheetOpen(true);
  };

  const officeLoading = docsLoading && documents.length === 0;
  const officeEmpty = !officeLoading && officeItems.length === 0;
  const mediaEmpty =
    !studio.isLoading &&
    studio.sharepics.length === 0 &&
    studio.kiImages.length === 0 &&
    studio.reels.length === 0;
  const showDocsError = !!docsError && officeEmpty;
  const showMediaError = studio.isError && mediaEmpty;
  const accountEmpty =
    officeEmpty &&
    mediaEmpty &&
    !showDocsError &&
    !showMediaError &&
    !recent.isLoading &&
    recent.items.length === 0;

  // Both old empty states in one: the office starting points, then the studio
  // tools, with the same wording as the create menu so no route looks like two.
  const emptyActions: EmptyStateAction[] = [
    {
      key: 'blank',
      glyph: 'document-outline',
      title: 'Leeres Dokument',
      description: 'Sofort losschreiben',
      tone: officeTypeColor('doc', isDark),
      onPress: () => {
        const blank = templates.find((t) => t.id === 'blank');
        if (blank) void createFromTemplate(blank);
      },
    },
    {
      key: 'ai',
      glyph: 'sparkles-outline',
      title: 'Mit KI erstellen',
      description: 'Beschreiben, den Entwurf schreibt die KI',
      tone: officeTypeColor('canvas', isDark),
      onPress: () => openDocSheet(false),
    },
    {
      key: 'templates',
      glyph: 'albums-outline',
      title: 'Vorlage wählen',
      description: 'Antrag, Pressemitteilung, Protokoll und mehr',
      tone: officeTypeColor('sheet', isDark),
      onPress: () => openDocSheet(true),
    },
    ...STUDIO_TOOLS.map((tool) => ({
      key: tool.id,
      glyph: STUDIO_TOOL_GLYPHS[tool.id] ?? 'sparkles',
      title: tool.title,
      description: tool.description,
      tone: getToolTheme(tool.id, isDark),
      onPress: () => router.push(tool.route as Href),
    })),
  ];

  const recentList = capped('recent', recent.items, recentCap);
  const mediaSections = [
    { key: 'sharepics', title: 'Sharepics', items: media.sharepics, tone: 'vorlagen' },
    { key: 'kiImages', title: 'KI-Bilder', items: media.kiImages, tone: 'ki-bildgenerierung' },
    { key: 'reels', title: 'Reels', items: media.reels, tone: 'reel' },
  ] as const;

  // The docs sheet opens only once the menu has slid out: iOS will not present
  // a Modal while another one is still leaving.
  useEffect(() => {
    if (!docSheetPending) return;
    const timer = setTimeout(() => {
      setDocSheetPending(false);
      setDocSheetOpen(true);
    }, SHEET_HANDOFF_MS);
    return () => clearTimeout(timer);
  }, [docSheetPending]);

  const menuEntries = useMemo<CreateMenuEntry[]>(() => {
    const docsTone = getToolTheme('docs', isDark);
    return [
      ...STUDIO_TOOLS.map((tool) => {
        const tone = getToolTheme(tool.id, isDark);
        return {
          key: tool.id,
          title: tool.title,
          description: tool.description,
          tone,
          icon: <MenuIcon name={tool.icon} size={22} color={tone.icon} />,
          onPress: () => router.push(tool.route as Href),
        };
      }),
      {
        key: 'docs',
        title: 'Dokument',
        description: 'Beschreiben, finden oder aus Vorlage',
        tone: docsTone,
        icon: <Ionicons name="document-text" size={22} color={docsTone.icon} />,
        onPress: () => {
          setDocSheetTemplates(false);
          setDocSheetPending(true);
        },
      },
    ];
  }, [isDark, router]);

  const viewToggle = <ViewModeToggle mode={viewMode} onChange={setViewMode} />;

  return (
    <>
      <ScrollView
        contentContainerStyle={[gridColumn, styles.content, { paddingBottom: bottomClearance }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            tintColor={colors.primary[600]}
            colors={[colors.primary[600]]}
          />
        }
      >
        <ToolSquareGrid tools={tiles} availableWidth={gridWidth} row />

        {searchOpen ? (
          <View style={styles.section}>
            <WorkplaceSearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              onClose={closeSearch}
              trailing={viewToggle}
            />
            {searching && (
              <Text style={[styles.searchStatus, { color: theme.textSecondary }]}>
                {officeSearch.isError
                  ? 'Die Dokumentsuche ist fehlgeschlagen.'
                  : officeSearch.isSearching
                    ? 'Suche…'
                    : !officeSearch.active
                      ? 'Dokumente ab 2 Zeichen'
                      : noHits
                        ? `Keine Treffer für „${searchQuery.trim()}“`
                        : null}
              </Text>
            )}
          </View>
        ) : (
          <>
            <RecentItemsSection
              title="Zuletzt"
              headerRight={
                <View style={styles.headerControls}>
                  <Pressable
                    onPress={() => setSearchOpen(true)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Arbeiten durchsuchen"
                    style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                  >
                    <Ionicons name="search" size={22} color={theme.text} />
                  </Pressable>
                  {viewToggle}
                </View>
              }
              items={recentList.items}
              isLoading={recent.isLoading}
              style={styles.section}
              viewMode={viewMode}
              onOpen={openRecent}
            />
            {recentList.toggle}
          </>
        )}

        {!searching && accountEmpty ? (
          <EmptyState
            style={styles.section}
            tiles={EMPTY_TILE_KINDS.map((kind) => ({
              glyph: officeIconFor(kind),
              ...officeTypeColor(kind, isDark),
            }))}
            title="Noch nichts erstellt"
            description="Dokumente, Präsentationen, Tabellen, Boards, Sharepics, KI-Bilder und Reels sammeln sich hier — alles an einem Ort."
            actions={emptyActions}
          />
        ) : null}

        {!searching && showDocsError && (
          <View style={styles.section}>
            <LoadErrorNotice
              title="Dokumente konnten nicht geladen werden"
              description="Dokumente, Tabellen, Präsentationen und Boards liegen weiter auf dem Server."
              onRetry={() => void handleRefresh()}
            />
          </View>
        )}
        {OFFICE_SECTIONS.map((section) => {
          const list = capped(section.kind, officeGroups[section.kind], sectionCap);
          return (
            <View key={section.kind}>
              <RecentItemsSection
                title={section.title}
                items={list.items.map(toRecentItem)}
                isLoading={!searching && officeLoading}
                style={styles.section}
                viewMode={viewMode}
                onOpen={openOffice}
                {...(isDocFamily(section.kind) && { onActions: openActions })}
              />
              {list.toggle}
            </View>
          );
        })}

        {!searching && showMediaError && (
          <View style={styles.section}>
            <LoadErrorNotice
              title="Deine Medien konnten nicht geladen werden"
              description="Sharepics, KI-Bilder und Reels liegen weiterhin auf dem Server — hier fehlt nur die Verbindung."
              onRetry={studio.refetch}
            />
          </View>
        )}
        {mediaSections.map((section) => {
          const list = capped(section.key, section.items, sectionCap);
          return (
            <View key={section.key}>
              <RecentItemsSection
                title={section.title}
                items={list.items}
                isLoading={!searching && studio.isLoading}
                accent={getToolTheme(section.tone, isDark).icon}
                style={styles.section}
                viewMode={viewMode}
                onOpen={openRecent}
              />
              {list.toggle}
            </View>
          );
        })}
      </ScrollView>

      <Fab
        icon="add"
        accessibilityLabel="Neu erstellen"
        onPress={() => setMenuOpen(true)}
        loading={isCreating}
        color={fabTone.icon}
        style={{ backgroundColor: fabTone.background, bottom: fabBottom }}
      />

      <CreateMenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        entries={menuEntries}
      />

      <CreateDocSheet
        visible={docSheetOpen}
        onClose={() => setDocSheetOpen(false)}
        items={officeItems}
        isCreating={isCreating}
        expandTemplates={docSheetTemplates}
        onGenerate={(description) => void generate(description)}
        onSelectTemplate={(template) => void createFromTemplate(template)}
        onOpenItem={(item) => {
          setDocSheetOpen(false);
          openOfficeItem(item);
        }}
      />

      {activeDoc && (
        <NativeShareModal
          visible
          onClose={() => setActiveDoc(null)}
          documentId={activeDoc.id}
          documentTitle={activeDoc.title}
          userDisplayName={user?.display_name ?? undefined}
          isOwner
          onDelete={() => handleDelete(activeDoc.id, activeDoc.title)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.small,
  },
  section: {
    paddingTop: spacing.large,
  },
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Same 40x40 as the grid/list switch beside it.
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  searchStatus: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    paddingTop: spacing.small,
  },
  more: {
    alignSelf: 'center',
    paddingTop: spacing.small,
  },
  moreText: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    fontWeight: '600',
  },
});

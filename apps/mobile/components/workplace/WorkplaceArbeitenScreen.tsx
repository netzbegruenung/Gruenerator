import { useAuth } from '@gruenerator/shared/hooks';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

import { useContentColumn, useLayout } from '../../hooks/useLayout';
import { useOfficeSearch } from '../../hooks/useOfficeSearch';
import {
  useOpenRecentItem,
  useRecentActivity,
  type RecentItem,
} from '../../hooks/useRecentActivity';
import { useStudioMedia } from '../../hooks/useStudioMedia';
import { useTabBarClearance } from '../../hooks/useTabBarClearance';
import { useTabNavigationSwipe } from '../../hooks/useTabSwipe';
import { useDocsStore } from '../../stores/docsStore';
import { colors, darkTheme, lightTheme, spacing, BODY_FONT } from '../../theme';
import { getSurfaceFab, getToolTheme } from '../../theme/toolTheme';
import { CreateMenuSheet, SHEET_HANDOFF_MS, type CreateMenuEntry } from '../common/CreateMenuSheet';
import { Fab } from '../common/Fab';
import { RecentItemsSection } from '../common/RecentItemsSection';
import { ViewModeToggle, type ViewMode } from '../common/ViewModeToggle';
import { CreateDocSheet } from '../docs/CreateDocSheet';
import { toDocListItems } from '../docs/docListItems';
import { useDocCreation } from '../docs/useDocCreation';
import { MenuIcon } from '../icons/WebMirrorIcons';
import { ScreenScaffold } from '../navigation/ScreenScaffold';
import { WorkplaceTopTabs } from '../navigation/WorkplaceTopTabs';
import { pushOfficeItem, type OfficeItem } from '../office/officeItem';
import { useOfficeExtraItems } from '../office/useOfficeExtraItems';
import { STUDIO_TOOLS, WORKPLACE_TILES } from '../tools/toolsConfig';
import { ToolSquareGrid } from '../tools/ToolSquareGrid';

import {
  OFFICE_SECTIONS,
  filterByTitle,
  fromOfficeSearchItem,
  groupOfficeItems,
  toRecentItem,
} from './officeSections';
import { WorkplaceSearchBar } from './WorkplaceSearchBar';

/** "Zuletzt" shows a 2×2 block until it is unfolded. */
const RECENT_COLLAPSED = 4;
/** Same cap the Studio tab puts on each of its sections. */
const SECTION_LIMIT = 6;

/**
 * The Arbeiten tab of the workplace shell (`config/navLayout`): the former
 * Arbeiten and Studio tabs on one page, in web's order — tool tiles, "Zuletzt",
 * then one section per kind, office first, studio media after. The FAB opens
 * Studio's "Neu erstellen" menu with Dokument as a fourth entry, which hands
 * over to the docs sheet (describe, find or pick a template).
 *
 * Sections hide while they are empty, so a new account sees the tiles and the
 * FAB and nothing that reads as missing.
 */
export function WorkplaceArbeitenScreen() {
  const isDark = useColorScheme() === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { gridWidth } = useLayout();
  const gridColumn = useContentColumn('grid');
  const bottomClearance = useTabBarClearance(spacing.xxlarge);
  const fabBottom = useTabBarClearance(spacing.medium);
  const fabTone = getSurfaceFab('arbeiten', isDark);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [recentExpanded, setRecentExpanded] = useState(false);
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
  const fetchDocuments = useDocsStore((s) => s.fetchDocuments);
  const prefetchRecentDocs = useDocsStore((s) => s.prefetchRecentDocs);
  const { isCreating, createFromTemplate, generate } = useDocCreation(() => setDocSheetOpen(false));

  useEffect(() => {
    if (user) {
      void fetchDocuments();
      void prefetchRecentDocs();
    }
  }, [fetchDocuments, prefetchRecentDocs, user]);

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
  const limit = searching ? Infinity : SECTION_LIMIT;
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

  const recentItems = recentExpanded ? recent.items : recent.items.slice(0, RECENT_COLLAPSED);
  const canExpand = recent.items.length > RECENT_COLLAPSED;

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
        onPress: () => setDocSheetPending(true),
      },
    ];
  }, [isDark, router]);

  const swipe = useTabNavigationSwipe('/(tabs)/(arbeiten)');
  const viewToggle = <ViewModeToggle mode={viewMode} onChange={setViewMode} />;

  const backdrop = isDark ? undefined : (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flatBg]} />
  );

  return (
    <ScreenScaffold
      title="Arbeiten"
      titleNode={<WorkplaceTopTabs active="arbeiten" />}
      backdrop={backdrop}
    >
      <GestureDetector gesture={swipe}>
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
          <ToolSquareGrid
            tools={WORKPLACE_TILES}
            availableWidth={gridWidth}
            row
            blocksGesture={swipe}
          />

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
                items={recentItems}
                isLoading={recent.isLoading}
                style={styles.section}
                viewMode={viewMode}
                onOpen={openRecent}
              />
              {canExpand && (
                <Pressable
                  onPress={() => setRecentExpanded((open) => !open)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: recentExpanded }}
                  hitSlop={8}
                  style={styles.more}
                >
                  <Text style={[styles.moreText, { color: theme.textSecondary }]}>
                    {recentExpanded
                      ? 'Weniger anzeigen'
                      : `${recent.items.length - RECENT_COLLAPSED} weitere anzeigen`}
                  </Text>
                </Pressable>
              )}
            </>
          )}

          {OFFICE_SECTIONS.map((section) => (
            <RecentItemsSection
              key={section.kind}
              title={section.title}
              items={officeGroups[section.kind].slice(0, limit).map(toRecentItem)}
              isLoading={!searching && docsLoading && documents.length === 0}
              style={styles.section}
              viewMode={viewMode}
              onOpen={openOffice}
            />
          ))}

          <RecentItemsSection
            title="Sharepics"
            items={media.sharepics.slice(0, limit)}
            isLoading={!searching && studio.isLoading}
            accent={getToolTheme('vorlagen', isDark).icon}
            style={styles.section}
            viewMode={viewMode}
            onOpen={openRecent}
          />
          <RecentItemsSection
            title="KI-Bilder"
            items={media.kiImages.slice(0, limit)}
            isLoading={!searching && studio.isLoading}
            accent={getToolTheme('ki-bildgenerierung', isDark).icon}
            style={styles.section}
            viewMode={viewMode}
            onOpen={openRecent}
          />
          <RecentItemsSection
            title="Reels"
            items={media.reels.slice(0, limit)}
            isLoading={!searching && studio.isLoading}
            accent={getToolTheme('reel', isDark).icon}
            style={styles.section}
            viewMode={viewMode}
            onOpen={openRecent}
          />
        </ScrollView>
      </GestureDetector>

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
        onGenerate={(description) => void generate(description)}
        onSelectTemplate={(template) => void createFromTemplate(template)}
        onOpenItem={(item) => {
          setDocSheetOpen(false);
          openOfficeItem(item);
        }}
      />
    </ScreenScaffold>
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
  // Web's Arbeiten tab tint (bg-[#F7FBF8]); dark keeps the app gradient.
  flatBg: {
    backgroundColor: '#F7FBF8',
  },
});

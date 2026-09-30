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

import { OFFICE_SECTIONS, groupOfficeItems, toRecentItem } from './officeSections';

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
  const officeGroups = useMemo(() => groupOfficeItems(officeItems), [officeItems]);
  const officeById = useMemo(
    () => new Map(officeItems.map((item) => [item.id, item])),
    [officeItems]
  );

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

  const backdrop = isDark ? undefined : (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flatBg]} />
  );

  return (
    <ScreenScaffold
      title="Arbeiten"
      titleNode={<WorkplaceTopTabs active="arbeiten" />}
      backdrop={backdrop}
      headerRight={<ViewModeToggle mode={viewMode} onChange={setViewMode} />}
    >
      <GestureDetector gesture={swipe}>
        <ScrollView
          contentContainerStyle={[gridColumn, styles.content, { paddingBottom: bottomClearance }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={colors.primary[600]}
              colors={[colors.primary[600]]}
            />
          }
        >
          <ToolSquareGrid tools={WORKPLACE_TILES} availableWidth={gridWidth} />

          <RecentItemsSection
            title="Zuletzt"
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

          {OFFICE_SECTIONS.map((section) => (
            <RecentItemsSection
              key={section.kind}
              title={section.title}
              items={officeGroups[section.kind].slice(0, SECTION_LIMIT).map(toRecentItem)}
              isLoading={docsLoading && documents.length === 0}
              style={styles.section}
              viewMode={viewMode}
              onOpen={openOffice}
            />
          ))}

          <RecentItemsSection
            title="Sharepics"
            items={studio.sharepics.slice(0, SECTION_LIMIT)}
            isLoading={studio.isLoading}
            accent={getToolTheme('vorlagen', isDark).icon}
            style={styles.section}
            viewMode={viewMode}
            onOpen={openRecent}
          />
          <RecentItemsSection
            title="KI-Bilder"
            items={studio.kiImages.slice(0, SECTION_LIMIT)}
            isLoading={studio.isLoading}
            accent={getToolTheme('ki-bildgenerierung', isDark).icon}
            style={styles.section}
            viewMode={viewMode}
            onOpen={openRecent}
          />
          <RecentItemsSection
            title="Reels"
            items={studio.reels.slice(0, SECTION_LIMIT)}
            isLoading={studio.isLoading}
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

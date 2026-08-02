import { type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '../../../components/common/BottomSheet';
import { EmptyState } from '../../../components/common/EmptyState';
import { Fab } from '../../../components/common/Fab';
import { RecentItemsSection } from '../../../components/common/RecentItemsSection';
import { StudioGradientBackground } from '../../../components/common/StudioGradientBackground';
import { ViewModeToggle, type ViewMode } from '../../../components/common/ViewModeToggle';
import { MenuIcon } from '../../../components/icons/WebMirrorIcons';
import { ScreenScaffold } from '../../../components/navigation/ScreenScaffold';
import { STUDIO_TOOLS } from '../../../components/tools/toolsConfig';
import { useContentColumn } from '../../../hooks/useLayout';
import { useOpenRecentItem } from '../../../hooks/useRecentActivity';
import { useStudioMedia } from '../../../hooks/useStudioMedia';
import { useTabNavigationSwipe } from '../../../hooks/useTabSwipe';
import { spacing, borderRadius, lightTheme, darkTheme, BODY_FONT } from '../../../theme';
import { FLOATING_TAB_BAR_HEIGHT } from '../../../theme/layout';
import { getSurfaceFab, getToolTheme } from '../../../theme/toolTheme';

const SECTION_LIMIT = 6;

/**
 * Ionicons equivalents of the studio tools' shared glyph keys. The create sheet
 * draws them through `MenuIcon`, which speaks `@gruenerator/shared/icons`;
 * `EmptyState` speaks Ionicons like the rest of the app's list rows, so the
 * three tools need a name in that set too.
 */
const STUDIO_TILE_GLYPHS: Record<string, IoniconsIconName> = {
  vorlagen: 'albums',
  'ki-bildgenerierung': 'sparkles',
  reel: 'videocam',
};

/**
 * The Studio tab — what the user has made with Vorlagen, KI-Bild und Reel, one
 * section per media kind. Creating is the FAB's job: the three studio tools are a
 * create menu rather than a tile grid, so the page leads with content instead of
 * entry points.
 *
 * The data comes from `useStudioMedia`, not from `/recent-activity`. That feed
 * truncates a merged five-kind list, so a busy documents week emptied this whole
 * page; the reasoning is written out at the hook.
 */
export default function StudioScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const fabTone = getSurfaceFab('studio', isDark);
  const { sharepics, kiImages, reels, isLoading, isError, refetch } = useStudioMedia();
  const openItem = useOpenRecentItem();
  const [createOpen, setCreateOpen] = useState(false);
  const gridColumn = useContentColumn('grid');

  const sections = useMemo(
    () => ({
      sharepics: sharepics.slice(0, SECTION_LIMIT),
      kiImages: kiImages.slice(0, SECTION_LIMIT),
      reels: reels.slice(0, SECTION_LIMIT),
    }),
    [sharepics, kiImages, reels]
  );

  const swipe = useTabNavigationSwipe('/(tabs)/(studio)');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const hasNothing =
    !isLoading &&
    sections.sharepics.length === 0 &&
    sections.kiImages.length === 0 &&
    sections.reels.length === 0;

  // A failed request used to be indistinguishable from an empty account: each
  // section hides itself when it has no items, and the fetch swallowed its own
  // error. Offering "erstelle dein erstes Sharepic" to someone whose media just
  // failed to load is the one thing this page must not do.
  const showError = hasNothing && isError;
  const isEmpty = hasNothing && !isError;

  return (
    <ScreenScaffold
      title="Studio"
      backdrop={<StudioGradientBackground />}
      headerRight={<ViewModeToggle mode={viewMode} onChange={setViewMode} />}
    >
      <GestureDetector gesture={swipe}>
        {showError ? (
          <View
            style={[
              styles.empty,
              { paddingBottom: insets.bottom + FLOATING_TAB_BAR_HEIGHT + spacing.xxlarge },
            ]}
          >
            <EmptyState
              tiles={[
                {
                  glyph: 'cloud-offline-outline',
                  ...getToolTheme('reel', isDark),
                },
              ]}
              title="Deine Medien konnten nicht geladen werden"
              description="Sharepics, KI-Bilder und Reels liegen weiterhin auf dem Server — hier fehlt nur die Verbindung."
              actions={[
                {
                  key: 'retry',
                  glyph: 'refresh-outline',
                  title: 'Erneut versuchen',
                  description: 'Lädt alle drei Quellen neu',
                  tone: getToolTheme('vorlagen', isDark),
                  onPress: refetch,
                },
              ]}
            />
          </View>
        ) : isEmpty ? (
          <View
            style={[
              styles.empty,
              { paddingBottom: insets.bottom + FLOATING_TAB_BAR_HEIGHT + spacing.xxlarge },
            ]}
          >
            <EmptyState
              tiles={STUDIO_TOOLS.map((tool) => ({
                glyph: STUDIO_TILE_GLYPHS[tool.id] ?? 'sparkles',
                ...getToolTheme(tool.id, isDark),
              }))}
              title="Dein Studio ist noch leer"
              description="Sharepics, KI-Bilder und Reels landen hier, sobald du das erste erstellt hast."
              // Deliberately the same three entries as the FAB's create sheet: an
              // empty page is the one moment where those belong on the page
              // itself, and inventing different wording for them would make two
              // routes to the same tool look like two tools.
              actions={STUDIO_TOOLS.map((tool) => ({
                key: tool.id,
                glyph: STUDIO_TILE_GLYPHS[tool.id] ?? 'sparkles',
                title: tool.title,
                description: tool.description,
                tone: getToolTheme(tool.id, isDark),
                onPress: () => router.push(tool.route as Href),
              }))}
            />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[
              gridColumn,
              styles.content,
              { paddingBottom: insets.bottom + FLOATING_TAB_BAR_HEIGHT + spacing.xxlarge },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Each section borrows the hue of the tool that produced it, so nothing on
              this page falls back to the app green. Sharepics come first: they
              merge published image shares with the canvases still open for
              editing, which is the same grouping web uses. */}
            <RecentItemsSection
              title="Sharepics"
              items={sections.sharepics}
              isLoading={isLoading}
              accent={getToolTheme('vorlagen', isDark).icon}
              style={styles.section}
              viewMode={viewMode}
              onOpen={openItem}
            />
            <RecentItemsSection
              title="KI-Bilder"
              items={sections.kiImages}
              isLoading={isLoading}
              accent={getToolTheme('ki-bildgenerierung', isDark).icon}
              style={styles.section}
              viewMode={viewMode}
              onOpen={openItem}
            />
            <RecentItemsSection
              title="Reels"
              items={sections.reels}
              isLoading={isLoading}
              accent={getToolTheme('reel', isDark).icon}
              style={styles.section}
              viewMode={viewMode}
              onOpen={openItem}
            />
          </ScrollView>
        )}
      </GestureDetector>

      <Fab
        icon="add"
        accessibilityLabel="Neuen Inhalt erstellen"
        onPress={() => setCreateOpen(true)}
        color={fabTone.icon}
        style={{
          backgroundColor: fabTone.background,
          bottom: insets.bottom + FLOATING_TAB_BAR_HEIGHT + spacing.small,
        }}
      />

      <BottomSheet visible={createOpen} onClose={() => setCreateOpen(false)} padded>
        <Text style={[styles.sheetTitle, { color: theme.text }]}>Neu erstellen</Text>
        {STUDIO_TOOLS.map((tool) => {
          const tone = getToolTheme(tool.id, isDark);
          return (
            <Pressable
              key={tool.id}
              onPress={() => {
                setCreateOpen(false);
                router.push(tool.route as Href);
              }}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? theme.surface : 'transparent' },
              ]}
            >
              <View style={[styles.rowIcon, { backgroundColor: tone.tile }]}>
                <MenuIcon name={tool.icon} size={22} color={tone.icon} />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: theme.text }]}>{tool.title}</Text>
                <Text style={[styles.rowDesc, { color: theme.textSecondary }]}>
                  {tool.description}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </BottomSheet>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  // Horizontal margin comes from the content column, so the sections line up
  // with the header above them.
  content: {
    paddingTop: spacing.small,
  },
  // Fills the scaffold so the empty state centres against the gradient rather
  // than sitting under the header.
  empty: {
    flex: 1,
  },
  section: {
    paddingTop: spacing.large,
  },
  sheetTitle: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 18,
    paddingBottom: spacing.small,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.xsmall,
    borderRadius: borderRadius.medium,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: 'Raleway_600SemiBold',
    fontSize: 16,
  },
  rowDesc: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    marginTop: 1,
  },
});

import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheet } from '../../../components/common/BottomSheet';
import { Fab } from '../../../components/common/Fab';
import { RecentItemsSection } from '../../../components/common/RecentItemsSection';
import { StudioGradientBackground } from '../../../components/common/StudioGradientBackground';
import { ViewModeToggle, type ViewMode } from '../../../components/common/ViewModeToggle';
import { MenuIcon } from '../../../components/icons/WebMirrorIcons';
import { ScreenScaffold } from '../../../components/navigation/ScreenScaffold';
import { STUDIO_TOOLS } from '../../../components/tools/toolsConfig';
import { useOpenRecentItem, useRecentActivity } from '../../../hooks/useRecentActivity';
import { useTabNavigationSwipe } from '../../../hooks/useTabSwipe';
import { spacing, borderRadius, lightTheme, darkTheme, BODY_FONT } from '../../../theme';
import { FLOATING_TAB_BAR_HEIGHT } from '../../../theme/layout';
import { getSurfaceFab, getToolTheme } from '../../../theme/toolTheme';

const SECTION_LIMIT = 6;

/**
 * The Studio tab — what the user has made with Vorlagen, KI-Bild and Reel, in one
 * section per media kind, filtered out of the shared `/recent-activity` feed.
 * Creating is the FAB's job: the three studio tools are a create menu rather than
 * a tile grid, so the page leads with content instead of entry points.
 */
export default function StudioScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const fabTone = getSurfaceFab('studio', isDark);
  const { items, isLoading } = useRecentActivity();
  const openItem = useOpenRecentItem();
  const [createOpen, setCreateOpen] = useState(false);

  const { reels, images } = useMemo(
    () => ({
      reels: items.filter((item) => item.type === 'video').slice(0, SECTION_LIMIT),
      images: items.filter((item) => item.type === 'image').slice(0, SECTION_LIMIT),
    }),
    [items]
  );

  const swipe = useTabNavigationSwipe('/(tabs)/(studio)');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  return (
    <ScreenScaffold
      title="Studio"
      backdrop={<StudioGradientBackground />}
      headerRight={<ViewModeToggle mode={viewMode} onChange={setViewMode} />}
    >
      <GestureDetector gesture={swipe}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + FLOATING_TAB_BAR_HEIGHT + spacing.xxlarge },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Each section borrows the hue of the tool that produced it, so nothing on
            this page falls back to the app green. */}
          <RecentItemsSection
            title="Reels"
            items={reels}
            isLoading={isLoading}
            accent={getToolTheme('reel', isDark).icon}
            style={styles.section}
            viewMode={viewMode}
            onOpen={openItem}
          />
          <RecentItemsSection
            title="KI-Bilder"
            items={images}
            isLoading={isLoading}
            accent={getToolTheme('ki-bildgenerierung', isDark).icon}
            style={styles.section}
            viewMode={viewMode}
            onOpen={openItem}
          />
        </ScrollView>
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
  content: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.small,
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

import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter, type Href } from 'expo-router';
import { View, Text, StyleSheet, Pressable, ScrollView, useColorScheme } from 'react-native';

import { useLayout } from '../../hooks/useLayout';
import { useToolFavoritesStore } from '../../stores/toolFavoritesStore';
import { spacing, borderRadius, colors, BODY_FONT } from '../../theme';
import { gridColumns } from '../../theme/layout';
import { getToolTheme } from '../../theme/toolTheme';
import { MenuIcon } from '../icons/WebMirrorIcons';

import { type ToolDef } from './toolsConfig';

const GAP = spacing.small;

/**
 * Smallest a tile may get before a column is dropped. 160 is what a phone
 * already draws (two columns of ~154 at 360dp), so the phone keeps exactly its
 * current field and every wider window gets more of the same tile rather than
 * the same count of bigger ones.
 */
const MIN_TILE = 160;

/**
 * Tiles in view at once in the `row` layout. The half tile at the edge is the
 * affordance: it says "there is more this way" without an arrow or dots.
 */
const ROW_VISIBLE = 2.5;

/**
 * Coloured square tool tiles — the mobile port of web's Arbeiten tiles
 * (`OfficeTile` in `features/workplace/components/ToolsSection.tsx`): a pastel
 * field per tool from the shared hue registry, icon pinned to the top, title and
 * description pinned to the bottom, favourite star top-right.
 *
 * Tile size is computed rather than expressed in percentages: React Native has no
 * `calc()`, so `width: '48%'` plus a gap overflows the row. `availableWidth` is
 * the room the parent has already made — it used to be the padding to subtract
 * instead, which meant every caller had to restate the screen edge and a caller
 * inside a capped column had no way to say so at all.
 *
 * `row` lays the tiles out as one horizontal strip, sized so two and a half are
 * in view, running out to the screen edge (the workplace Arbeiten tab). Never
 * larger than a grid tile, so on a tablet the whole row simply fits.
 *
 * Inside the workplace pager the strip is a nested horizontal scroller, and the
 * platform settles who moves: the strip scrolls first, and a drag that starts
 * where it cannot scroll any further goes to the pager. `bounces={false}` is
 * what lets iOS hand over at the edge — a bouncing strip would keep the drag.
 */
export function ToolSquareGrid({
  tools,
  availableWidth,
  row = false,
}: {
  tools: ToolDef[];
  availableWidth?: number;
  row?: boolean;
}) {
  const isDark = useColorScheme() === 'dark';
  const { contentWidth, edge } = useLayout();
  const router = useRouter();
  const favorites = useToolFavoritesStore((s) => s.favorites);
  const toggleFavorite = useToolFavoritesStore((s) => s.toggleFavorite);

  const room = availableWidth ?? contentWidth;
  const columns = gridColumns(room, MIN_TILE, GAP);
  const tileSize = row
    ? Math.min(Math.floor((room - GAP * Math.floor(ROW_VISIBLE)) / ROW_VISIBLE), MIN_TILE)
    : Math.floor((room - GAP * (columns - 1)) / columns);

  const tiles = tools.map((tool) => {
    const tone = getToolTheme(tool.id, isDark);
    const isFavorite = favorites.includes(tool.id);
    return (
      <View key={tool.id} style={{ width: tileSize, height: tileSize }}>
        <Pressable
          onPress={() => router.push(tool.route as Href)}
          style={({ pressed }) => [
            styles.tile,
            {
              backgroundColor: tone.tile,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            },
          ]}
          accessibilityRole="button"
        >
          <MenuIcon name={tool.icon} size={28} color={tone.icon} />
          <View style={styles.caption}>
            <Text style={[styles.title, { color: tone.title }]} numberOfLines={2}>
              {tool.title}
            </Text>
            <Text style={[styles.desc, { color: tone.desc }]} numberOfLines={2}>
              {tool.description}
            </Text>
          </View>
        </Pressable>
        {/* Outside the Pressable: a nested pressable inside a pressable
                swallows the outer press on Android. */}
        <Pressable
          onPress={() => toggleFavorite(tool.id)}
          hitSlop={10}
          style={styles.star}
          accessibilityRole="button"
          accessibilityLabel={
            isFavorite ? `${tool.title} nicht mehr favorisieren` : `${tool.title} favorisieren`
          }
        >
          <Ionicons
            name={isFavorite ? 'star' : 'star-outline'}
            size={16}
            color={isFavorite ? colors.secondary[500] : tone.desc}
          />
        </Pressable>
      </View>
    );
  });

  if (row) {
    return (
      // Out to the screen edge, so the cut-off tile ends where the screen does
      // rather than at the column's padding.
      <ScrollView
        horizontal
        bounces={false}
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -edge }}
        contentContainerStyle={[styles.row, { paddingHorizontal: edge }]}
      >
        {tiles}
      </ScrollView>
    );
  }

  return <View style={styles.grid}>{tiles}</View>;
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  row: {
    gap: GAP,
  },
  tile: {
    flex: 1,
    justifyContent: 'space-between',
    borderRadius: borderRadius.xlarge,
    padding: spacing.small,
  },
  caption: {
    gap: 2,
  },
  title: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 17,
    lineHeight: 21,
  },
  desc: {
    fontFamily: BODY_FONT,
    fontSize: 12.5,
    lineHeight: 16,
  },
  star: {
    position: 'absolute',
    top: spacing.small,
    right: spacing.small,
    padding: 2,
  },
});

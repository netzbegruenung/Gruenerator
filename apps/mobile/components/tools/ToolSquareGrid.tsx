import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter, type Href } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';

import { useIsTablet } from '../../hooks/useIsTablet';
import { useToolFavoritesStore } from '../../stores/toolFavoritesStore';
import { spacing, borderRadius, colors, BODY_FONT } from '../../theme';
import { getToolTheme } from '../../theme/toolTheme';

import { type ToolDef } from './toolsConfig';

const GAP = spacing.small;

/**
 * Coloured square tool tiles — the mobile port of web's Arbeiten tiles
 * (`OfficeTile` in `features/workplace/components/ToolsSection.tsx`): a pastel
 * field per tool from the shared hue registry, icon pinned to the top, title and
 * description pinned to the bottom, favourite star top-right.
 *
 * Tile size is computed rather than expressed in percentages: React Native has no
 * `calc()`, so `width: '48%'` plus a gap overflows the row. `horizontalPadding` is
 * whatever the parent already pads with — pass it or the last column clips.
 */
export function ToolSquareGrid({
  tools,
  horizontalPadding = spacing.medium * 2,
}: {
  tools: ToolDef[];
  horizontalPadding?: number;
}) {
  const isDark = useColorScheme() === 'dark';
  const isTablet = useIsTablet();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const favorites = useToolFavoritesStore((s) => s.favorites);
  const toggleFavorite = useToolFavoritesStore((s) => s.toggleFavorite);

  const columns = isTablet ? 3 : 2;
  const tileSize = Math.floor((width - horizontalPadding - GAP * (columns - 1)) / columns);

  return (
    <View style={styles.grid}>
      {tools.map((tool) => {
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
            >
              <Ionicons name={tool.icon} size={28} color={tone.icon} />
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
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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

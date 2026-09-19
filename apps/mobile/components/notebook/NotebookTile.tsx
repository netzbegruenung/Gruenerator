import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { memo, useMemo, type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme, type ViewStyle } from 'react-native';

import { useLayout } from '../../hooks/useLayout';
import { colors, spacing, borderRadius, lightTheme, darkTheme, BODY_FONT } from '../../theme';
import { gridColumns } from '../../theme/layout';

/**
 * Notebook gallery tile — the mobile port of web's `NotebookGalleryCard`.
 *
 * A notebook with a branded cover renders as the bare 1:1 image: its title is
 * part of the artwork, so a footer would print it twice. `coverNode` is the same
 * deal for a notebook whose cover is drawn rather than shipped (a user's own, a
 * community one — see `NotebookCoverArt`). Everything else keeps a ghost-icon
 * preview above a title/meta footer, which is what makes a mixed section still
 * line up as one grid.
 */
export const NotebookTile = memo(function NotebookTile({
  title,
  meta,
  icon,
  cover,
  coverNode,
  overlay,
  size,
  onPress,
  onLongPress,
}: {
  title: string;
  meta?: string;
  icon: IoniconsIconName;
  /** Metro image module from `config/notebookCovers`. */
  cover?: number | null;
  /** Drawn cover for a notebook that has no shipped webp. Ignored when `cover` is set. */
  coverNode?: ReactNode;
  /** Control pinned to the top-right corner, e.g. a like button. Its own presses do not reach the tile. */
  overlay?: ReactNode;
  /** Edge length of the tile, computed by the grid. */
  size: number;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.tile,
        {
          width: size,
          backgroundColor: theme.card,
          borderColor: theme.cardBorder,
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      {cover ? (
        <Image
          source={cover}
          style={{ width: size, height: size }}
          contentFit="cover"
          // The covers are bundled, so there is nothing to download — but
          // expo-image's default `disk` policy still re-decodes all eleven from
          // storage every time this gallery remounts, which is every switch back
          // to the Wissen tab. The memory cache is a hint rather than a promise
          // (expo-image purges it aggressively under pressure), and the tiles are
          // decoded at view size, so the ceiling is single-digit megabytes.
          cachePolicy="memory-disk"
        />
      ) : coverNode ? (
        coverNode
      ) : (
        <>
          <View
            style={[
              styles.iconPreview,
              { height: Math.round(size * 0.8), backgroundColor: theme.surface },
            ]}
          >
            <Ionicons name={icon} size={32} color={isDark ? colors.grey[500] : colors.grey[400]} />
          </View>
          <View style={[styles.footer, { borderTopColor: theme.cardBorder }]}>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
              {title}
            </Text>
            {meta ? (
              <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
          </View>
        </>
      )}
      {overlay ? <View style={styles.overlay}>{overlay}</View> : null}
    </Pressable>
  );
});

const GAP = spacing.small;
/**
 * Smallest a notebook tile may get before a column is dropped — what a phone
 * already draws at two columns.
 */
const MIN_TILE = 160;

/**
 * The one tile geometry for the whole Wissen gallery. Every shelf — the system
 * sections, "Meine Notebooks", "Von der Basis" — reads its tile size here, which
 * is what keeps them a single grid down the page rather than three that happen
 * to agree today.
 */
export function useNotebookTileGrid(): { size: number } {
  const { gridWidth } = useLayout();

  return useMemo(() => {
    const columns = gridColumns(gridWidth, MIN_TILE, GAP);
    return { size: Math.floor((gridWidth - GAP * (columns - 1)) / columns) };
  }, [gridWidth]);
}

/** Wrapper style for a shelf of tiles — spread on the `View` around them. */
export const notebookTileGridStyle: ViewStyle = {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: GAP,
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: spacing.xxsmall,
    right: spacing.xxsmall,
  },
  tile: {
    borderRadius: borderRadius.large,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  iconPreview: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xsmall,
    paddingVertical: spacing.xsmall,
  },
  title: {
    fontFamily: 'Raleway_600SemiBold',
    fontSize: 13,
    lineHeight: 17,
  },
  meta: {
    fontFamily: BODY_FONT,
    fontSize: 11,
    marginTop: 1,
  },
});

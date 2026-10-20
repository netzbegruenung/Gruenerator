import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useMemo, type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme, type ViewStyle } from 'react-native';

import { useLayout } from '../../hooks/useLayout';
import { spacing, borderRadius, BODY_FONT, HEADING_FONT_BOLD } from '../../theme';
import { gridColumns } from '../../theme/layout';
import { getToolTheme } from '../../theme/toolTheme';

/**
 * Notebook gallery tile — the mobile port of web's `NotebookGalleryCard`.
 *
 * Three looks, one square: a `photo` (a Landesverband's Marktplatz picture)
 * with the title on a dark gradient; a drawn `coverNode` for a notebook of a
 * person (see `NotebookCoverArt`); otherwise the coloured tool tile — icon on
 * top, title and meta below — in the Wissen tone, with its own dark pair.
 */
export const NotebookTile = memo(function NotebookTile({
  title,
  meta,
  icon,
  photo,
  coverNode,
  overlay,
  size,
  onPress,
  onLongPress,
}: {
  title: string;
  meta?: string;
  icon: IoniconsIconName;
  /** Bundled photo (Metro image module); the title is drawn over it. */
  photo?: number | null;
  /** Drawn cover for a notebook of a person. Ignored when `photo` is set. */
  coverNode?: ReactNode;
  /** Control pinned to the top-right corner, e.g. a like button. Its own presses do not reach the tile. */
  overlay?: ReactNode;
  /** Edge length of the tile, computed by the grid. */
  size: number;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const tone = getToolTheme('notebooks', useColorScheme() === 'dark');

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={meta && !photo ? `${title}, ${meta}` : title}
      style={({ pressed }) => [
        styles.tile,
        {
          width: size,
          height: size,
          backgroundColor: tone.tile,
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      {photo ? (
        <>
          <Image
            source={photo}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.82)']}
            locations={[0.42, 0.72, 1]}
            style={StyleSheet.absoluteFill}
          />
          <Text style={[styles.title, styles.photoTitle]} numberOfLines={2}>
            {title}
          </Text>
        </>
      ) : coverNode ? (
        coverNode
      ) : (
        <View style={styles.toolBody}>
          <Ionicons name={icon} size={26} color={tone.icon} />
          <View>
            <Text style={[styles.title, { color: tone.title }]} numberOfLines={3}>
              {title}
            </Text>
            {meta ? (
              <Text style={[styles.meta, { color: tone.desc }]} numberOfLines={3}>
                {meta}
              </Text>
            ) : null}
          </View>
        </View>
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
 * sections, "Meine Notebooks", „Öffentlich" — reads its tile size here, which
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
    overflow: 'hidden',
  },
  toolBody: {
    flex: 1,
    justifyContent: 'space-between',
    padding: spacing.medium,
  },
  title: {
    fontFamily: HEADING_FONT_BOLD,
    fontSize: 16,
    lineHeight: 19,
  },
  photoTitle: {
    position: 'absolute',
    left: spacing.medium,
    right: spacing.medium,
    bottom: spacing.medium,
    color: '#FFFFFF',
  },
  meta: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
});

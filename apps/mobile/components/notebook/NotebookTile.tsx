import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';

import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';

/**
 * Notebook gallery tile — the mobile port of web's `NotebookGalleryCard`.
 *
 * A notebook with a branded cover renders as the bare 1:1 image: its title is
 * part of the artwork, so a footer would print it twice. Everything else keeps a
 * ghost-icon preview above a title/meta footer, which is what makes a mixed
 * section still line up as one grid.
 */
export function NotebookTile({
  title,
  meta,
  icon,
  cover,
  size,
  onPress,
  onLongPress,
}: {
  title: string;
  meta?: string;
  icon: IoniconsIconName;
  /** Metro image module from `config/notebookCovers`. */
  cover?: number | null;
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
        <Image source={cover} style={{ width: size, height: size }} contentFit="cover" />
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 11,
    marginTop: 1,
  },
});

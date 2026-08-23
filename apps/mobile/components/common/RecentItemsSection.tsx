import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useLayout } from '../../hooks/useLayout';
import { type RecentItem, type RecentItemType } from '../../hooks/useRecentActivity';
import { resolveWebUrl } from '../../services/webOrigin';
import { colors, spacing, borderRadius, lightTheme, darkTheme, BODY_FONT } from '../../theme';
import { gridColumns } from '../../theme/layout';

import { DocPreview } from './DocPreview';
import { SkeletonRows, SkeletonTiles } from './Skeleton';
import { type ViewMode } from './ViewModeToggle';

const GAP = spacing.small;

/**
 * Smallest a recent-activity card may get before a column is dropped. Matches
 * what a phone already draws at two columns, so the floor of 2 in `gridColumns`
 * leaves the phone untouched.
 */
const MIN_CARD = 160;
const dateFormat: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };

const TYPE_ICONS: Record<RecentItemType, IoniconsIconName> = {
  doc: 'document-text-outline',
  board: 'grid-outline',
  image: 'image-outline',
  video: 'videocam-outline',
  presentation: 'easel-outline',
  canvas: 'image-outline',
};

const FALLBACK_TITLES: Record<RecentItemType, string> = {
  doc: 'Unbenanntes Dokument',
  board: 'Unbenanntes Board',
  image: 'Ohne Titel',
  video: 'Ohne Titel',
  presentation: 'Neue Präsentation',
  canvas: 'Neuer Canvas',
};

/**
 * A titled section of `/recent-activity` items — the Studio tab renders one
 * instance per media kind. Renders nothing once loading has finished with an
 * empty list, so a section never sits on the page as a bare heading.
 *
 * `viewMode` picks the layout, driven by the switch in the header bar: `grid` is
 * cards with a 4:3 thumbnail, `list` is one row per item. The list keeps the
 * thumbnail — for reels and generated images the picture IS the title, and a row
 * of identical "Ohne Titel" strings would be unusable.
 */
export function RecentItemsSection({
  title,
  items,
  isLoading = false,
  accent = colors.primary[600],
  style,
  viewMode = 'grid',
  onOpen,
}: {
  title: string;
  items: RecentItem[];
  isLoading?: boolean;
  /** Hue for the thumbnail placeholders — pass the tab's own. */
  accent?: string;
  style?: StyleProp<ViewStyle>;
  viewMode?: ViewMode;
  onOpen: (item: RecentItem) => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const { gridWidth } = useLayout();
  const [failedThumbs, setFailedThumbs] = useState<Set<string>>(new Set());

  // Percentages ('48%' / '31%') could not express a gap, so the count was picked
  // by device class and the card took whatever was left — 317dp on an iPad.
  const columns = gridColumns(gridWidth, MIN_CARD, GAP);
  const cardWidth = Math.floor((gridWidth - GAP * (columns - 1)) / columns);

  const isList = viewMode === 'list';

  // The view mode is already decided when the items are still on their way, and
  // so is `cardWidth` — so the placeholder can be the real arrangement: the
  // 4:3 cards at their measured width, or the 48-dp rows of the list.
  if (isLoading) {
    return (
      <View style={[styles.section, style]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
        {isList ? (
          <SkeletonRows count={4} leading={48} gap={spacing.xxsmall} />
        ) : (
          <SkeletonTiles
            count={columns * 2}
            itemWidth={cardWidth}
            columns={columns}
            gap={GAP}
            aspectRatio={4 / 3}
            radius={borderRadius.large}
            caption
          />
        )}
      </View>
    );
  }

  if (items.length === 0) return null;

  return (
    <View style={[styles.section, style]}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <View style={isList ? styles.list : styles.grid}>
        {items.map((item) => {
          const key = `${item.type}-${item.id}`;
          const thumbUri = resolveWebUrl(item.thumbnailUrl) ?? null;
          const hasThumb =
            !!thumbUri &&
            (item.type === 'image' || item.type === 'video' || item.type === 'canvas') &&
            !failedThumbs.has(key);
          const docContent = item.type === 'doc' && item.content ? item.content : null;
          const thumbStyle = isList ? styles.rowThumb : styles.thumb;
          const thumbnail =
            hasThumb && thumbUri ? (
              <Image
                source={{ uri: thumbUri }}
                style={thumbStyle}
                contentFit="cover"
                onError={() => setFailedThumbs((prev) => new Set(prev).add(key))}
              />
            ) : docContent ? (
              <DocPreview content={docContent} style={thumbStyle} />
            ) : (
              <View
                style={[thumbStyle, styles.thumbPlaceholder, { backgroundColor: theme.surface }]}
              >
                <Ionicons name={TYPE_ICONS[item.type]} size={isList ? 20 : 24} color={accent} />
              </View>
            );
          const label = (
            <>
              <Text
                style={[styles.cardTitle, { color: theme.text }]}
                numberOfLines={isList ? 1 : 2}
              >
                {item.title || FALLBACK_TITLES[item.type]}
              </Text>
              <Text style={[styles.cardMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                {item.accessType && item.accessType !== 'owner' && item.creatorName
                  ? `Von ${item.creatorName} · `
                  : ''}
                {new Date(item.date).toLocaleDateString('de-DE', dateFormat)}
              </Text>
            </>
          );

          return isList ? (
            <Pressable
              key={key}
              onPress={() => onOpen(item)}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? theme.surface : 'transparent' },
              ]}
              accessibilityRole="button"
            >
              {thumbnail}
              <View style={styles.rowBody}>{label}</View>
            </Pressable>
          ) : (
            <Pressable
              key={key}
              onPress={() => onOpen(item)}
              style={({ pressed }) => [
                styles.card,
                { width: cardWidth },
                {
                  backgroundColor: pressed ? theme.surface : theme.card,
                  borderColor: theme.cardBorder,
                },
              ]}
              accessibilityRole="button"
            >
              {thumbnail}
              <View style={styles.cardBody}>{label}</View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.small,
  },
  sectionTitle: {
    fontFamily: BODY_FONT,
    fontSize: 16,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  // No card chrome in list mode: a border around every full-width row turns the
  // section into a stack of boxes. The thumbnail carries the separation.
  list: {
    gap: spacing.xxsmall,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.xsmall,
    borderRadius: borderRadius.medium,
  },
  rowThumb: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.medium,
    overflow: 'hidden',
  },
  rowBody: {
    flex: 1,
    gap: spacing.xxsmall,
  },
  card: {
    // Deliberately not flexGrow: an odd item at the end of a row would stretch to
    // full width and render a half-screen-tall 4:3 thumbnail.
    borderRadius: borderRadius.large,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    aspectRatio: 4 / 3,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: spacing.small,
    gap: spacing.xxsmall,
  },
  cardTitle: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    fontWeight: '600',
  },
  cardMeta: {
    fontFamily: BODY_FONT,
    fontSize: 11,
  },
});

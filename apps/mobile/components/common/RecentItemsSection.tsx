import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { useState, type ReactElement } from 'react';
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
import { BoardPreviewBody, SlidesPreviewBody, TablePreviewBody } from './SchematicPreviews';
import { SkeletonRows, SkeletonTiles } from './Skeleton';
import { type ViewMode } from './ViewModeToggle';

const GAP = spacing.small;

/**
 * Smallest a recent-activity card may get before a column is dropped. Matches
 * what a phone already draws at two columns, so the floor of 2 in `gridColumns`
 * leaves the phone untouched.
 */
const MIN_CARD = 160;

/** How many recent-activity cards fit side by side in this window. */
export function useRecentCardColumns(): number {
  const { gridWidth } = useLayout();
  return gridColumns(gridWidth, MIN_CARD, GAP);
}
// Sheets and presentations arrive from `/recent-activity` as `type: 'doc'`; the
// Arbeiten sections send presentations as their own type. Same rule as web's
// RecentlyCreatedSection.
const isTable = (item: RecentItem): boolean =>
  item.type === 'doc' && (item.documentType === 'tabelle' || item.documentType === 'sheets');
const isSlides = (item: RecentItem): boolean =>
  item.type === 'presentation' || (item.type === 'doc' && item.documentType === 'presentations');

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
  headerRight,
  onActions,
}: {
  title: string;
  items: RecentItem[];
  isLoading?: boolean;
  /** Hue for the thumbnail placeholders — pass the tab's own. */
  accent?: string;
  style?: StyleProp<ViewStyle>;
  viewMode?: ViewMode;
  onOpen: (item: RecentItem) => void;
  /** A control at the right end of the heading (Arbeiten: the grid/list switch). */
  headerRight?: ReactElement;
  /**
   * Adds a ⋮ button to every item — Arbeiten's share/delete menu for documents.
   * It is a sibling of the card, not a child: a pressable inside a pressable
   * swallows the outer press on Android.
   */
  onActions?: (item: RecentItem) => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const { gridWidth } = useLayout();
  const [failedThumbs, setFailedThumbs] = useState<Set<string>>(new Set());

  // Percentages ('48%' / '31%') could not express a gap, so the count was picked
  // by device class and the card took whatever was left — 317dp on an iPad.
  const columns = useRecentCardColumns();
  const cardWidth = Math.floor((gridWidth - GAP * (columns - 1)) / columns);

  const isList = viewMode === 'list';

  // The view mode is already decided when the items are still on their way, and
  // so is `cardWidth` — so the placeholder can be the real arrangement: the
  // 4:3 cards at their measured width, or the 48-dp rows of the list.
  const heading = (
    <View style={styles.header}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      {headerRight}
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.section, style]}>
        {heading}
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
      {heading}
      <View style={isList ? styles.list : styles.grid}>
        {items.map((item) => {
          const key = `${item.type}-${item.id}`;
          const thumbUri = resolveWebUrl(item.thumbnailUrl) ?? null;
          const hasThumb =
            !!thumbUri &&
            (item.type === 'image' || item.type === 'video' || item.type === 'canvas') &&
            !failedThumbs.has(key);
          const docContent =
            item.type === 'doc' && !isTable(item) && !isSlides(item) && item.content
              ? item.content
              : null;
          const thumbStyle = isList ? styles.rowThumb : styles.thumb;
          // Columns, rows and slide titles are unreadable in a 48-dp row
          // thumbnail; the list keeps the type icon for them.
          const schematic = isList ? null : item.type === 'board' ? (
            <BoardPreviewBody
              boardType={item.boardType}
              preview={item.preview}
              style={thumbStyle}
            />
          ) : isTable(item) ? (
            <TablePreviewBody content={item.content} style={thumbStyle} />
          ) : isSlides(item) ? (
            <SlidesPreviewBody content={item.content} style={thumbStyle} />
          ) : null;
          const thumbnail =
            hasThumb && thumbUri ? (
              <Image
                source={{ uri: thumbUri }}
                style={thumbStyle}
                contentFit="cover"
                // expo-image defaults to `disk`, which re-reads and re-decodes
                // every tile from storage each time this section remounts — and
                // it remounts on every switch back to the Studio tab. The tiles
                // are 400px WebP, so holding them in memory as well is cheap.
                cachePolicy="memory-disk"
                // Drawn from `image_metadata.blurhash` where the API has one, so
                // a tile whose bytes are still in flight shows the picture's
                // colours rather than an empty plate.
                placeholder={item.blurhash ? { blurhash: item.blurhash } : undefined}
                transition={200}
                onError={() => setFailedThumbs((prev) => new Set(prev).add(key))}
              />
            ) : schematic ? (
              schematic
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

          const actions = onActions ? (
            <Pressable
              onPress={() => onActions(item)}
              hitSlop={8}
              style={isList ? styles.rowActions : styles.cardActions}
              accessibilityRole="button"
              accessibilityLabel="Weitere Optionen"
            >
              <Ionicons name="ellipsis-vertical" size={16} color={theme.textSecondary} />
            </Pressable>
          ) : null;

          return isList ? (
            <View key={key} style={styles.itemWrap}>
              <Pressable
                onPress={() => onOpen(item)}
                style={({ pressed }) => [
                  styles.row,
                  actions && styles.rowWithActions,
                  { backgroundColor: pressed ? theme.surface : 'transparent' },
                ]}
                accessibilityRole="button"
              >
                {thumbnail}
                <View style={styles.rowBody}>{label}</View>
              </Pressable>
              {actions}
            </View>
          ) : (
            <View key={key} style={[styles.itemWrap, { width: cardWidth }]}>
              <Pressable
                onPress={() => onOpen(item)}
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: pressed ? theme.surface : theme.card,
                    borderColor: theme.cardBorder,
                  },
                ]}
                accessibilityRole="button"
              >
                {thumbnail}
                <View style={[styles.cardBody, actions && styles.cardBodyWithActions]}>
                  {label}
                </View>
              </Pressable>
              {actions}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  itemWrap: {
    position: 'relative',
  },
  // Level with the title in the card's caption, clear of the thumbnail.
  cardActions: {
    position: 'absolute',
    right: spacing.xxsmall,
    bottom: spacing.small,
    padding: spacing.xxsmall,
  },
  cardBodyWithActions: {
    paddingRight: spacing.large,
  },
  rowActions: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: spacing.xsmall,
  },
  rowWithActions: {
    paddingRight: spacing.xlarge,
  },
  section: {
    gap: spacing.small,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    // Fills the wrapper's height, which the row stretches to its tallest card —
    // a two-line title next to a one-line one would otherwise end the row ragged.
    // The width stays fixed on the wrapper, so an odd last card does not widen.
    flexGrow: 1,
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

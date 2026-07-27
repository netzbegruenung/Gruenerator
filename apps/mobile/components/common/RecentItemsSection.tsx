import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useIsTablet } from '../../hooks/useIsTablet';
import { type RecentItem, type RecentItemType } from '../../hooks/useRecentActivity';
import { colors, spacing, borderRadius, lightTheme, darkTheme, BODY_FONT } from '../../theme';

import { DocPreview } from './DocPreview';

const WEB_ORIGIN = 'https://gruenerator.eu';
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
 * A titled grid of `/recent-activity` items — the Studio tab renders one instance
 * per media kind. Renders nothing once loading has finished with an empty list, so
 * a section never sits on the page as a bare heading.
 */
export function RecentItemsSection({
  title,
  items,
  isLoading = false,
  accent = colors.primary[600],
  style,
  onOpen,
}: {
  title: string;
  items: RecentItem[];
  isLoading?: boolean;
  /** Hue for the thumbnail placeholders and the spinner — pass the tab's own. */
  accent?: string;
  style?: StyleProp<ViewStyle>;
  onOpen: (item: RecentItem) => void;
}) {
  const isDark = useColorScheme() === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const isTablet = useIsTablet();
  const [failedThumbs, setFailedThumbs] = useState<Set<string>>(new Set());

  if (isLoading) {
    return (
      <View style={[styles.section, style]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
        <View style={styles.loadingRow}>
          <ActivityIndicator color={accent} />
        </View>
      </View>
    );
  }

  if (items.length === 0) return null;

  return (
    <View style={[styles.section, style]}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <View style={styles.grid}>
        {items.map((item) => {
          const key = `${item.type}-${item.id}`;
          // The backend returns an origin-relative thumbnail path (e.g.
          // /api/share/<token>/thumbnail). That resolves against the origin on web,
          // but mobile has no base origin — prefix WEB_ORIGIN so <Image> can load it.
          const thumbUri = item.thumbnailUrl
            ? item.thumbnailUrl.startsWith('http')
              ? item.thumbnailUrl
              : `${WEB_ORIGIN}${item.thumbnailUrl}`
            : null;
          const hasThumb =
            !!thumbUri &&
            (item.type === 'image' || item.type === 'video' || item.type === 'canvas') &&
            !failedThumbs.has(key);
          const docContent = item.type === 'doc' && item.content ? item.content : null;
          return (
            <Pressable
              key={key}
              onPress={() => onOpen(item)}
              style={({ pressed }) => [
                styles.card,
                { width: isTablet ? '31%' : '48%' },
                {
                  backgroundColor: pressed ? theme.surface : theme.card,
                  borderColor: theme.cardBorder,
                },
              ]}
            >
              {hasThumb && thumbUri ? (
                <Image
                  source={{ uri: thumbUri }}
                  style={styles.thumb}
                  contentFit="cover"
                  onError={() => setFailedThumbs((prev) => new Set(prev).add(key))}
                />
              ) : docContent ? (
                <DocPreview content={docContent} style={styles.thumb} />
              ) : (
                <View
                  style={[
                    styles.thumb,
                    styles.thumbPlaceholder,
                    { backgroundColor: theme.surface },
                  ]}
                >
                  <Ionicons name={TYPE_ICONS[item.type]} size={24} color={accent} />
                </View>
              )}
              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
                  {item.title || FALLBACK_TITLES[item.type]}
                </Text>
                <Text style={[styles.cardMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                  {item.accessType && item.accessType !== 'owner' && item.creatorName
                    ? `Von ${item.creatorName} · `
                    : ''}
                  {new Date(item.date).toLocaleDateString('de-DE', dateFormat)}
                </Text>
              </View>
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
  loadingRow: {
    paddingVertical: spacing.large,
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.small,
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

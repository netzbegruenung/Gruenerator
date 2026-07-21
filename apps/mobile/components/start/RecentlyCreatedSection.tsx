import { getGlobalApiClient } from '@gruenerator/shared/api';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { memo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Linking } from 'react-native';

import { useIsTablet } from '../../hooks/useIsTablet';
import { colors, spacing, borderRadius, type Theme } from '../../theme';
import { DocPreview } from '../common/DocPreview';

const WEB_ORIGIN = 'https://gruenerator.eu';
const dateFormat: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };

type RecentItemType = 'doc' | 'board' | 'image' | 'video' | 'presentation' | 'canvas';

interface RecentItem {
  id: string;
  title: string;
  date: string;
  type: RecentItemType;
  href: string;
  thumbnailUrl?: string;
  content?: string;
  documentType?: string;
  creatorName?: string;
  accessType?: string;
}

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

const fetchRecentActivity = async (): Promise<RecentItem[]> => {
  const res = await getGlobalApiClient().get<{ items?: RecentItem[] }>('/recent-activity', {
    params: { limit: 12 },
  });
  return res.data?.items ?? [];
};

export const RecentlyCreatedSection = memo(({ theme }: { theme: Theme }) => {
  const router = useRouter();
  const isTablet = useIsTablet();
  const [failedThumbs, setFailedThumbs] = useState<Set<string>>(new Set());

  const { data: allItems = [], isLoading } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: fetchRecentActivity,
    staleTime: 30_000,
  });

  // Boards have their own section on the start page.
  const items = allItems.filter((item) => item.type !== 'board').slice(0, 6);

  const handleOpen = useCallback(
    (item: RecentItem) => {
      if (item.type === 'doc') {
        router.push({ pathname: '/(fullscreen)/doc-editor', params: { id: item.id } } as Href);
        return;
      }
      // Image shares (item.id is the share_token) open in the in-app viewer, which
      // downloads the media, previews it, and offers save-to-gallery + native share —
      // rather than bouncing to the web share link in an external browser.
      if (item.type === 'image') {
        router.push({
          pathname: '/(fullscreen)/pushed-content',
          params: { shareToken: item.id, mediaType: 'image', title: item.title },
        } as Href);
        return;
      }
      void Linking.openURL(`${WEB_ORIGIN}${item.href}`);
    },
    [router]
  );

  if (isLoading) {
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Zuletzt</Text>
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary[600]} />
        </View>
      </View>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>Zuletzt</Text>
      <View style={styles.grid}>
        {items.map((item) => {
          const key = `${item.type}-${item.id}`;
          // Backend returns an origin-relative thumbnail path (e.g.
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
              onPress={() => handleOpen(item)}
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
                  <Ionicons name={TYPE_ICONS[item.type]} size={24} color={colors.primary[600]} />
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
});
RecentlyCreatedSection.displayName = 'RecentlyCreatedSection';

const styles = StyleSheet.create({
  section: {
    paddingTop: spacing.xlarge,
    paddingHorizontal: spacing.medium,
    gap: spacing.small,
  },
  sectionTitle: {
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
    fontSize: 14,
    fontWeight: '600',
  },
  cardMeta: {
    fontSize: 11,
  },
});

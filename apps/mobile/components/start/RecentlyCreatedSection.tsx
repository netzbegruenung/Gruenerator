import { getGlobalApiClient } from '@gruenerator/shared/api';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { memo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Linking } from 'react-native';

import { colors, spacing, borderRadius, type Theme } from '../../theme';

const WEB_ORIGIN = 'https://gruenerator.eu';
const dateFormat: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };

type RecentItemType = 'doc' | 'board' | 'image' | 'video' | 'text' | 'presentation';

interface RecentItem {
  id: string;
  title: string;
  date: string;
  type: RecentItemType;
  href: string;
  thumbnailUrl?: string;
  documentType?: string;
  creatorName?: string;
  accessType?: string;
}

const TYPE_ICONS: Record<RecentItemType, IoniconsIconName> = {
  doc: 'document-text-outline',
  board: 'grid-outline',
  image: 'image-outline',
  video: 'videocam-outline',
  text: 'create-outline',
  presentation: 'easel-outline',
};

const FALLBACK_TITLES: Record<RecentItemType, string> = {
  doc: 'Unbenanntes Dokument',
  board: 'Unbenanntes Board',
  image: 'Ohne Titel',
  video: 'Ohne Titel',
  text: 'Ohne Titel',
  presentation: 'Neue Präsentation',
};

const fetchRecentActivity = async (): Promise<RecentItem[]> => {
  const res = await getGlobalApiClient().get<{ items?: RecentItem[] }>('/recent-activity', {
    params: { limit: 12 },
  });
  return res.data?.items ?? [];
};

export const RecentlyCreatedSection = memo(({ theme }: { theme: Theme }) => {
  const router = useRouter();

  const { data: allItems = [], isLoading } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: fetchRecentActivity,
    staleTime: 30_000,
  });

  // Boards have their own section on the start page; text items aren't openable here.
  const items = allItems
    .filter((item) => item.type !== 'text' && item.type !== 'board')
    .slice(0, 10);

  const handleOpen = useCallback(
    (item: RecentItem) => {
      if (item.type === 'doc') {
        router.push({ pathname: '/(fullscreen)/doc-editor', params: { id: item.id } } as Href);
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
          const hasThumb = !!item.thumbnailUrl && (item.type === 'image' || item.type === 'video');
          return (
            <Pressable
              key={`${item.type}-${item.id}`}
              onPress={() => handleOpen(item)}
              style={({ pressed }) => [
                styles.card,
                {
                  backgroundColor: pressed ? theme.surface : theme.card,
                  borderColor: theme.cardBorder,
                },
              ]}
            >
              {hasThumb ? (
                <Image
                  source={{ uri: item.thumbnailUrl }}
                  style={styles.thumb}
                  contentFit="cover"
                />
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
    width: '48%',
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

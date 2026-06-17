import { Ionicons } from '@react-native-vector-icons/ionicons';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';

import {
  useLastAddedDocuments,
  type RecentDocumentCard,
} from '../../hooks/notebook/useLastAddedDocuments';
import { spacing, borderRadius } from '../../theme';
import { formatRelativeDate } from '../../utils/date';

import type { Theme } from '../../theme/colors';

function Card({
  item,
  showSourceLabel,
  theme,
}: {
  item: RecentDocumentCard;
  showSourceLabel: boolean;
  theme: Theme;
}) {
  const dateLabel = item.publishedAt ? formatRelativeDate(item.publishedAt) : null;
  const href = item.url;

  return (
    <Pressable
      onPress={() => {
        if (href) void Linking.openURL(href);
      }}
      disabled={!href}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: pressed ? theme.surface : theme.card,
          borderColor: theme.cardBorder,
        },
      ]}
    >
      <View style={styles.meta}>
        {showSourceLabel && item.collectionName ? (
          <Text style={[styles.source, { color: theme.textGreen }]} numberOfLines={1}>
            {item.collectionName}
          </Text>
        ) : null}
        {showSourceLabel && item.collectionName && dateLabel ? (
          <Text style={[styles.metaDot, { color: theme.textSecondary }]}>·</Text>
        ) : null}
        {dateLabel ? (
          <Text style={[styles.date, { color: theme.textSecondary }]} numberOfLines={1}>
            {dateLabel}
          </Text>
        ) : null}
        {href ? (
          <Ionicons
            name="open-outline"
            size={13}
            color={theme.textSecondary}
            style={styles.linkIcon}
          />
        ) : null}
      </View>
      <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
        {item.title}
      </Text>
      {item.snippet ? (
        <Text style={[styles.snippet, { color: theme.textSecondary }]} numberOfLines={2}>
          {item.snippet}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Most-recently-added documents — mobile port of web's `LastAddedSection`. Stacked
 * single column on phone. Self-hides when there are no items (and for user notebooks,
 * which pass `collectionIds: []`).
 */
export function LastAddedSection({
  collectionIds,
  theme,
  title = 'Zuletzt hinzugefügt',
  limit = 3,
  showSourceLabel,
}: {
  collectionIds: string[];
  theme: Theme;
  title?: string;
  limit?: number;
  showSourceLabel?: boolean;
}) {
  const { data, isLoading } = useLastAddedDocuments({ collectionIds, limit });
  const items = data ?? [];
  const shouldShowSourceLabel = showSourceLabel ?? collectionIds.length > 1;

  // Render nothing until loaded with items — avoids a skeleton flicker in the
  // pre-search hub. Also covers user notebooks (collectionIds: []).
  if (collectionIds.length === 0 || isLoading || items.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <View style={styles.list}>
        {items.map((item) => (
          <Card
            key={item.id}
            item={item}
            showSourceLabel={shouldShowSourceLabel}
            theme={theme}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.small,
  },
  title: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 16,
  },
  list: {
    gap: spacing.small,
  },
  card: {
    gap: spacing.xxsmall,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.large,
    borderWidth: 1,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
  },
  source: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  metaDot: {
    fontSize: 12,
  },
  date: {
    fontSize: 12,
  },
  linkIcon: {
    marginLeft: 'auto',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  snippet: {
    fontSize: 13,
    lineHeight: 18,
  },
});

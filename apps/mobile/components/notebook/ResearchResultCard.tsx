import { Ionicons } from '@react-native-vector-icons/ionicons';
import { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { colors, spacing, typography, borderRadius } from '../../theme';

import type { ResearchResult } from '../../hooks/notebook/useNotebookResearch';
import type { Theme } from '../../theme/colors';

interface Props {
  result: ResearchResult;
  theme: Theme;
  onPress: (result: ResearchResult) => void;
}

const scorePercent = (score: number) => `${Math.round(score * 100)}%`;

const formatDate = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return null;
  }
};

export const ResearchResultCard = memo(function ResearchResultCard({
  result,
  theme,
  onPress,
}: Props) {
  const date = formatDate(result.published_at);

  return (
    <Pressable
      onPress={() => onPress(result)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? theme.surface : theme.card, borderColor: theme.cardBorder },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
          {result.title}
        </Text>
        <View style={[styles.scoreBadge, { backgroundColor: colors.primary[600] + '20' }]}>
          <Text style={[styles.scoreText, { color: colors.primary[600] }]}>
            {scorePercent(result.similarity_score)}
          </Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        {result.collection_name && (
          <View style={[styles.badge, { backgroundColor: theme.surface }]}>
            <Ionicons name="library-outline" size={12} color={theme.textSecondary} />
            <Text style={[styles.badgeText, { color: theme.textSecondary }]} numberOfLines={1}>
              {result.collection_name}
            </Text>
          </View>
        )}
        {date && (
          <View style={[styles.badge, { backgroundColor: theme.surface }]}>
            <Ionicons name="calendar-outline" size={12} color={theme.textSecondary} />
            <Text style={[styles.badgeText, { color: theme.textSecondary }]}>{date}</Text>
          </View>
        )}
        {result.chunk_count != null && result.chunk_count > 1 && (
          <View style={[styles.badge, { backgroundColor: theme.surface }]}>
            <Text style={[styles.badgeText, { color: theme.textSecondary }]}>
              {result.chunk_count} Abschnitte
            </Text>
          </View>
        )}
      </View>

      <Text style={[styles.content, { color: theme.textSecondary }]} numberOfLines={4}>
        {result.relevant_content}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    padding: spacing.medium,
    borderRadius: borderRadius.large,
    borderWidth: 1,
    gap: spacing.xsmall,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.small,
  },
  title: {
    ...typography.bodyBold,
    flex: 1,
  },
  scoreBadge: {
    paddingHorizontal: spacing.xsmall,
    paddingVertical: spacing.xxsmall,
    borderRadius: borderRadius.small,
  },
  scoreText: {
    fontSize: 12,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xsmall,
    paddingVertical: 2,
    borderRadius: borderRadius.small,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  content: {
    ...typography.bodySmall,
    lineHeight: 20,
  },
});

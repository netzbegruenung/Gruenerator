import { formatResearchHitCount } from '@gruenerator/shared/utils';
import { memo } from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';

import { spacing, typography, borderRadius, BODY_FONT } from '../../theme';
import { SkeletonBar, SkeletonGroup, SkeletonLines } from '../common/Skeleton';

import type { Theme } from '../../theme/colors';
import type { ResearchResult } from '@gruenerator/contracts';

interface Props {
  result: ResearchResult;
  theme: Theme;
  onPress: (result: ResearchResult) => void;
}

const scorePercent = (score: number) => `${Math.round(score * 100)}%`;

/** Notebook magenta, as on web's hit cards and the reader's passage tint. */
const SCORE_TONE = {
  light: { text: '#B4005C', background: '#FCEAF3' },
  dark: { text: '#F2A9CE', background: '#3A1828' },
};

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
  const scoreTone = useColorScheme() === 'dark' ? SCORE_TONE.dark : SCORE_TONE.light;
  const hasHitCount = (result.term_chunk_count ?? 0) > 0 || (result.chunk_count ?? 0) > 1;
  const meta = [
    result.collection_name,
    date,
    hasHitCount ? formatResearchHitCount(result.term_chunk_count, result.chunk_count) : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <Pressable
      onPress={() => onPress(result)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? theme.surface : theme.card, borderColor: theme.cardBorder },
      ]}
      accessibilityRole="button"
    >
      {/* The score is its own element beside the title; everything else is
          one quiet line, cut at the end (the least important part) rather
          than wrapped. */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={3}>
          {result.title}
        </Text>
        <View style={[styles.score, { backgroundColor: scoreTone.background }]}>
          <Text style={[styles.scoreText, { color: scoreTone.text }]}>
            {scorePercent(result.similarity_score)}
          </Text>
        </View>
      </View>

      <Text style={[styles.content, { color: theme.textSecondary }]} numberOfLines={4}>
        {result.relevant_content}
      </Text>

      {meta.length > 0 && (
        <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
          {meta.join(' · ')}
        </Text>
      )}
    </Pressable>
  );
});

/** Stand-in while a search runs: the card's own frame — title, text, meta line. */
export function ResearchResultCardSkeleton({ theme }: { theme: Theme }) {
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <SkeletonGroup on="card" style={styles.skeletonInner}>
        <SkeletonBar width="70%" height={16} radius={5} />
        <SkeletonLines widths={['100%', '94%', '60%']} />
        <SkeletonBar width="45%" height={10} />
      </SkeletonGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonInner: {
    gap: spacing.small,
  },
  card: {
    padding: spacing.medium,
    borderRadius: borderRadius.large,
    borderWidth: 1,
    gap: spacing.xsmall,
  },
  title: {
    ...typography.bodyBold,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.small,
  },
  score: {
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
  },
  scoreText: {
    fontFamily: BODY_FONT,
    fontSize: 11,
    fontWeight: '700',
  },
  meta: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    marginTop: spacing.xxsmall,
  },
  content: {
    ...typography.bodySmall,
    lineHeight: 20,
  },
});

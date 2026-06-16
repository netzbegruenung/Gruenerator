import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

import { TOPIC_COLORS, TOPIC_LABELS, isTopicCategory } from '../../config/topicConfig';
import { useNotebookStats, type TopicCount } from '../../hooks/notebook/useNotebookStats';
import { colors, spacing, borderRadius } from '../../theme';

import type { Theme } from '../../theme/colors';

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];
const TOP_TERMS = 8;
const TOP_PERSONS = 6;

function formatDateRange(range: { min: string | null; max: string | null }): string {
  if (!range.min && !range.max) return '–';
  const fmt = (iso: string | null) => {
    if (!iso) return '?';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '?';
    return `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
  };
  if (range.min === range.max) return fmt(range.min);
  return `${fmt(range.min)} – ${fmt(range.max)}`;
}

function StatCard({ label, value, theme }: { label: string; value: string; theme: Theme }) {
  return (
    <View
      style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
    >
      <Text style={[styles.statLabel, { color: theme.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.statValue, { color: theme.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
    </View>
  );
}

function TopicDistribution({ data, theme }: { data: TopicCount[]; theme: Theme }) {
  const known = data.filter((d) => isTopicCategory(d.topic));
  const total = known.reduce((sum, d) => sum + d.count, 0);
  if (known.length === 0 || total === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>Themenverteilung</Text>

      {/* Single stacked bar, segments proportional to each topic's share. */}
      <View style={[styles.bar, { backgroundColor: theme.surface }]}>
        {known.map((d) => (
          <View
            key={d.topic}
            style={{
              flex: d.count,
              backgroundColor: TOPIC_COLORS[d.topic as keyof typeof TOPIC_COLORS],
            }}
          />
        ))}
      </View>

      <View style={styles.legend}>
        {known.map((d) => (
          <View key={d.topic} style={styles.legendItem}>
            <View
              style={[
                styles.swatch,
                { backgroundColor: TOPIC_COLORS[d.topic as keyof typeof TOPIC_COLORS] },
              ]}
            />
            <Text style={[styles.legendLabel, { color: theme.text }]} numberOfLines={1}>
              {TOPIC_LABELS[d.topic as keyof typeof TOPIC_LABELS]}
            </Text>
            <Text style={[styles.legendCount, { color: theme.textSecondary }]}>{d.count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function TagList({ label, items, theme }: { label: string; items: string[]; theme: Theme }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.tagBlock}>
      <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.tagText, { color: theme.text }]}>{items.join('  ·  ')}</Text>
    </View>
  );
}

/**
 * Per-notebook statistics — mobile port of web's `StatisticsSection`. Self-hides for
 * empty/loading-to-empty notebooks (and user notebooks, which pass `collectionIds: []`).
 */
export function StatisticsSection({
  collectionIds,
  theme,
  title = 'Statistiken',
}: {
  collectionIds: string[];
  theme: Theme;
  title?: string;
}) {
  const { data: stats, isLoading } = useNotebookStats({ collectionIds });

  if (collectionIds.length === 0) return null;

  const totalDocs = stats?.totalDocuments ?? 0;
  if (!isLoading && totalDocs === 0) return null;

  const classifiedCount = stats
    ? stats.topicDistribution.reduce((sum, t) => sum + t.count, 0)
    : 0;
  const terms = (stats?.topWords ?? []).slice(0, TOP_TERMS).map((w) => w.word);
  const persons = (stats?.topPersons ?? []).slice(0, TOP_PERSONS).map((p) => p.person);

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>

      {isLoading || !stats ? (
        <ActivityIndicator color={colors.primary[600]} style={styles.loader} />
      ) : (
        <View style={styles.body}>
          <View style={styles.statRow}>
            <StatCard
              label="Dokumente"
              value={stats.totalDocuments.toLocaleString('de-DE')}
              theme={theme}
            />
            <StatCard label="Zeitraum" value={formatDateRange(stats.dateRange)} theme={theme} />
            {stats.topicSampleSize > 0 && (
              <StatCard
                label="Klassifiziert"
                value={`${classifiedCount}/${stats.topicSampleSize}`}
                theme={theme}
              />
            )}
          </View>

          {stats.topicDistribution.length > 0 && (
            <TopicDistribution data={stats.topicDistribution} theme={theme} />
          )}

          {(terms.length > 0 || persons.length > 0) && (
            <View style={[styles.footer, { borderTopColor: theme.cardBorder }]}>
              <TagList label="Begriffe" items={terms} theme={theme} />
              <TagList label="Personen" items={persons} theme={theme} />
            </View>
          )}
        </View>
      )}
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
  loader: {
    paddingVertical: spacing.large,
  },
  body: {
    gap: spacing.medium,
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing.small,
  },
  statCard: {
    flex: 1,
    gap: 2,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.large,
    borderWidth: 1,
  },
  statLabel: {
    fontSize: 11,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  card: {
    gap: spacing.small,
    padding: spacing.medium,
    borderRadius: borderRadius.large,
    borderWidth: 1,
  },
  cardLabel: {
    fontSize: 11,
  },
  bar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.xsmall,
  },
  legendItem: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingRight: spacing.small,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendLabel: {
    flex: 1,
    fontSize: 13,
  },
  legendCount: {
    fontSize: 13,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.large,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.medium,
  },
  tagBlock: {
    flex: 1,
    gap: spacing.xsmall,
  },
  tagText: {
    fontSize: 13,
    lineHeight: 20,
  },
});

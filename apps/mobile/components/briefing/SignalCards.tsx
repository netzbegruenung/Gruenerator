import {
  type MonitorKeywordEntry,
  type MonitorLocale,
  type SocialTrend,
  type TopicScore,
} from '@gruenerator/contracts';
import { keywordPixels, trendInTheNews } from '@gruenerator/shared/monitor';
import * as WebBrowser from 'expo-web-browser';
import { memo, useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { TOPIC_LABELS } from '../../config/topicConfig';
import { useReduceMotion } from '../../hooks/useAccessibilityPreferences';
import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, HEADING_FONT_BOLD, useDashboardColors } from '../../theme';

import { BriefingCard, type BriefingCardState } from './BriefingCard';
import { CloudSkeleton, RowsSkeleton } from './BriefingSkeleton';

// Die drei Signal-Karten der oberen Reihe: Themen, Keywords, X-Trends. Alle lesen aus
// dem Monitor-Snapshot; `null` heißt: der Snapshot lädt noch.

/** Beim Aufklappen kommt der Rest sanft hinzu; bei „Bewegung reduzieren“ steht er sofort da. */
function Reveal({ children }: { children: ReactNode }) {
  const reduceMotion = useReduceMotion();
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(200)}
      exiting={reduceMotion ? undefined : FadeOut.duration(150)}
    >
      {children}
    </Animated.View>
  );
}

const THEMEN_COLLAPSED = 5;

/** Themen nach Artikelanzahl, mit grauen Balken; eingeklappt fünf, offen alle. */
export function ThemenCard({
  state,
  topics,
}: {
  state: BriefingCardState;
  topics: TopicScore[] | null;
}) {
  const theme = useTheme();
  const sorted = useMemo(
    () => [...(topics ?? [])].sort((a, b) => b.articleCount - a.articleCount),
    [topics]
  );
  const shown = state.open ? sorted : sorted.slice(0, THEMEN_COLLAPSED);
  const max = sorted[0]?.articleCount || 1;

  return (
    <BriefingCard state={state} title="Themen" busy={topics === null}>
      {topics === null ? (
        <RowsSkeleton />
      ) : shown.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>Gerade keine Themen.</Text>
      ) : (
        <View style={styles.rows}>
          {shown.map((t, i) => {
            const row = (
              <View
                key={t.topic}
                style={styles.topicRow}
                accessible
                accessibilityLabel={`${TOPIC_LABELS[t.topic]}, ${t.articleCount} Artikel`}
              >
                <Text style={[styles.topic, { color: theme.text }]} numberOfLines={2}>
                  {TOPIC_LABELS[t.topic]}
                </Text>
                <View style={[styles.track, { backgroundColor: theme.cardBorder }]}>
                  <View
                    style={[
                      styles.fill,
                      {
                        backgroundColor: theme.textSecondary,
                        width: `${Math.round((t.articleCount / max) * 100)}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            );
            return i < THEMEN_COLLAPSED ? row : <Reveal key={t.topic}>{row}</Reveal>;
          })}
        </View>
      )}
    </BriefingCard>
  );
}

/** Die häufigsten Begriffe als Wolke, Größe nach Rang; eingeklappt zwölf, offen dreißig. */
export function KeywordsCard({
  state,
  keywords,
}: {
  state: BriefingCardState;
  keywords: MonitorKeywordEntry[] | null;
}) {
  const theme = useTheme();
  const c = useDashboardColors();
  const sorted = useMemo(() => [...(keywords ?? [])].sort((a, b) => b.count - a.count), [keywords]);
  const shown = sorted.slice(0, state.open ? 30 : 12);
  const pixels = keywordPixels(shown.length, 40, state.open ? 15 : 17);
  const tone = { accent: c.mg, strong: theme.text, muted: theme.textSecondary } as const;

  return (
    <BriefingCard state={state} title="Keywords" busy={keywords === null}>
      {keywords === null ? (
        <CloudSkeleton />
      ) : shown.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>Gerade keine Keywords.</Text>
      ) : (
        <View style={styles.cloud}>
          {shown.map((k, i) => (
            <Text
              key={k.keyword}
              style={[styles.word, { fontSize: pixels[i].px, color: tone[pixels[i].tone] }]}
            >
              {k.keyword}
            </Text>
          ))}
        </View>
      )}
    </BriefingCard>
  );
}

const TrendLink = memo(function TrendLink({
  trend,
  highlighted,
}: {
  trend: SocialTrend;
  highlighted: boolean;
}) {
  const theme = useTheme();
  const c = useDashboardColors();
  return (
    <Pressable
      onPress={() => void WebBrowser.openBrowserAsync(trend.url)}
      accessibilityRole="link"
      accessibilityLabel={highlighted ? `${trend.name}, auch in den Nachrichten` : trend.name}
      style={({ pressed }) => [styles.trend, pressed ? styles.pressed : null]}
    >
      <Text style={[styles.trendText, { color: highlighted ? c.mgInk : theme.text }]}>
        {trend.name}
      </Text>
    </Pressable>
  );
});

/**
 * X-Trends nach Platzierung; eingeklappt zehn, offen dreißig. Trends, die auch in den
 * Nachrichten stehen, sind hervorgehoben (siehe `trendInTheNews`).
 */
export function XTrendsCard({
  state,
  trends,
  keywords,
  greensTitles,
  locale,
}: {
  state: BriefingCardState;
  trends: SocialTrend[] | null;
  keywords: MonitorKeywordEntry[];
  greensTitles: string[];
  locale: MonitorLocale;
}) {
  const theme = useTheme();
  const sorted = useMemo(() => [...(trends ?? [])].sort((a, b) => a.rank - b.rank), [trends]);
  const shown = sorted.slice(0, state.open ? 30 : 10);
  const keywordSet = useMemo(
    () => new Set(keywords.map((k) => k.keyword.toLocaleLowerCase('de-DE'))),
    [keywords]
  );

  return (
    <BriefingCard state={state} title="X-Trends" busy={trends === null}>
      {trends === null ? (
        <CloudSkeleton />
      ) : shown.length === 0 ? (
        // trends24.in sperrt den Produktionsserver zeitweise aus (#4070).
        <Text style={[styles.empty, { color: theme.textSecondary }]}>
          Gerade keine Trends. Sie werden stündlich aktualisiert.
        </Text>
      ) : (
        <View
          accessibilityLabel={`Trends in ${locale === 'at' ? 'Österreich' : 'Deutschland'}`}
          style={styles.trends}
        >
          {shown.map((t, i) => {
            const link = (
              <TrendLink
                key={`${t.rank}-${t.name}`}
                trend={t}
                highlighted={trendInTheNews(t.name, keywordSet, greensTitles)}
              />
            );
            return i < 10 ? link : <Reveal key={`${t.rank}-${t.name}`}>{link}</Reveal>;
          })}
        </View>
      )}
    </BriefingCard>
  );
}

const styles = StyleSheet.create({
  empty: { fontFamily: BODY_FONT, fontSize: 15 },
  rows: { gap: 16 },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  topic: { width: 130, fontFamily: BODY_FONT, fontSize: 15 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  cloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: 18,
    rowGap: 10,
  },
  word: { fontFamily: HEADING_FONT_BOLD },
  trends: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20 },
  trend: { width: '45%', flexGrow: 1, minHeight: 44, justifyContent: 'center' },
  trendText: { fontFamily: BODY_FONT, fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.6 },
});

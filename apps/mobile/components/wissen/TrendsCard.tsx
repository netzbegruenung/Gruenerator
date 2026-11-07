import { type MonitorLocale } from '@gruenerator/contracts';
import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useMonitorSnapshot } from '../../hooks/monitor/useMonitor';
import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, useDashboardColors } from '../../theme';
import { SlideStack, type Slide } from '../dashboard/SlideStack';

import { AsideCard, AsideTitle, CardError } from './WissenLayout';
import { TrendsSkeleton } from './WissenSkeletons';

/** Auf dem Handy drei Schlagwörter und vier X-Trends (das Web blendet den Rest unterhalb `md` aus). */
const TREND_COUNT = 3;
const X_TREND_COUNT = 4;
/** Ein Balken bleibt sichtbar, auch wenn das Thema weit hinter dem ersten liegt. */
const MIN_BAR_PCT = 8;

const KeywordBars = memo(function KeywordBars({
  keywords,
}: {
  keywords: { keyword: string; count: number }[];
}) {
  const theme = useTheme();
  const c = useDashboardColors();
  const max = keywords[0]?.count || 1;
  return (
    <View style={styles.bars}>
      {keywords.map((k) => (
        <View
          key={k.keyword}
          style={styles.bar}
          accessible
          accessibilityLabel={`${k.keyword}, ${k.count} Nennungen`}
        >
          <View style={styles.barHead}>
            <Text style={[styles.keyword, { color: theme.text }]} numberOfLines={1}>
              {k.keyword}
            </Text>
            <Text style={[styles.count, { color: theme.textSecondary }]}>{k.count}</Text>
          </View>
          <View style={[styles.track, { backgroundColor: c.mgTint }]}>
            <View
              style={[
                styles.fill,
                {
                  backgroundColor: c.mg,
                  width: `${Math.max(MIN_BAR_PCT, Math.round((k.count / max) * 100))}%`,
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
});

const XTrends = memo(function XTrends({ names }: { names: { rank: number; name: string }[] }) {
  const theme = useTheme();
  return (
    <View style={styles.x}>
      <Text style={[styles.muted, { color: theme.textSecondary }]}>Auf X</Text>
      {names.map((t) => (
        <Text
          key={`${t.rank}-${t.name}`}
          style={[styles.keyword, { color: theme.text }]}
          numberOfLines={1}
        >
          {t.name}
        </Text>
      ))}
    </View>
  );
});

/**
 * „Trends“ in zwei Folien zum Wischen (oder über die Punkte), ohne Durchwechseln:
 * die meistgenannten Schlagwörter der letzten 24 Stunden mit Balken, dann die
 * X-Trends des Landes — beides aus dem Monitor-Snapshot, den auch das Briefing zeigt.
 */
export function TrendsCard({ locale, onOpen }: { locale: MonitorLocale; onOpen: () => void }) {
  const { data, isPending, isError, refetch } = useMonitorSnapshot(locale);

  const slides = useMemo<Slide[]>(() => {
    const out: Slide[] = [];
    const top = (data?.keywords ?? []).slice(0, TREND_COUNT);
    const xTrends = [...(data?.socialTrends ?? [])]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, X_TREND_COUNT);
    if (top.length > 0) {
      out.push({
        key: 'keywords',
        label: 'Schlagwörter in den Nachrichten',
        content: <KeywordBars keywords={top} />,
      });
    }
    if (xTrends.length > 0) {
      out.push({
        key: 'x',
        label: `X-Trends in ${locale === 'at' ? 'Österreich' : 'Deutschland'}`,
        content: <XTrends names={xTrends} />,
      });
    }
    return out;
  }, [data, locale]);

  const theme = useTheme();
  return (
    <AsideCard accessibilityLabel="Trends" aria-busy={isPending}>
      <AsideTitle
        title="Trends"
        onPress={onOpen}
        hint="Öffnet das Briefing bei den Schlagwörtern"
      />
      {slides.length > 0 ? (
        <SlideStack slides={slides} />
      ) : isPending ? (
        <TrendsSkeleton />
      ) : isError ? null : (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>Gerade keine Themen.</Text>
      )}
      {isError ? <CardError onRetry={() => void refetch()} /> : null}
    </AsideCard>
  );
}

const styles = StyleSheet.create({
  bars: { gap: 9 },
  bar: { gap: 4 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  keyword: { flexShrink: 1, fontFamily: BODY_FONT, fontSize: 14, fontWeight: '700' },
  count: { fontFamily: BODY_FONT, fontSize: 14, fontVariant: ['tabular-nums'] },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  x: { gap: 4 },
  muted: { fontFamily: BODY_FONT, fontSize: 13 },
  empty: { fontFamily: BODY_FONT, fontSize: 14 },
});

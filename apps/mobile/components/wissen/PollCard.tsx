import { type EuGreensData, type MonitorLocale } from '@gruenerator/contracts';
import { deltaText, grueneSnapshot, pct } from '@gruenerator/shared/monitor';
import { memo, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { useEuGreens, usePolls } from '../../hooks/monitor/useMonitor';
import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, HEADING_FONT_BOLD, useDashboardColors } from '../../theme';
import { SlideStack, type Slide } from '../dashboard/SlideStack';

import { AsideCard, AsideTitle, CardError } from './WissenLayout';
import { PollSkeleton } from './WissenSkeletons';

const SPARK_HEIGHT = 34;
/** Luft oben und unten, damit die Linie nicht am Rand abgeschnitten wird. */
const SPARK_PAD = 3;

/** Verlauf als Linie in Pixeln der gemessenen Breite — so bleibt die Strichstärke exakt. */
export function Sparkline({ values }: { values: number[] }) {
  const c = useDashboardColors();
  const [width, setWidth] = useState(0);
  const s = values.slice(-12);
  if (s.length < 2) return null;
  const min = Math.min(...s);
  const range = Math.max(...s) - min || 1;
  const inner = SPARK_HEIGHT - 2 * SPARK_PAD;
  const points = s
    .map(
      (v, i) =>
        `${((i * width) / (s.length - 1)).toFixed(1)},${(SPARK_PAD + inner - ((v - min) / range) * inner).toFixed(1)}`
    )
    .join(' ');
  return (
    <View
      style={styles.spark}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {width > 0 ? (
        <Svg width={width} height={SPARK_HEIGHT}>
          <Polyline
            points={points}
            fill="none"
            stroke={c.mg}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Svg>
      ) : null}
    </View>
  );
}

const EUROPE_COUNT = 4;

type EuGreen = EuGreensData['results'][number];

/**
 * Die stärksten Grünen in Europa — ohne das eigene Land (das zeigt die erste Folie),
 * ohne das EU-Parlament und ohne breite Bündnisse, in denen die Grünen nur ein kleiner
 * Partner sind (FR NFP, ES Sumar): deren Wert wäre keine grüne Stärke.
 */
function strongestInEurope(results: EuGreen[], ownCountry: string): EuGreen[] {
  return results
    .filter((r) => !r.broadAlliance && r.countryCode !== 'eu' && r.countryCode !== ownCountry)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, EUROPE_COUNT);
}

const NationalSlide = memo(function NationalSlide({
  value,
  delta,
  trend,
}: {
  value: number;
  delta: string;
  trend: number[];
}) {
  const theme = useTheme();
  const c = useDashboardColors();
  return (
    <View style={styles.national}>
      <View
        accessible
        accessibilityLabel={`Grüne ${pct(value)}${delta ? `, ${delta} zur Vorwoche` : ''}`}
        style={styles.valueBlock}
      >
        <Text style={[styles.value, { color: theme.text }]}>{pct(value)}</Text>
        {delta ? (
          <Text style={[styles.delta, { color: c.mg }]}>
            {delta}
            <Text style={styles.deltaSuffix}> zur Vorwoche</Text>
          </Text>
        ) : null}
      </View>
      <Sparkline values={trend} />
    </View>
  );
});

const EuropeSlide = memo(function EuropeSlide({ rows }: { rows: EuGreen[] }) {
  const theme = useTheme();
  return (
    <View style={styles.europe}>
      <Text style={[styles.muted, { color: theme.textSecondary }]}>Grüne in Europa</Text>
      {rows.map((r) => (
        <View
          key={r.countryCode}
          style={styles.row}
          accessible
          accessibilityLabel={`${r.countryName}, ${pct(r.percent)}`}
        >
          <Text style={[styles.country, { color: theme.text }]} numberOfLines={1}>
            {r.countryName}
          </Text>
          <Text style={[styles.percent, { color: theme.text }]}>{pct(r.percent)}</Text>
        </View>
      ))}
    </View>
  );
});

/**
 * „Umfragen“ in zwei Folien zum Wischen (oder über die Punkte), ohne Durchwechseln:
 *
 * 1. Das eigene Land — Mittel der Sonntagsfrage, Abstand zur Vorwoche und Verlauf (auf
 *    dem Handy ohne die anderen Parteien, wie im Web).
 * 2. „Grüne in Europa“ — die stärksten grünen Parteien der anderen Länder.
 *
 * Fehlt eine der beiden Quellen, bleibt die andere als einzige Folie stehen.
 */
export function PollCard({ locale, onOpen }: { locale: MonitorLocale; onOpen: () => void }) {
  const polls = usePolls(locale === 'at' ? 'oesterreich' : 'deutschland');
  const eu = useEuGreens();

  const slides = useMemo<Slide[]>(() => {
    const out: Slide[] = [];
    // In einer leeren 200-Antwort fehlen `average`/`polls` (Teilausfall).
    const g = polls.data?.average && polls.data.polls ? grueneSnapshot(polls.data) : null;
    if (g?.value != null) {
      out.push({
        key: 'national',
        label: `Umfragen in ${locale === 'at' ? 'Österreich' : 'Deutschland'}`,
        content: (
          <NationalSlide
            value={g.value}
            delta={g.delta ? deltaText(g.delta) : ''}
            trend={g.trend.map((p) => p.value)}
          />
        ),
      });
    }
    const europe = strongestInEurope(eu.data?.results ?? [], locale);
    if (europe.length > 0) {
      out.push({ key: 'europe', label: 'Grüne in Europa', content: <EuropeSlide rows={europe} /> });
    }
    return out;
  }, [polls.data, eu.data, locale]);

  const theme = useTheme();
  const isPending = polls.isPending;
  const isError = polls.isError || eu.isError;
  const retry = () => {
    if (polls.isError) void polls.refetch();
    if (eu.isError) void eu.refetch();
  };

  return (
    <AsideCard accessibilityLabel="Umfragen" aria-busy={isPending}>
      <AsideTitle title="Umfragen" onPress={onOpen} hint="Öffnet die Umfragen mit Karte" />
      {slides.length > 0 ? (
        <SlideStack slides={slides} />
      ) : isPending ? (
        <PollSkeleton />
      ) : isError ? null : (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>
          Gerade keine Umfragewerte.
        </Text>
      )}
      {isError ? <CardError onRetry={retry} /> : null}
    </AsideCard>
  );
}

const styles = StyleSheet.create({
  national: { gap: 10 },
  valueBlock: { gap: 2 },
  value: {
    fontFamily: HEADING_FONT_BOLD,
    fontSize: 32,
    lineHeight: 34,
    fontVariant: ['tabular-nums'],
  },
  delta: { fontFamily: BODY_FONT, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  deltaSuffix: { fontWeight: '400' },
  spark: { height: SPARK_HEIGHT, marginTop: 4 },
  europe: { gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  country: { flexShrink: 1, fontFamily: BODY_FONT, fontSize: 14 },
  percent: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  muted: { fontFamily: BODY_FONT, fontSize: 13 },
  empty: { fontFamily: BODY_FONT, fontSize: 14 },
});

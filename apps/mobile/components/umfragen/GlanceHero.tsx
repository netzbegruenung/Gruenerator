import { deltaText, formatPollDate, grueneSnapshot, pct } from '@gruenerator/shared/monitor';
import { StyleSheet, Text, View } from 'react-native';

import { usePolls } from '../../hooks/monitor/useMonitor';
import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, HEADING_FONT_BOLD, useDashboardColors } from '../../theme';

import { TrendSparkline } from './TrendSparkline';
import { UmfragenCard } from './UmfragenCard';
import { HeroSkeleton } from './UmfragenSkeleton';

/** Kopfzahl: Grünen-Wert der Region mit Abstand zur Vorwoche und 12-Wochen-Verlauf. */
export function GlanceHero({
  parliament,
  regionLabel,
}: {
  parliament: string;
  regionLabel: string;
}) {
  const { data, isPending } = usePolls(parliament);
  const theme = useTheme();
  const c = useDashboardColors();
  // In einer leeren 200-Antwort fehlen `average`/`polls` (Teilausfall).
  const g = data?.average && data.polls ? grueneSnapshot(data) : null;
  if (!g) {
    return isPending ? (
      <UmfragenCard aria-busy>
        <HeroSkeleton />
      </UmfragenCard>
    ) : null;
  }
  const delta = deltaText(g.delta);
  const trend = g.trend.map((p) => p.value);

  return (
    <UmfragenCard
      accessibilityLabel={`Grüne in ${regionLabel}: ${pct(g.value)}${delta ? `, ${delta} zur Vorwoche` : ''}`}
    >
      <View style={styles.block}>
        <Text style={[styles.eyebrow, { color: c.mgInk }]}>Grüne · {regionLabel}</Text>
        <View style={styles.valueRow}>
          <Text style={[styles.value, { color: theme.text }]}>{pct(g.value)}</Text>
          {delta ? <Text style={[styles.delta, { color: c.mg }]}>{delta}</Text> : null}
        </View>
        <Text style={[styles.muted, { color: theme.textSecondary }]}>
          {g.lastPoll ? `Letzte Umfrage: ${formatPollDate(g.lastPoll)} · ` : ''}
          Wöchentlich aggregierter Durchschnitt
        </Text>
      </View>
      {trend.length >= 2 ? (
        <View style={styles.trend}>
          <TrendSparkline points={trend} />
          <Text style={[styles.caption, { color: theme.textSecondary }]}>
            Trend · letzte 12 Wochen
          </Text>
        </View>
      ) : null}
    </UmfragenCard>
  );
}

const styles = StyleSheet.create({
  block: { gap: 4 },
  eyebrow: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 14 },
  value: {
    fontFamily: HEADING_FONT_BOLD,
    fontSize: 52,
    lineHeight: 56,
    letterSpacing: -1.5,
    fontVariant: ['tabular-nums'],
  },
  delta: {
    fontFamily: BODY_FONT,
    fontSize: 17.6,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  muted: { fontFamily: BODY_FONT, fontSize: 14.4, marginTop: 6 },
  trend: { marginTop: 20, gap: 6, alignSelf: 'flex-start', width: '100%', maxWidth: 260 },
  caption: { fontFamily: BODY_FONT, fontSize: 12, textAlign: 'right' },
});

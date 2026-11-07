import { deltaText, isGruene, partyOrder, PARTY_COLORS, pct } from '@gruenerator/shared/monitor';
import * as WebBrowser from 'expo-web-browser';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { usePolls } from '../../hooks/monitor/useMonitor';
import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, HEADING_FONT_BOLD, useDashboardColors } from '../../theme';
import { CardError } from '../wissen/WissenLayout';

import { BarsSkeleton } from './UmfragenSkeleton';

const PollRow = memo(function PollRow({
  party,
  value,
  max,
  delta,
}: {
  party: string;
  value: number;
  max: number;
  delta: number | null | undefined;
}) {
  const theme = useTheme();
  const c = useDashboardColors();
  const hi = isGruene(party);
  const text = deltaText(delta);
  return (
    <View
      accessible
      accessibilityLabel={`${party}, ${pct(value)}${text ? `, ${text} zur Vorwoche` : ''}`}
      style={[styles.row, hi && [styles.rowHi, { backgroundColor: c.mgTint }]]}
    >
      <Text style={[styles.party, { color: theme.text }]} numberOfLines={1}>
        {party}
      </Text>
      <View style={[styles.track, { backgroundColor: c.skeleton }]}>
        <View
          style={[
            styles.fill,
            { width: `${(value / max) * 100}%`, backgroundColor: PARTY_COLORS[party] || '#888' },
          ]}
        />
      </View>
      <Text style={[styles.value, { color: theme.text }]}>{pct(value)}</Text>
      {/* Gewinne im Akzent, Verluste grau — Rot läge zu nah am Magenta. */}
      <Text
        style={[
          styles.delta,
          { color: delta != null && delta > 0 ? c.mgInk : theme.textSecondary },
        ]}
      >
        {text}
      </Text>
    </View>
  );
});

/** Sonntagsfrage als Balken, stärkste Partei zuerst; die Grünen sind getönt hinterlegt. */
export function SonntagsfrageBars({
  parliament,
  subtitle,
}: {
  parliament: string;
  subtitle: string;
}) {
  const { data, isLoading, isError, refetch } = usePolls(parliament);
  const theme = useTheme();
  const c = useDashboardColors();

  if (isLoading) return <BarsSkeleton />;
  if (!data?.average || Object.keys(data.average).length === 0) {
    return isError ? (
      <CardError onRetry={() => void refetch()} />
    ) : (
      <Text style={[styles.muted, { color: theme.textSecondary }]}>
        Keine Umfragedaten verfügbar.
      </Text>
    );
  }

  const order = partyOrder(data.average);
  const max = Math.max(...order.map((p) => data.average[p]), 1);

  return (
    <View>
      <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
        Sonntagsfrage
      </Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>

      <View style={styles.rows}>
        {order.map((party) => (
          <PollRow
            key={party}
            party={party}
            value={data.average[party]}
            max={max}
            delta={data.diffs?.[party]}
          />
        ))}
      </View>

      <Text style={[styles.source, { color: theme.textSecondary }]}>
        Daten:{' '}
        <Text
          accessibilityRole="link"
          style={[styles.link, { color: c.mg }]}
          onPress={() => void WebBrowser.openBrowserAsync('https://politpro.eu')}
        >
          PolitPro
        </Text>{' '}
        · Durchschnitt aller Institute
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: HEADING_FONT_BOLD, fontSize: 19, lineHeight: 24 },
  subtitle: { fontFamily: BODY_FONT, fontSize: 14.4, marginTop: 4, marginBottom: 24 },
  rows: { gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10 },
  // Die Grünen-Zeile ragt über die Kartenränder hinaus, wie im Web (-mx-3.5 px-3.5).
  rowHi: { marginHorizontal: -14, paddingHorizontal: 14, paddingVertical: 10 },
  party: { width: 80, fontFamily: BODY_FONT, fontSize: 15, fontWeight: '700' },
  track: { flex: 1, height: 22, borderRadius: 6, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6 },
  value: {
    width: 54,
    textAlign: 'right',
    fontFamily: BODY_FONT,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  delta: {
    width: 38,
    fontFamily: BODY_FONT,
    fontSize: 13.6,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  muted: { fontFamily: BODY_FONT, fontSize: 14 },
  source: { fontFamily: BODY_FONT, fontSize: 12.8, marginTop: 22 },
  link: { fontWeight: '700' },
});

import {
  BUNDESLAENDER,
  europaGrueneValues,
  laenderGrueneValues,
  type MapShape,
} from '@gruenerator/shared/monitor';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useEuGreens, usePollsOverview } from '../../hooks/monitor/useMonitor';
import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, HEADING_FONT_BOLD, useDashboardColors } from '../../theme';
import { routeWithParams } from '../../types/routes';

import { DeutschlandMap, EuropaMap } from './Choropleth';
import { MapSkeleton } from './UmfragenSkeleton';

import type { MonitorLocale } from '@gruenerator/contracts';

function MapNote({ text }: { text: string }) {
  const theme = useTheme();
  return <Text style={[styles.note, { color: theme.textSecondary }]}>{text}</Text>;
}

// Zwei Teile, damit die Länderübersicht nur geladen wird, solange die Deutschlandkarte
// steht (Österreich zeigt nur Europa). Eine kalte Übersicht dauert Sekunden; vorher
// gezeichnet, stünde jedes Land auf „keine Daten“.
function DeutschlandMapPanel() {
  const router = useRouter();
  const { data, isLoading } = usePollsOverview('DE');
  const values = useMemo(() => (data ? laenderGrueneValues(data) : null), [data]);
  // Antippen öffnet die Seite des Bundeslands (`/umfragen/:land` im Web).
  const open = useCallback(
    (shape: MapShape) => {
      const land = BUNDESLAENDER.find((b) => b.name === shape.key);
      if (land) router.push(routeWithParams('/(focused)/umfragen', { land: land.id }));
    },
    [router]
  );
  if (isLoading) return <MapSkeleton />;
  if (!values) return <MapNote text="Länderdaten konnten nicht geladen werden." />;
  return <DeutschlandMap values={values} onPressRegion={open} />;
}

function EuropaMapPanel() {
  const { data, isLoading } = useEuGreens();
  const values = useMemo(() => (data ? europaGrueneValues(data) : null), [data]);
  if (isLoading) return <MapSkeleton />;
  if (!values) return <MapNote text="Europadaten konnten nicht geladen werden." />;
  return <EuropaMap values={values} />;
}

function Pill({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const theme = useTheme();
  const c = useDashboardColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      // Die Pille bleibt klein wie im Web; die Zielfläche reicht auf 44 pt.
      hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
      style={[styles.pill, active && { backgroundColor: c.mg }]}
    >
      <Text style={[styles.pillText, { color: active ? c.onMg : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

/** „Grüne in den Ländern“ / „Grüne in Europa“; in Österreich nur Europa, ohne Umschalter. */
export function LaenderMapPanel({ locale }: { locale: MonitorLocale }) {
  const theme = useTheme();
  const c = useDashboardColors();
  const isAT = locale === 'at';
  const [view, setView] = useState<'de' | 'eu'>(isAT ? 'eu' : 'de');
  const showDE = !isAT && view === 'de';

  return (
    <View>
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          {showDE ? 'Grüne in den Ländern' : 'Grüne in Europa'}
        </Text>
        {!isAT ? (
          <View style={[styles.pills, { backgroundColor: c.mgTint }]} accessibilityRole="tablist">
            <Pill active={view === 'de'} label="Bundesländer" onPress={() => setView('de')} />
            <Pill active={view === 'eu'} label="Europa" onPress={() => setView('eu')} />
          </View>
        ) : null}
      </View>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        {showDE
          ? 'Aktuelle Umfragewerte je Bundesland'
          : 'Wahltrends grüner Parteien in nationalen Parlamenten'}
      </Text>
      {showDE ? <DeutschlandMapPanel /> : <EuropaMapPanel />}
      {!showDE ? (
        <Text style={[styles.hatchNote, { color: theme.textSecondary }]}>
          Schraffierte Länder zeigen einen Bündniswert, in dem Grüne nur Teil einer breiteren Liste
          sind (z.{' '}B. Frankreich NFP, Spanien Sumar). Graue Länder haben kein separat
          ausgewiesenes grünes Ergebnis.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  title: { fontFamily: HEADING_FONT_BOLD, fontSize: 19, lineHeight: 24 },
  pills: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, padding: 4 },
  pill: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  pillText: { fontFamily: BODY_FONT, fontSize: 12.8, fontWeight: '700' },
  subtitle: { fontFamily: BODY_FONT, fontSize: 14.4, marginTop: 4, marginBottom: 24 },
  note: { fontFamily: BODY_FONT, fontSize: 14 },
  hatchNote: { fontFamily: BODY_FONT, fontSize: 12.5, lineHeight: 19, marginTop: 16 },
});

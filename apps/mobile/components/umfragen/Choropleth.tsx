import {
  buildChoropleth,
  EU_FIT,
  europeFeatures,
  fmtValue,
  LABEL_INK,
  RAMP_HIGH,
  RAMP_LOW,
  RAMP_MID,
  type ChoroplethValues,
  type MapShape,
} from '@gruenerator/shared/monitor';
import * as Haptics from 'expo-haptics';
import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Pattern,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { feature } from 'topojson-client';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, useDashboardColors } from '../../theme';

import { MapSkeleton } from './UmfragenSkeleton';
import { useGeoJson } from './useGeoJson';

import type { FeatureCollection } from 'geojson';
import type { Topology } from 'topojson-specification';

// Karten wie GreensChoropleth im Web: derselbe 380 × 470-Rahmen, dieselben Pfade, dieselbe
// Rampe. Pfade und Mittelpunkte werden je GeoJSON und Werte einmal berechnet (`useMemo`);
// ein Antippen ändert nur Deckkraft und Strichstärke der betroffenen `Region`.

const WIDTH = 380;
const HEIGHT = 470;
/** Regionen kleiner als das (px² im 380 × 470-Rahmen) bekommen eine breitere, unsichtbare Zielfläche. */
const SMALL_AREA = 600;
const TOOLTIP_BG = '#2a0f1d';

const Region = memo(function Region({
  shape,
  fill,
  stroke,
  strokeWidth,
  opacity,
  onPressIndex,
}: {
  shape: MapShape;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  onPressIndex: (i: number) => void;
}) {
  const press = useCallback(() => onPressIndex(shape.i), [onPressIndex, shape.i]);
  return (
    <>
      <Path
        d={shape.d}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
        onPress={press}
        testID={`karte-region-${shape.key}`}
      />
      {shape.area < SMALL_AREA ? (
        <Path
          d={shape.d}
          fill="none"
          stroke="#000"
          strokeOpacity={0}
          strokeWidth={16}
          onPress={press}
        />
      ) : null}
    </>
  );
});

const Labels = memo(function Labels({
  shapes,
  labelMin,
  mid,
}: {
  shapes: MapShape[];
  labelMin: number;
  mid: number;
}) {
  return (
    <>
      {shapes
        .filter((s) => s.v != null && !s.marked && s.area > labelMin)
        .map((s) => {
          const dark = (s.v ?? 0) >= mid;
          const common = {
            x: s.cx,
            y: s.cy + 4,
            textAnchor: 'middle' as const,
            fontSize: 12,
            fontWeight: '700' as const,
            pointerEvents: 'none' as const,
          };
          return (
            <G key={`t${s.i}`} pointerEvents="none">
              {/* Der Heiligenschein hält Zahlen lesbar, wo sie über schmale Regionen ragen. */}
              <SvgText
                {...common}
                fill={dark ? RAMP_HIGH : '#fff'}
                stroke={dark ? RAMP_HIGH : '#fff'}
                strokeWidth={3}
                strokeLinejoin="round"
              >
                {fmtValue(s.v)}
              </SvgText>
              <SvgText {...common} fill={dark ? '#fff' : LABEL_INK}>
                {fmtValue(s.v)}
              </SvgText>
            </G>
          );
        })}
    </>
  );
});

function Legend({ scale, hasMarked }: { scale: [number, number]; hasMarked: boolean }) {
  const theme = useTheme();
  const c = useDashboardColors();
  return (
    <View style={styles.legend}>
      <Text style={[styles.legendText, { color: theme.textSecondary }]}>{scale[0]}%</Text>
      <Svg width={140} height={8} accessibilityElementsHidden>
        <Defs>
          <LinearGradient id="ramp" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={RAMP_LOW} />
            <Stop offset="1" stopColor={RAMP_HIGH} />
          </LinearGradient>
        </Defs>
        <Rect width={140} height={8} rx={4} fill="url(#ramp)" />
      </Svg>
      <Text style={[styles.legendText, { color: theme.textSecondary }]}>{scale[1]}%</Text>
      <View style={styles.legendItem}>
        <View style={[styles.swatch, { backgroundColor: c.skeleton }]} />
        <Text style={[styles.legendText, { color: theme.textSecondary }]}>keine Daten</Text>
      </View>
      {hasMarked ? (
        <View style={styles.legendItem}>
          <Svg width={10} height={10} accessibilityElementsHidden>
            <Defs>
              <Pattern
                id="legend-hatch"
                width={5}
                height={5}
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <Rect width={5} height={5} fill={RAMP_LOW} />
                <Line x1={0} y1={0} x2={0} y2={5} stroke={RAMP_MID} strokeWidth={2} />
              </Pattern>
            </Defs>
            <Rect width={10} height={10} rx={2} fill="url(#legend-hatch)" />
          </Svg>
          <Text style={[styles.legendText, { color: theme.textSecondary }]}>Bündnis</Text>
        </View>
      ) : null}
    </View>
  );
}

interface MapChartProps {
  geo: FeatureCollection;
  fitGeo?: Parameters<typeof buildChoropleth>[0]['fitGeo'];
  values: ChoroplethValues;
  labelMin: number;
  domain: [number, number];
  /** Gesetzt: ein Druck öffnet die Region (Bundesland-Seite). Sonst zeigt er ihren Wert als Text. */
  onPressRegion?: (shape: MapShape) => void;
}

function MapChart({ geo, fitGeo, values, labelMin, domain, onPressRegion }: MapChartProps) {
  const c = useDashboardColors();
  const [selected, setSelected] = useState<number | null>(null);

  const { scale, shapes } = useMemo(
    () => buildChoropleth({ geo, fitGeo, width: WIDTH, height: HEIGHT, values, domain }),
    [geo, fitGeo, values, domain]
  );

  const onPressIndex = useCallback(
    (i: number) => {
      void Haptics.selectionAsync();
      if (onPressRegion) onPressRegion(shapes[i]);
      else setSelected((cur) => (cur === i ? null : i));
    },
    [onPressRegion, shapes]
  );

  const active = selected != null ? shapes[selected] : null;
  const mid = (scale[0] + scale[1]) / 2;
  const hasMarked = shapes.some((s) => s.marked);

  return (
    <View style={styles.chart}>
      <Svg
        style={styles.svg}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        accessibilityLabel={`Karte, Werte von ${scale[0]} bis ${scale[1]} Prozent`}
      >
        <Defs>
          <Pattern
            id="alliance-hatch"
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <Rect width={6} height={6} fill={RAMP_LOW} />
            <Line x1={0} y1={0} x2={0} y2={6} stroke={RAMP_MID} strokeWidth={2.5} />
          </Pattern>
        </Defs>
        {shapes.map((s) => (
          <Region
            key={s.i}
            shape={s}
            fill={s.v == null ? c.skeleton : s.marked ? 'url(#alliance-hatch)' : s.fill}
            stroke={c.card}
            strokeWidth={selected === s.i ? 2 : 1}
            opacity={selected == null || selected === s.i ? 1 : 0.55}
            onPressIndex={onPressIndex}
          />
        ))}
        <Labels shapes={shapes} labelMin={labelMin} mid={mid} />
      </Svg>

      {active ? (
        <View style={styles.tooltip} accessibilityLiveRegion="polite" accessible>
          <Text style={styles.tooltipText}>
            <Text style={styles.tooltipName}>{active.name}</Text>
            {active.sub ? ` (${active.sub})` : ''} · {fmtValue(active.v)}
            {active.date ? ` (${active.date})` : ''}
          </Text>
        </View>
      ) : null}

      <Legend scale={scale} hasMarked={hasMarked} />
    </View>
  );
}

/** Platzhalter, wenn die Geodaten fehlen (offline): kein Absturz, die Balken daneben bleiben. */
function MapError({ onRetry }: { onRetry: () => void }) {
  const theme = useTheme();
  const c = useDashboardColors();
  return (
    <View style={styles.error} accessibilityRole="alert" testID="karte-fehler">
      <Text style={[styles.errorText, { color: theme.textSecondary }]}>
        Karte konnte nicht geladen werden.
      </Text>
      <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={12}>
        <Text style={[styles.retry, { color: c.mg }]}>Erneut versuchen</Text>
      </Pressable>
    </View>
  );
}

interface GreensMapProps {
  values: ChoroplethValues;
  onPressRegion?: (shape: MapShape) => void;
}

export function DeutschlandMap({ values, onPressRegion }: GreensMapProps) {
  const geo = useGeoJson<FeatureCollection>('/geo/de-bundeslaender.geo.json');
  if (geo.isError) return <MapError onRetry={() => void geo.refetch()} />;
  if (!geo.data) return <MapSkeleton />;
  return (
    <MapChart
      geo={geo.data}
      values={values}
      // 600 keeps the city-states (Bremen 95, Hamburg 254, Berlin 275) number-less
      // but lets Saarland (706) carry its number.
      labelMin={600}
      domain={DE_DOMAIN}
      onPressRegion={onPressRegion}
    />
  );
}

const DE_DOMAIN: [number, number] = [3, 18];
const EU_DOMAIN: [number, number] = [2, 15];

export function EuropaMap({ values, onPressRegion }: GreensMapProps) {
  const topo = useGeoJson<Topology>('/geo/europe-110m.json');
  const geo = useMemo(
    () =>
      topo.data
        ? europeFeatures(
            feature(topo.data, topo.data.objects.countries) as unknown as FeatureCollection
          )
        : null,
    [topo.data]
  );
  if (topo.isError) return <MapError onRetry={() => void topo.refetch()} />;
  if (!geo) return <MapSkeleton />;
  return (
    <MapChart
      geo={geo}
      fitGeo={EU_FIT}
      values={values}
      // Only countries with data get a number, and none of them collide.
      labelMin={30}
      domain={EU_DOMAIN}
      onPressRegion={onPressRegion}
    />
  );
}

const styles = StyleSheet.create({
  chart: { width: '100%', maxWidth: WIDTH, gap: 12 },
  svg: { width: '100%', aspectRatio: WIDTH / HEIGHT },
  tooltip: {
    alignSelf: 'flex-start',
    backgroundColor: TOOLTIP_BG,
    borderRadius: 8,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    paddingVertical: 6,
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
  },
  tooltipText: { color: '#fff', fontFamily: BODY_FONT, fontSize: 13 },
  tooltipName: { fontWeight: '700' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontFamily: BODY_FONT, fontSize: 12 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  error: { gap: 6, paddingVertical: 8, alignItems: 'flex-start' },
  errorText: { fontFamily: BODY_FONT, fontSize: 14 },
  retry: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '700' },
});

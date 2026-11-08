import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useDashboardColors } from '../../theme';

const W = 260;
const H = 72;
const P = 6;

/** Linie und Fläche der letzten zwölf Werte im Koordinatenraum 260 × 72 (wie das Web). */
export function sparklineGeometry(values: number[]) {
  const s = values.slice(-12);
  if (s.length < 2) return null;
  const min = Math.min(...s);
  const rng = Math.max(...s) - min || 1;
  const pts = s.map(
    (v, i) =>
      [P + (i * (W - 2 * P)) / (s.length - 1), H - P - ((v - min) / rng) * (H - 2 * P)] as const
  );
  const line = 'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L');
  const last = pts[pts.length - 1];
  const fill = `${line} L${last[0].toFixed(1)} ${H - P} L${pts[0][0].toFixed(1)} ${H - P} Z`;
  return { line, fill, last };
}

/** 12-Wochen-Verlauf: Fläche, Linie und Endpunkt in den Dashboard-Farben. */
export const TrendSparkline = memo(function TrendSparkline({ points }: { points: number[] }) {
  const c = useDashboardColors();
  const g = sparklineGeometry(points);
  if (!g) return null;
  return (
    <View
      style={styles.box}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        <Path d={g.fill} fill={c.mgTint} />
        <Path
          d={g.line}
          fill="none"
          stroke={c.mg}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={g.last[0]} cy={g.last[1]} r={4} fill={c.mgInk} />
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  box: { width: '100%', maxWidth: W, aspectRatio: W / H },
});

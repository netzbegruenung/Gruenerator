import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Line as SvgLine, Path, Rect, Text as SvgText } from 'react-native-svg';

import { spacing, borderRadius } from '../../theme';

import type { Theme } from '../../theme/colors';
import type { ChartData } from '@gruenerator/chat';

/** Same brand fallback palette as web's ChatChart — used when the backend
 *  payload carries no explicit `colors`. */
const BRAND_COLORS = ['#005437', '#46962b', '#8abd24', '#c3d117', '#004b76', '#f5a623'];

function colorAt(colors: string[] | undefined, index: number): string {
  if (colors && colors.length > 0) return colors[index % colors.length];
  return BRAND_COLORS[index % BRAND_COLORS.length];
}

function toNumber(value: string | number | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

/** "Nice" y-axis ticks: 0 … a rounded-up max in ~4 steps (1/2/5×10ⁿ). */
function niceTicks(maxValue: number): number[] {
  if (maxValue <= 0) return [0, 1];
  const roughStep = maxValue / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const residual = roughStep / magnitude;
  const step = (residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1) * magnitude;
  const ticks: number[] = [];
  for (let tick = 0; tick < maxValue + step; tick += step) ticks.push(tick);
  return ticks;
}

function formatTick(value: number): string {
  if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)}k`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const CHART_HEIGHT = 220;
const AXIS_LEFT = 36;
const AXIS_BOTTOM = 18;
const TOP_PAD = 8;
const RIGHT_PAD = 8;

interface PlotProps {
  chart: ChartData;
  width: number;
  theme: Theme;
}

function CartesianPlot({ chart, width, theme }: PlotProps) {
  const rows = chart.data;
  const plotW = width - AXIS_LEFT - RIGHT_PAD;
  const plotH = CHART_HEIGHT - AXIS_BOTTOM - TOP_PAD;
  const maxValue = Math.max(
    0,
    ...rows.flatMap((row) => chart.yKeys.map((key) => toNumber(row[key])))
  );
  const ticks = niceTicks(maxValue);
  const yMax = ticks[ticks.length - 1] || 1;
  const yFor = (value: number) => TOP_PAD + plotH - (value / yMax) * plotH;

  // Thin x labels to at most 6 so long series stay readable.
  const labelStep = Math.max(1, Math.ceil(rows.length / 6));

  const groupWidth = plotW / rows.length;
  const centerX = (index: number) => AXIS_LEFT + groupWidth * (index + 0.5);

  const seriesPath = (key: string, close: boolean): string => {
    const points = rows.map((row, i) => `${centerX(i)} ${yFor(toNumber(row[key]))}`);
    let path = `M ${points[0]}`;
    for (let i = 1; i < points.length; i++) path += ` L ${points[i]}`;
    if (close) {
      path += ` L ${centerX(rows.length - 1)} ${yFor(0)} L ${centerX(0)} ${yFor(0)} Z`;
    }
    return path;
  };

  const barWidth = (groupWidth * 0.7) / chart.yKeys.length;

  return (
    <Svg width={width} height={CHART_HEIGHT}>
      {ticks.map((tick) => (
        <SvgLine
          key={`grid-${tick}`}
          x1={AXIS_LEFT}
          y1={yFor(tick)}
          x2={width - RIGHT_PAD}
          y2={yFor(tick)}
          stroke={theme.border}
          strokeWidth={StyleSheet.hairlineWidth}
        />
      ))}
      {ticks.map((tick) => (
        <SvgText
          key={`tick-${tick}`}
          x={AXIS_LEFT - 6}
          y={yFor(tick) + 4}
          fontSize={11}
          fill={theme.textSecondary}
          textAnchor="end"
        >
          {formatTick(tick)}
        </SvgText>
      ))}
      {rows.map((row, i) =>
        i % labelStep === 0 ? (
          <SvgText
            key={`x-${i}`}
            x={centerX(i)}
            y={CHART_HEIGHT - 4}
            fontSize={11}
            fill={theme.textSecondary}
            textAnchor="middle"
          >
            {String(row[chart.xKey] ?? '')}
          </SvgText>
        ) : null
      )}
      {chart.type === 'bar' &&
        rows.map((row, rowIndex) =>
          chart.yKeys.map((key, seriesIndex) => {
            const value = toNumber(row[key]);
            const x =
              centerX(rowIndex) - (barWidth * chart.yKeys.length) / 2 + barWidth * seriesIndex;
            return (
              <Rect
                key={`bar-${rowIndex}-${key}`}
                x={x}
                y={yFor(value)}
                width={barWidth}
                height={Math.max(0, yFor(0) - yFor(value))}
                rx={3}
                fill={colorAt(chart.colors, seriesIndex)}
              />
            );
          })
        )}
      {(chart.type === 'line' || chart.type === 'area') &&
        chart.yKeys.map((key, seriesIndex) => (
          <Path
            key={`series-${key}`}
            d={seriesPath(key, chart.type === 'area')}
            stroke={colorAt(chart.colors, seriesIndex)}
            strokeWidth={2}
            fill={chart.type === 'area' ? colorAt(chart.colors, seriesIndex) : 'none'}
            fillOpacity={chart.type === 'area' ? 0.2 : 1}
          />
        ))}
    </Svg>
  );
}

/** SVG arc path for a pie/donut slice between two angles (radians, 0 = top). */
function slicePath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number
): string {
  const pointAt = (radius: number, angle: number) => ({
    x: cx + radius * Math.sin(angle),
    y: cy - radius * Math.cos(angle),
  });
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const outerStart = pointAt(outerR, startAngle);
  const outerEnd = pointAt(outerR, endAngle);
  if (innerR <= 0) {
    return `M ${cx} ${cy} L ${outerStart.x} ${outerStart.y} A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} Z`;
  }
  const innerStart = pointAt(innerR, endAngle);
  const innerEnd = pointAt(innerR, startAngle);
  return (
    `M ${outerStart.x} ${outerStart.y} A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} ` +
    `L ${innerStart.x} ${innerStart.y} A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y} Z`
  );
}

function PiePlot({ chart, width, theme }: PlotProps) {
  const valueKey = chart.yKeys[0];
  const values = chart.data.map((row) => Math.max(0, toNumber(row[valueKey])));
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return null;

  const cx = width / 2;
  const cy = CHART_HEIGHT / 2;
  const outerR = Math.min(width, CHART_HEIGHT) / 2 - 8;
  const innerR = chart.type === 'donut' ? outerR * 0.55 : 0;

  // Cumulative slice angles, precomputed (no render-time mutation). The sweep
  // is capped just below 2π so a single 100% slice still draws as an arc.
  const slices = values.reduce<Array<{ start: number; end: number }>>((acc, value) => {
    const start = acc.length > 0 ? acc[acc.length - 1].end : 0;
    const sweep = Math.min((value / total) * Math.PI * 2, Math.PI * 2 - 0.001);
    acc.push({ start, end: start + sweep });
    return acc;
  }, []);

  return (
    <Svg width={width} height={CHART_HEIGHT}>
      {slices.map((slice, index) =>
        slice.end - slice.start <= 0 ? null : (
          <Path
            key={`slice-${index}`}
            d={slicePath(cx, cy, outerR, innerR, slice.start, slice.end)}
            fill={colorAt(chart.colors, index)}
            stroke={theme.background}
            strokeWidth={1}
          />
        )
      )}
    </Svg>
  );
}

function Legend({ chart, theme }: { chart: ChartData; theme: Theme }) {
  const isPie = chart.type === 'pie' || chart.type === 'donut';
  const items = isPie
    ? chart.data.map((row, i) => ({
        label: String(row[chart.xKey] ?? ''),
        color: colorAt(chart.colors, i),
      }))
    : chart.yKeys.map((key, i) => ({ label: key, color: colorAt(chart.colors, i) }));
  if (!isPie && items.length < 2) return null;
  return (
    <View style={styles.legend}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <Svg width={8} height={8}>
            <Circle cx={4} cy={4} r={4} fill={item.color} />
          </Svg>
          <Text style={[styles.legendLabel, { color: theme.textSecondary }]} numberOfLines={1}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Native renderer for the `chart_data` payload (backend `chart` intent) —
 * counterpart of web's Recharts-based ChatChart, hand-rolled on
 * react-native-svg to avoid a heavy native chart dependency. Bar/line/area
 * with nice-tick y-axis and gridlines; pie/donut with slice arcs. No tooltips
 * (no meaningful touch analog for the small inline card).
 */
export function ChatChartCard({ data, theme }: { data: ChartData; theme: Theme }) {
  const [width, setWidth] = useState(0);
  if (data.data.length === 0 || data.yKeys.length === 0) return null;
  const isPie = data.type === 'pie' || data.type === 'donut';

  return (
    <View
      style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width) - 2 * CARD_PADDING)}
      accessibilityLabel={data.title ? `Diagramm: ${data.title}` : 'Diagramm'}
    >
      {data.title ? (
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
          {data.title}
        </Text>
      ) : null}
      {width > AXIS_LEFT + RIGHT_PAD &&
        (isPie ? (
          <PiePlot chart={data} width={width} theme={theme} />
        ) : (
          <CartesianPlot chart={data} width={width} theme={theme} />
        ))}
      <Legend chart={data} theme={theme} />
    </View>
  );
}

const CARD_PADDING = spacing.small;

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.xsmall,
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    padding: CARD_PADDING,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xsmall,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xsmall,
    marginTop: spacing.xsmall,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    maxWidth: '48%',
  },
  legendLabel: {
    fontSize: 11,
    flexShrink: 1,
  },
});

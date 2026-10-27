// SPDX-License-Identifier: MPL-2.0
/**
 * Chart element — a first-class, editable canvas element.
 *
 * The `ChartInstance` (type + data + styling) is the serialized source of
 * truth; ChartPrimitive renders it via Recharts into a Konva.Image, re-rendered
 * whenever the instance changes. So the chart stays fully editable (through the
 * ChartSettingsSection) while still exporting/collab-syncing like any element.
 */

import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { contrastRatio, luminance } from '@ggraphic/editor/utils/colorLuminance';

import type {
  ChartDataPoint,
  ChartInstance,
  ChartLegendPosition,
  ChartSeries,
  ChartType,
} from '@ggraphic/editor/utils/chartTypes';

export type {
  ChartDataPoint,
  ChartInstance,
  ChartLegendPosition,
  ChartSeries,
  ChartType,
} from '@ggraphic/editor/utils/chartTypes';

export type ChartGroup = 'balken' | 'linien' | 'kreis';

export interface ChartTypeDef {
  id: ChartType;
  name: string;
  tags: readonly string[];
  group: ChartGroup;
}

export const CHART_GROUP_LABELS: Record<ChartGroup, string> = {
  balken: 'Balkendiagramme',
  linien: 'Liniendiagramme',
  kreis: 'Kreis- und Ringdiagramme',
};

export const CHART_GROUP_ORDER: readonly ChartGroup[] = ['balken', 'linien', 'kreis'];

export const CHART_TYPE_DEFS: readonly ChartTypeDef[] = [
  {
    id: 'bar',
    name: 'Säulen',
    tags: ['diagramm', 'chart', 'säulen', 'saeulen', 'bar', 'balken', 'statistik'],
    group: 'balken',
  },
  {
    id: 'bar-horizontal',
    name: 'Balken',
    tags: ['diagramm', 'chart', 'balken', 'bar', 'horizontal', 'statistik'],
    group: 'balken',
  },
  {
    id: 'line',
    name: 'Linie',
    tags: ['diagramm', 'chart', 'linie', 'line', 'graph', 'verlauf', 'trend'],
    group: 'linien',
  },
  {
    id: 'area',
    name: 'Fläche',
    tags: ['diagramm', 'chart', 'fläche', 'flaeche', 'area', 'verlauf', 'trend'],
    group: 'linien',
  },
  {
    id: 'pie',
    name: 'Torte',
    tags: ['diagramm', 'chart', 'torte', 'kreis', 'pie', 'kuchen', 'anteil'],
    group: 'kreis',
  },
  {
    id: 'donut',
    name: 'Donut',
    tags: ['diagramm', 'chart', 'donut', 'ring', 'kreis', 'anteil'],
    group: 'kreis',
  },
];

/** The series a cartesian chart draws when it has several, else null. */
export function chartSeries(
  chart: Pick<ChartInstance, 'chartType' | 'series'>
): ChartSeries[] | null {
  if (isRoundChartType(chart.chartType)) return null;
  return chart.series && chart.series.length > 1 ? chart.series : null;
}

export function chartLegendPosition(
  chart: Pick<ChartInstance, 'chartType' | 'legendPosition'>
): ChartLegendPosition {
  return chart.legendPosition ?? (isRoundChartType(chart.chartType) ? 'right' : 'bottom');
}

/** The series the table edits: the stored ones, or the data as the only series. */
function seriesOf(chart: Pick<ChartInstance, 'data' | 'series'>): ChartSeries[] {
  return chart.series && chart.series.length > 1
    ? chart.series
    : [{ name: 'Reihe 1', values: chart.data.map((d) => d.value) }];
}

/** Stores the series and keeps `data[i].value` on the first one; one series is stored as none. */
function withSeries(
  names: string[],
  series: ChartSeries[]
): Pick<ChartInstance, 'data' | 'series'> {
  return {
    data: names.map((name, i) => ({ name, value: series[0]?.values[i] ?? 0 })),
    series: series.length > 1 ? series : [],
  };
}

export function setChartValue(
  chart: Pick<ChartInstance, 'data' | 'series'>,
  row: number,
  seriesIndex: number,
  value: number
): Pick<ChartInstance, 'data' | 'series'> {
  const series = seriesOf(chart).map((s, si) =>
    si === seriesIndex ? { ...s, values: s.values.map((v, i) => (i === row ? value : v)) } : s
  );
  return withSeries(
    chart.data.map((d) => d.name),
    series
  );
}

export function addChartRow(
  chart: Pick<ChartInstance, 'data' | 'series'>,
  name: string
): Pick<ChartInstance, 'data' | 'series'> {
  return withSeries(
    [...chart.data.map((d) => d.name), name],
    seriesOf(chart).map((s) => ({ ...s, values: [...s.values, 0] }))
  );
}

export function removeChartRow(
  chart: Pick<ChartInstance, 'data' | 'series'>,
  row: number
): Pick<ChartInstance, 'data' | 'series'> {
  return withSeries(
    chart.data.map((d) => d.name).filter((_, i) => i !== row),
    seriesOf(chart).map((s) => ({ ...s, values: s.values.filter((_, i) => i !== row) }))
  );
}

export function addChartSeries(
  chart: Pick<ChartInstance, 'data' | 'series'>
): Pick<ChartInstance, 'data' | 'series'> {
  const series = seriesOf(chart);
  return withSeries(
    chart.data.map((d) => d.name),
    [...series, { name: `Reihe ${series.length + 1}`, values: chart.data.map(() => 0) }]
  );
}

export function removeChartSeries(
  chart: Pick<ChartInstance, 'data' | 'series'>,
  seriesIndex: number
): Pick<ChartInstance, 'data' | 'series'> {
  return withSeries(
    chart.data.map((d) => d.name),
    seriesOf(chart).filter((_, si) => si !== seriesIndex)
  );
}

export function renameChartSeries(
  chart: Pick<ChartInstance, 'data' | 'series'>,
  seriesIndex: number,
  name: string
): Pick<ChartInstance, 'data' | 'series'> {
  return withSeries(
    chart.data.map((d) => d.name),
    seriesOf(chart).map((s, si) => (si === seriesIndex ? { ...s, name } : s))
  );
}

/** WCAG 1.4.11: a graphical object against its adjacent colour. */
const MIN_GRAPHIC_CONTRAST = 3;

/**
 * Per series colour: an outline where the fill alone stays under 3:1 against
 * the chart's background, else null. The outline is the chart's own colour
 * that stands out most from the background, so it stays in the brand.
 */
export function chartSeriesOutlines(
  chart: Pick<ChartInstance, 'colors' | 'background'>
): (string | null)[] {
  const ground = chart.background ? luminance(chart.background) : null;
  if (ground === null) return chart.colors.map(() => null);
  const ratios = chart.colors.map((color) => {
    const lum = luminance(color);
    return lum === null ? null : contrastRatio(lum, ground);
  });
  let outline = contrastRatio(0, ground) >= contrastRatio(1, ground) ? '#000000' : '#FFFFFF';
  let best = MIN_GRAPHIC_CONTRAST;
  ratios.forEach((ratio, i) => {
    if (ratio !== null && ratio >= best) {
      best = ratio;
      outline = chart.colors[i]!;
    }
  });
  return ratios.map((ratio) => (ratio !== null && ratio < MIN_GRAPHIC_CONTRAST ? outline : null));
}

/** Labels, ticks and legend on a light or unknown ground. */
export const CHART_INK_DARK = '#40403f';

/**
 * The colour of a chart's own text: white where the chart sits on a dark
 * colour (`background`), else dark grey — the default when the ground is unknown.
 */
export function chartInk(chart: Pick<ChartInstance, 'background'>): string {
  const ground = chart.background ? luminance(chart.background) : null;
  if (ground === null) return CHART_INK_DARK;
  return contrastRatio(1, ground) > contrastRatio(0, ground) ? '#FFFFFF' : CHART_INK_DARK;
}

export const CHART_DEFAULT_WIDTH = 480;
export const CHART_DEFAULT_HEIGHT = 320;

/** The chart series of the active brand: what a new chart starts with. */
export const chartColors = (): readonly string[] => activeBrand().chart;

const DEFAULT_DATA: ChartDataPoint[] = [
  { name: 'A', value: 40 },
  { name: 'B', value: 65 },
  { name: 'C', value: 30 },
  { name: 'D', value: 80 },
];

function makeId(): string {
  return `chart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Round charts default to legend-on/grid-off; cartesian charts the inverse. */
export const isRoundChartType = (chartType: ChartType): boolean =>
  chartType === 'pie' || chartType === 'donut';

export function createChartInstance(
  chartType: ChartType,
  canvasWidth: number,
  canvasHeight: number,
  colors: readonly string[] = chartColors()
): ChartInstance {
  const isRound = isRoundChartType(chartType);
  return {
    id: makeId(),
    x: canvasWidth / 2 - CHART_DEFAULT_WIDTH / 2,
    y: canvasHeight / 2 - CHART_DEFAULT_HEIGHT / 2,
    width: CHART_DEFAULT_WIDTH,
    height: CHART_DEFAULT_HEIGHT,
    scale: 1,
    rotation: 0,
    opacity: 1,
    chartType,
    data: DEFAULT_DATA.map((d) => ({ ...d })),
    colors: [...colors],
    title: '',
    showLegend: isRound,
    showGrid: !isRound,
    showValues: false,
  };
}

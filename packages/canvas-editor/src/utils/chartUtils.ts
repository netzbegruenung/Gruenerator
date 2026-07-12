/**
 * Chart element — a first-class, editable canvas element.
 *
 * The `ChartInstance` (type + data + styling) is the serialized source of
 * truth; ChartPrimitive renders it via Recharts into a Konva.Image, re-rendered
 * whenever the instance changes. So the chart stays fully editable (through the
 * ChartSettingsSection) while still exporting/collab-syncing like any element.
 */

export type ChartType = 'bar' | 'line' | 'pie';

export interface ChartDataPoint {
  name: string;
  value: number;
}

export interface ChartInstance {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  rotation: number;
  opacity: number;
  chartType: ChartType;
  data: ChartDataPoint[];
  /** Series / slice colors, cycled over the data points. */
  colors: string[];
  title?: string;
  showLegend: boolean;
  showGrid: boolean;
  showValues: boolean;
}

export const CHART_DEFAULT_WIDTH = 480;
export const CHART_DEFAULT_HEIGHT = 320;

/** Grüne brand palette for chart series. */
export const CHART_COLORS = ['#005538', '#8ABD24', '#4A9FD4', '#F5A623', '#E6007E', '#46962b'];

const DEFAULT_DATA: ChartDataPoint[] = [
  { name: 'A', value: 40 },
  { name: 'B', value: 65 },
  { name: 'C', value: 30 },
  { name: 'D', value: 80 },
];

function makeId(): string {
  return `chart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createChartInstance(
  chartType: ChartType,
  canvasWidth: number,
  canvasHeight: number
): ChartInstance {
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
    colors: [...CHART_COLORS],
    title: '',
    showLegend: chartType === 'pie',
    showGrid: chartType !== 'pie',
    showValues: false,
  };
}

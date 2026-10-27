/**
 * The chart element's data shape. Its own module so types that name a chart
 * (base state, layer list, lifted blocks) need not import `chartUtils.ts`,
 * which reads the brand theme for its palettes.
 */

export type ChartType = 'bar' | 'bar-horizontal' | 'line' | 'area' | 'pie' | 'donut';

export interface ChartDataPoint {
  name: string;
  value: number;
}

/** One series of a cartesian chart: a value per category (`data[i].name`). */
export interface ChartSeries {
  name: string;
  values: number[];
}

export type ChartLegendPosition = 'right' | 'bottom';

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
  /**
   * Two or more series of a bar, line or area chart; absent or empty on a
   * single-series chart. `data[i].value` always equals `series[0].values[i]`, so a reader
   * that predates series still draws the first one. Pies ignore it.
   */
  series?: ChartSeries[];
  /** Single series: cycled over the data points. Several series: one per series. */
  colors: string[];
  title?: string;
  /** Appended to value labels ("%", "€"); absent on charts made before it existed. */
  unit?: string;
  showLegend: boolean;
  /** Absent: right of a pie, below a cartesian chart. */
  legendPosition?: ChartLegendPosition;
  showGrid: boolean;
  showValues: boolean;
  /** The colour the chart is set on, where it is known; series too light for it get an outline. */
  background?: string;
}

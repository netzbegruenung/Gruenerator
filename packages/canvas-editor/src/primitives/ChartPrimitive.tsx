/**
 * ChartPrimitive — renders a ChartInstance as a Konva.Image.
 *
 * Recharts renders SVG/DOM, which the Konva canvas cannot host directly. So we
 * render the chart into an off-screen DOM node (fixed size, literal colors →
 * self-contained SVG), serialize its <svg>, and draw it as a Konva.Image. The
 * ChartInstance stays the editable source of truth; this image is a re-rendered
 * projection that refreshes whenever the instance changes. Recharts is imported
 * lazily so it only enters the bundle when a chart is actually placed.
 */

import { memo, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Image, Group, Rect, Transformer } from 'react-konva';

import { LOCKED_TRANSFORMER, useIsItemLocked } from '../components/canvasItemLock';
import {
  CHART_INK_DARK,
  chartInk,
  chartLegendPosition,
  chartSeries,
  chartSeriesOutlines,
  type ChartInstance,
} from '../utils/chartUtils';
import { ELEMENT_TRANSFORMER } from '../utils/orientation';
import { useTrackPendingImage } from '../utils/pendingImages';
import { touchAnchorStyleFunc } from '../utils/touchInput';

import type Konva from 'konva';

export interface ChartPrimitiveProps {
  chart: ChartInstance;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (x: number, y: number, scale: number, rotation: number) => void;
  draggable?: boolean;
}

const AXIS_TICK = { fontSize: 13, fill: CHART_INK_DARK };
/** Value labels stay dark, because in a light series colour they would vanish on white. */
const VALUE_LABEL = { fill: AXIS_TICK.fill, fontSize: 14, fontWeight: 700 };
/** A light series' outline, in px on the canvas whatever the chart's scale. */
const OUTLINE_PX = 2;

let measureContext: CanvasRenderingContext2D | null | undefined;
/**
 * A label's width at tick size as the rasterised SVG draws it (`font-family:
 * sans-serif`). A per-character estimate clipped wide labels: „Wünschen mehr"
 * needs 95 px where 13 × 7.5 − 8 left 89.5. The estimate stays only where no
 * canvas can measure.
 */
function tickTextWidth(text: string): number {
  if (measureContext === undefined) {
    try {
      measureContext = document.createElement('canvas').getContext('2d');
    } catch {
      measureContext = null;
    }
  }
  if (!measureContext) return text.length * 7.5;
  measureContext.font = `${AXIS_TICK.fontSize}px sans-serif`;
  return measureContext.measureText(text).width;
}

const LEGEND_ROW = 24;
/** Swatch 14 px, the text 22 px in. */
const LEGEND_TEXT_X = 22;
/** Between two entries of a legend row below the chart. */
const LEGEND_GAP = 18;

interface LegendEntry {
  name: string;
  index: number;
}

/**
 * Where each legend entry sits. Recharts' <Legend> is HTML beside the <svg>
 * and never reaches the image, so the legend is drawn as SVG: a column right
 * of the chart, or centred rows below it that wrap at the chart's width.
 */
function layoutLegend(
  entries: LegendEntry[],
  position: 'right' | 'bottom',
  width: number,
  height: number
): { width: number; height: number; at: (top: number) => { x: number; y: number }[] } {
  const widths = entries.map((e) => LEGEND_TEXT_X + Math.ceil(tickTextWidth(e.name)));
  if (position === 'right') {
    // 8 px gap to the chart, 4 px slack at the edge.
    const column = Math.max(...widths) + 12;
    const top = height / 2 - (entries.length * LEGEND_ROW) / 2;
    return {
      width: column,
      height: 0,
      at: () => entries.map((_, i) => ({ x: width - column + 8, y: top + i * LEGEND_ROW })),
    };
  }
  const rows: number[][] = [[]];
  let used = 0;
  widths.forEach((w, i) => {
    const row = rows[rows.length - 1]!;
    if (row.length > 0 && used + LEGEND_GAP + w > width) {
      rows.push([i]);
      used = w;
    } else {
      used += (row.length > 0 ? LEGEND_GAP : 0) + w;
      row.push(i);
    }
  });
  return {
    width: 0,
    height: rows.length * LEGEND_ROW,
    at: (top) => {
      const out: { x: number; y: number }[] = [];
      rows.forEach((row, r) => {
        const rowWidth =
          row.reduce((sum, i) => sum + widths[i]!, 0) + LEGEND_GAP * (row.length - 1);
        let x = (width - rowWidth) / 2;
        for (const i of row) {
          out[i] = { x, y: top + r * LEGEND_ROW };
          x += widths[i]! + LEGEND_GAP;
        }
      });
      return out;
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildChartElement(recharts: any, chart: ChartInstance) {
  const {
    BarChart,
    Bar,
    LineChart,
    Line,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    LabelList,
  } = recharts;
  const { width, height, data, colors, chartType, showGrid, showLegend, showValues } = chart;
  const color = (i: number) => colors[i % colors.length];
  // Auf dunklem Grund (Folie in Tanne) stehen Achsen, Legende und Werte weiß.
  const ink = chartInk(chart);
  const tick = { ...AXIS_TICK, fill: ink };
  const valueLabel = { ...VALUE_LABEL, fill: ink };
  const outlines = chartSeriesOutlines(chart);
  const outline = (i: number) => {
    const stroke = outlines[i % colors.length];
    return stroke ? { stroke, strokeWidth: OUTLINE_PX / chart.scale } : {};
  };
  const unit = chart.unit ? ` ${chart.unit}` : '';
  const formatValue = (value: unknown) => `${String(value)}${unit}`;
  const round = chartType === 'pie' || chartType === 'donut';
  const series = chartSeries(chart);
  // A single cartesian series needs no legend: its name is the chart's title.
  const entries: LegendEntry[] = !showLegend
    ? []
    : round
      ? data.map((d, index) => ({ name: d.name, index }))
      : (series ?? []).map((s, index) => ({ name: s.name, index }));
  const legendPosition = chartLegendPosition(chart);
  const legend = entries.length > 0 ? layoutLegend(entries, legendPosition, width, height) : null;
  const legendTop = height - (legend?.height ?? 0);
  const legendSvg = legend ? (
    <g>
      {legend.at(legendTop).map((pos, i) => (
        <g key={i} transform={`translate(${pos.x}, ${pos.y})`}>
          <rect
            width={14}
            height={14}
            y={3}
            rx={3}
            fill={color(entries[i]!.index)}
            {...outline(entries[i]!.index)}
          />
          <text x={LEGEND_TEXT_X} y={10} dominantBaseline="central" {...tick}>
            {entries[i]!.name}
          </text>
        </g>
      ))}
    </g>
  ) : null;
  // Several series: one row per category, one key per series.
  const rows = series
    ? data.map((d, i) => ({
        name: d.name,
        ...Object.fromEntries(series.map((s, si) => [`s${si}`, s.values[i] ?? 0])),
      }))
    : data;
  const keys = series ? series.map((_, si) => `s${si}`) : ['value'];
  const allValues = series ? series.flatMap((s) => s.values) : data.map((d) => d.value);
  const common = {
    width,
    height,
    data: rows,
    margin: {
      top: 16,
      right: 20 + (legend?.width ?? 0),
      bottom: 8 + (legend?.height ? legend.height + 8 : 0),
      left: 0,
    },
  };

  if (round) {
    const pieWidth = width - (legend?.width ?? 0);
    const pieHeight = height - (legend?.height ? legend.height + 8 : 0);
    // Outside labels sit 20 px past the slice: room for them above, below and,
    // as wide as the longest one (~8 px a bold character), to the sides.
    const labelWidth = showValues
      ? Math.max(
          ...data.map(
            (d) => (showLegend ? formatValue(d.value) : `${d.name} ${formatValue(d.value)}`).length
          )
        ) * 8
      : 0;
    const radius = Math.max(20, Math.min(pieWidth / 2 - 24 - labelWidth, pieHeight / 2 - 30));
    return (
      <PieChart width={width} height={height}>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx={pieWidth / 2}
          cy={pieHeight / 2}
          outerRadius={radius}
          innerRadius={chartType === 'donut' ? radius * 0.55 : 0}
          isAnimationActive={false}
          label={
            showValues
              ? (p: {
                  x: number;
                  y: number;
                  textAnchor: 'start' | 'middle' | 'end';
                  name: string;
                  value: unknown;
                }) => (
                  <text
                    x={p.x}
                    y={p.y}
                    textAnchor={p.textAnchor}
                    dominantBaseline="central"
                    {...valueLabel}
                  >
                    {showLegend ? formatValue(p.value) : `${p.name} ${formatValue(p.value)}`}
                  </text>
                )
              : false
          }
        >
          {data.map((_, i) => (
            <Cell key={i} fill={color(i)} {...outline(i)} />
          ))}
        </Pie>
        {legendSvg}
      </PieChart>
    );
  }

  if (chartType === 'line' || chartType === 'area') {
    const lines = keys.map((key, si) => {
      const labels = showValues ? (
        <LabelList dataKey={key} formatter={formatValue} {...valueLabel} position="top" />
      ) : null;
      return chartType === 'area' ? (
        <Area
          key={key}
          dataKey={key}
          type="monotone"
          stroke={color(si)}
          strokeWidth={3}
          fill={color(si)}
          fillOpacity={0.25}
          dot={{ r: 4, fill: color(si) }}
          isAnimationActive={false}
        >
          {labels}
        </Area>
      ) : (
        <Line
          key={key}
          dataKey={key}
          type="monotone"
          stroke={color(si)}
          strokeWidth={3}
          dot={{ r: 4, fill: color(si) }}
          isAnimationActive={false}
        >
          {labels}
        </Line>
      );
    });
    const Wrapper = chartType === 'area' ? AreaChart : LineChart;
    return (
      <Wrapper {...common}>
        {showGrid ? <CartesianGrid strokeDasharray="3 3" stroke="#e0e0df" /> : null}
        {/* Inset the first and last point: their value labels otherwise sit on the y-axis ticks. */}
        <XAxis
          dataKey="name"
          tick={tick}
          tickLine={false}
          axisLine={{ stroke: '#c8c8c7' }}
          padding={{ left: 28, right: 28 }}
        />
        <YAxis tick={tick} tickLine={false} axisLine={{ stroke: '#c8c8c7' }} width={40} />
        {lines}
        {legendSvg}
      </Wrapper>
    );
  }

  // bar / bar-horizontal
  const horizontal = chartType === 'bar-horizontal';
  // Room for the longest category name on the left and the longest value label
  // past the bar's end (~8.5 px a bold character).
  const nameWidth = Math.min(
    width * 0.4,
    Math.max(64, Math.ceil(Math.max(...data.map((d) => tickTextWidth(d.name)))) + 12)
  );
  const valueRoom = showValues
    ? Math.max(...allValues.map((v) => formatValue(v).length)) * 8.5 + 12
    : 0;
  return (
    <BarChart
      {...common}
      // The value labels sit past the bar's end, left of a legend column.
      {...(horizontal && {
        margin: { ...common.margin, right: (legend?.width ?? 0) + Math.max(20, valueRoom) },
      })}
      layout={horizontal ? 'vertical' : 'horizontal'}
    >
      {showGrid ? (
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#e0e0df"
          vertical={horizontal}
          horizontal={!horizontal}
        />
      ) : null}
      {horizontal ? (
        <>
          <XAxis type="number" tick={tick} tickLine={false} axisLine={{ stroke: '#c8c8c7' }} />
          <YAxis
            type="category"
            dataKey="name"
            tick={tick}
            tickLine={false}
            axisLine={{ stroke: '#c8c8c7' }}
            width={nameWidth}
            // Recharts' default `preserveEnd` drops names it measures as colliding.
            interval={0}
          />
        </>
      ) : (
        <>
          <XAxis dataKey="name" tick={tick} tickLine={false} axisLine={{ stroke: '#c8c8c7' }} />
          <YAxis tick={tick} tickLine={false} axisLine={{ stroke: '#c8c8c7' }} width={40} />
        </>
      )}
      {keys.map((key, si) => (
        <Bar
          key={key}
          dataKey={key}
          isAnimationActive={false}
          radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          // A single series colours each bar, several series each series.
          {...(series ? { fill: color(si), ...outline(si) } : {})}
        >
          {series ? null : data.map((_, i) => <Cell key={i} fill={color(i)} {...outline(i)} />)}
          {showValues ? (
            <LabelList
              dataKey={key}
              formatter={formatValue}
              {...valueLabel}
              position={horizontal ? 'right' : 'top'}
            />
          ) : null}
        </Bar>
      ))}
      {legendSvg}
    </BarChart>
  );
}

async function renderChartImage(chart: ChartInstance): Promise<HTMLImageElement | null> {
  const container = document.createElement('div');
  container.style.cssText = `position:absolute;left:-99999px;top:0;width:${chart.width}px;height:${chart.height}px;font-family:sans-serif;`;
  document.body.appendChild(container);

  const recharts = await import('recharts');
  const root = createRoot(container);
  root.render(buildChartElement(recharts, chart));

  // Recharts paints after a couple of frames; poll for a populated <svg>.
  const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  let svg: SVGSVGElement | null = null;
  for (let i = 0; i < 8; i++) {
    await raf();
    // The chart's own surface — a legend brings icon <svg>s of its own, ahead of it.
    svg = container.querySelector('.recharts-wrapper > svg');
    if (svg && svg.querySelector('path, rect, line, circle, text')) break;
  }

  let image: HTMLImageElement | null = null;
  if (svg) {
    svg.setAttribute('width', String(chart.width));
    svg.setAttribute('height', String(chart.height));
    svg.setAttribute('font-family', 'sans-serif');
    const xml = new XMLSerializer().serializeToString(svg);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    image = await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  root.unmount();
  container.remove();
  return image;
}

function ChartPrimitiveInner({
  chart,
  isSelected,
  onSelect,
  onDragEnd,
  onTransformEnd,
  draggable = true,
}: ChartPrimitiveProps) {
  const locked = useIsItemLocked();
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  // The image with the visual state it was drawn from: while they differ, a
  // render is in flight and an offscreen capture has to wait for it.
  const visualKey = JSON.stringify([
    chart.chartType,
    chart.data,
    chart.series ?? [],
    chart.colors,
    chart.width,
    chart.height,
    chart.showLegend,
    chart.legendPosition ?? '',
    chart.showGrid,
    chart.showValues,
    chart.unit ?? '',
    chart.background ?? '',
    chart.scale,
  ]);
  const [rendered, setRendered] = useState<{ image: HTMLImageElement | null; key: string }>({
    image: null,
    key: '',
  });
  const image = rendered.image;
  useTrackPendingImage(chart.id, visualKey, rendered.key === visualKey ? 'loaded' : 'loading');

  useEffect(() => {
    if (isSelected && transformerRef.current && groupRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, image]);

  // Re-render the chart image whenever the instance's visual data changes.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void renderChartImage(chart)
        .catch(() => null)
        .then((img) => {
          // A failed render keeps the last image but stops the wait.
          if (!cancelled) setRendered((prev) => ({ image: img ?? prev.image, key: visualKey }));
        });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `visualKey` covers what the image shows
  }, [visualKey]);

  const { width, height } = chart;

  return (
    <>
      <Group
        ref={groupRef}
        x={chart.x}
        y={chart.y}
        scaleX={chart.scale}
        scaleY={chart.scale}
        rotation={chart.rotation}
        opacity={chart.opacity}
        draggable={draggable && !locked}
        onMouseDown={(e) => {
          e.cancelBubble = true;
          onSelect(chart.id);
        }}
        onTouchStart={(e) => {
          e.cancelBubble = true;
          onSelect(chart.id);
        }}
        onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
        onTransformEnd={() => {
          const node = groupRef.current;
          if (!node) return;
          const scale = node.scaleX();
          const rotation = node.rotation();
          onTransformEnd(node.x(), node.y(), scale, rotation);
        }}
      >
        {image ? (
          <Image image={image} width={width} height={height} />
        ) : (
          <Rect width={width} height={height} fill="#f4f4f3" cornerRadius={8} />
        )}

        {isSelected && (
          <Rect
            name="selection-chrome"
            width={width}
            height={height}
            stroke="#005437"
            strokeWidth={2 / chart.scale}
            dash={[6, 6]}
            listening={false}
          />
        )}
      </Group>

      {isSelected && (
        <Transformer
          anchorStyleFunc={touchAnchorStyleFunc}
          ref={transformerRef}
          keepRatio={true}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          rotateEnabled={true}
          anchorSize={10}
          anchorCornerRadius={5}
          borderStroke="#005437"
          anchorStroke="#005437"
          anchorFill="#ffffff"
          {...ELEMENT_TRANSFORMER}
          {...(locked ? LOCKED_TRANSFORMER : {})}
        />
      )}
    </>
  );
}

export const ChartPrimitive = memo(ChartPrimitiveInner, (prev, next) => {
  const a = prev.chart;
  const b = next.chart;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.draggable !== next.draggable) return false;
  return (
    a.id === b.id &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.scale === b.scale &&
    a.rotation === b.rotation &&
    a.opacity === b.opacity &&
    a.chartType === b.chartType &&
    a.data === b.data &&
    a.series === b.series &&
    a.colors === b.colors &&
    a.showLegend === b.showLegend &&
    a.legendPosition === b.legendPosition &&
    a.showGrid === b.showGrid &&
    a.showValues === b.showValues &&
    a.unit === b.unit &&
    a.background === b.background
  );
});

ChartPrimitive.displayName = 'ChartPrimitive';

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

import type { ChartInstance } from '../utils/chartUtils';
import type Konva from 'konva';

export interface ChartPrimitiveProps {
  chart: ChartInstance;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (x: number, y: number, scale: number, rotation: number) => void;
  draggable?: boolean;
}

const AXIS_TICK = { fontSize: 13, fill: '#40403f' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildChartElement(recharts: any, chart: ChartInstance) {
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
    Legend,
    LabelList,
  } = recharts;
  const { width, height, data, colors, chartType, showGrid, showLegend, showValues } = chart;
  const color = (i: number) => colors[i % colors.length];
  const common = {
    width,
    height,
    data,
    margin: { top: 16, right: 20, bottom: 8, left: 0 },
  };

  if (chartType === 'pie' || chartType === 'donut') {
    const radius = Math.min(width, height) / 2 - 24;
    return (
      <PieChart width={width} height={height}>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={radius}
          innerRadius={chartType === 'donut' ? radius * 0.55 : 0}
          isAnimationActive={false}
          label={showValues}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={color(i)} />
          ))}
        </Pie>
        {showLegend ? <Legend /> : null}
      </PieChart>
    );
  }

  if (chartType === 'line' || chartType === 'area') {
    const series =
      chartType === 'area' ? (
        <Area
          dataKey="value"
          type="monotone"
          stroke={color(0)}
          strokeWidth={3}
          fill={color(0)}
          fillOpacity={0.25}
          dot={{ r: 4, fill: color(0) }}
          isAnimationActive={false}
        >
          {showValues ? <LabelList dataKey="value" position="top" /> : null}
        </Area>
      ) : (
        <Line
          dataKey="value"
          type="monotone"
          stroke={color(0)}
          strokeWidth={3}
          dot={{ r: 4, fill: color(0) }}
          isAnimationActive={false}
        >
          {showValues ? <LabelList dataKey="value" position="top" /> : null}
        </Line>
      );
    const Wrapper = chartType === 'area' ? AreaChart : LineChart;
    return (
      <Wrapper {...common}>
        {showGrid ? <CartesianGrid strokeDasharray="3 3" stroke="#e0e0df" /> : null}
        <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#c8c8c7' }} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#c8c8c7' }} width={40} />
        {showLegend ? <Legend /> : null}
        {series}
      </Wrapper>
    );
  }

  // bar / bar-horizontal
  const horizontal = chartType === 'bar-horizontal';
  return (
    <BarChart {...common} layout={horizontal ? 'vertical' : 'horizontal'}>
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
          <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#c8c8c7' }} />
          <YAxis
            type="category"
            dataKey="name"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: '#c8c8c7' }}
            width={64}
          />
        </>
      ) : (
        <>
          <XAxis
            dataKey="name"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: '#c8c8c7' }}
          />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: '#c8c8c7' }} width={40} />
        </>
      )}
      {showLegend ? <Legend /> : null}
      <Bar
        dataKey="value"
        isAnimationActive={false}
        radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
      >
        {data.map((_, i) => (
          <Cell key={i} fill={color(i)} />
        ))}
        {showValues ? <LabelList dataKey="value" position={horizontal ? 'right' : 'top'} /> : null}
      </Bar>
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
    svg = container.querySelector('svg');
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
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

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
      void renderChartImage(chart).then((img) => {
        if (!cancelled && img) setImage(img);
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    chart.chartType,
    chart.data,
    chart.colors,
    chart.width,
    chart.height,
    chart.showLegend,
    chart.showGrid,
    chart.showValues,
  ]);

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
        draggable={draggable}
        onClick={(e) => {
          e.cancelBubble = true;
          onSelect(chart.id);
        }}
        onTap={(e) => {
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
          ref={transformerRef}
          keepRatio={true}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          rotateEnabled={true}
          rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
          rotationSnapTolerance={7}
          anchorSize={10}
          anchorCornerRadius={5}
          borderStroke="#005437"
          anchorStroke="#005437"
          anchorFill="#ffffff"
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
    a.colors === b.colors &&
    a.showLegend === b.showLegend &&
    a.showGrid === b.showGrid &&
    a.showValues === b.showValues
  );
});

ChartPrimitive.displayName = 'ChartPrimitive';

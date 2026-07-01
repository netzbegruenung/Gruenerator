'use client';

import { useMemo } from 'react';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@gruenerator/ui';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';

import type { ChartData } from '../../hooks/useChatGraphStream';

/**
 * Fallback palette in Grünen brand greens, used when the backend `ChartData`
 * carries no explicit `colors`. The chart node normally supplies brand colors,
 * so this only kicks in for older/hand-authored payloads.
 */
const BRAND_COLORS = ['#005437', '#46962b', '#8abd24', '#c3d117', '#004b76', '#f5a623'];

function colorAt(colors: string[] | undefined, index: number): string {
  if (colors && colors.length > 0) return colors[index % colors.length];
  return BRAND_COLORS[index % BRAND_COLORS.length];
}

/**
 * Renders a `ChartData` payload (from the backend `chart` intent) inline in the
 * chat using the shared shadcn/Recharts wrapper. Supports bar/line/area/pie/donut.
 */
export function ChatChart({ data: chart }: { data: ChartData }) {
  const config = useMemo<ChartConfig>(() => {
    const entries: ChartConfig = {};
    chart.yKeys.forEach((key, i) => {
      entries[key] = { label: key, color: colorAt(chart.colors, i) };
    });
    return entries;
  }, [chart.yKeys, chart.colors]);

  const isPie = chart.type === 'pie' || chart.type === 'donut';

  return (
    <figure className="my-3 overflow-hidden rounded-lg border border-border bg-background p-3">
      {chart.title && (
        <figcaption className="mb-2 text-sm font-medium text-foreground">{chart.title}</figcaption>
      )}
      <ChartContainer config={config} className="min-h-[220px] w-full">
        {isPie ? (
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent />} />
            <Pie
              data={chart.data}
              dataKey={chart.yKeys[0]}
              nameKey={chart.xKey}
              innerRadius={chart.type === 'donut' ? 60 : 0}
              isAnimationActive={false}
            >
              {chart.data.map((_, i) => (
                <Cell key={i} fill={colorAt(chart.colors, i)} />
              ))}
            </Pie>
            <ChartLegend content={<ChartLegendContent nameKey={chart.xKey} />} />
          </PieChart>
        ) : chart.type === 'line' ? (
          <LineChart data={chart.data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={chart.xKey} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={36} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {chart.yKeys.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
            {chart.yKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colorAt(chart.colors, i)}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        ) : chart.type === 'area' ? (
          <AreaChart data={chart.data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={chart.xKey} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={36} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {chart.yKeys.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
            {chart.yKeys.map((key, i) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={colorAt(chart.colors, i)}
                fill={colorAt(chart.colors, i)}
                fillOpacity={0.2}
                strokeWidth={2}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        ) : (
          <BarChart data={chart.data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={chart.xKey} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={36} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {chart.yKeys.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
            {chart.yKeys.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                fill={colorAt(chart.colors, i)}
                radius={3}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        )}
      </ChartContainer>
    </figure>
  );
}

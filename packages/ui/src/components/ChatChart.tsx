import * as React from 'react';
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

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from './chart';

/**
 * Data shape emitted by the chat backend as a ```chart fenced JSON block
 * (mirrors `ChartData` in the API's ChatGraph types). Rendered both while a
 * message streams and when a thread is reloaded — the block lives in the
 * persisted message text, so there is a single render path for both.
 */
export interface ChatChartData {
  type: 'bar' | 'line' | 'area' | 'pie' | 'donut';
  title?: string;
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKeys: string[];
  colors?: string[];
}

const DEFAULT_COLORS = ['#005538', '#8AC9B0', '#52907A', '#B1E0C9', '#003D28', '#6BAA91'];

export function ChatChart({ data }: { data: ChatChartData }) {
  const colors = data.colors?.length ? data.colors : DEFAULT_COLORS;

  const seriesConfig: ChartConfig = {};
  data.yKeys.forEach((key, i) => {
    seriesConfig[key] = { label: key, color: colors[i % colors.length] };
  });

  const chart = renderChart(data, colors, seriesConfig);
  if (!chart) return null;

  return (
    <figure className="my-3 rounded-lg border border-border bg-card p-3">
      {data.title ? (
        <figcaption className="mb-2 text-sm font-medium text-foreground">{data.title}</figcaption>
      ) : null}
      {chart}
    </figure>
  );
}

function renderChart(
  data: ChatChartData,
  colors: string[],
  seriesConfig: ChartConfig
): React.ReactElement | null {
  if (data.type === 'pie' || data.type === 'donut') {
    const valueKey = data.yKeys[0];
    if (!valueKey) return null;
    const sliceConfig: ChartConfig = {};
    data.data.forEach((row, i) => {
      const name = String(row[data.xKey]);
      sliceConfig[name] = { label: name, color: colors[i % colors.length] };
    });
    return (
      <ChartContainer config={sliceConfig} className="min-h-[240px] w-full">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Pie
            data={data.data}
            dataKey={valueKey}
            nameKey={data.xKey}
            innerRadius={data.type === 'donut' ? 60 : 0}
          >
            {data.data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <ChartLegend content={<ChartLegendContent nameKey={data.xKey} />} />
        </PieChart>
      </ChartContainer>
    );
  }

  const showLegend = data.yKeys.length > 1;

  if (data.type === 'line') {
    return (
      <ChartContainer config={seriesConfig} className="min-h-[240px] w-full">
        <LineChart accessibilityLayer data={data.data}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={data.xKey} tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} tickMargin={8} width={40} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {showLegend ? <ChartLegend content={<ChartLegendContent />} /> : null}
          {data.yKeys.map((key) => (
            <Line
              key={key}
              dataKey={key}
              type="monotone"
              stroke={`var(--color-${key})`}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ChartContainer>
    );
  }

  if (data.type === 'area') {
    return (
      <ChartContainer config={seriesConfig} className="min-h-[240px] w-full">
        <AreaChart accessibilityLayer data={data.data}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={data.xKey} tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} tickMargin={8} width={40} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {showLegend ? <ChartLegend content={<ChartLegendContent />} /> : null}
          {data.yKeys.map((key) => (
            <Area
              key={key}
              dataKey={key}
              type="monotone"
              stroke={`var(--color-${key})`}
              fill={`var(--color-${key})`}
              fillOpacity={0.2}
            />
          ))}
        </AreaChart>
      </ChartContainer>
    );
  }

  // bar (default)
  return (
    <ChartContainer config={seriesConfig} className="min-h-[240px] w-full">
      <BarChart accessibilityLayer data={data.data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={data.xKey} tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} width={40} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {showLegend ? <ChartLegend content={<ChartLegendContent />} /> : null}
        {data.yKeys.map((key) => (
          <Bar key={key} dataKey={key} fill={`var(--color-${key})`} radius={4} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

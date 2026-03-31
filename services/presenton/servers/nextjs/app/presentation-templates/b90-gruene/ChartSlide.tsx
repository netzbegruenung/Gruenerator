import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import * as z from 'zod';

export const layoutId = 'b90-chart-slide';
export const layoutName = 'Diagrammfolie';
export const layoutDescription =
  'Folie mit Titel, Beschreibung und einem Diagramm. Unterstützt Balken-, Linien-, Flächen-, Kreis- und Ringdiagramme.';

const DEFAULT_COLORS = ['#005538', '#8AC9B0', '#52907A', '#B1E0C9', '#003D28', '#6BAA91'];

const SeriesSchema = z.object({
  name: z.string().max(32),
  color: z.string().optional(),
  values: z.array(z.number()).min(1),
});

export const Schema = z.object({
  title: z.string().max(40).describe('Titel der Folie').default('Ergebnisse im Überblick'),
  description: z
    .string()
    .max(200)
    .describe('Kurze Beschreibung zum Diagramm')
    .default(
      'Die wichtigsten Kennzahlen der letzten Quartale zeigen eine positive Entwicklung in allen Bereichen.'
    ),
  chart: z
    .object({
      type: z.enum(['bar', 'line', 'area', 'pie', 'donut']).default('bar'),
      categories: z.array(z.string().max(16)).min(1),
      series: z.array(SeriesSchema).min(1),
    })
    .describe('Diagramm-Konfiguration')
    .default({
      type: 'bar',
      categories: ['Q1', 'Q2', 'Q3', 'Q4'],
      series: [
        { name: 'Mitglieder', values: [1200, 1450, 1680, 1920] },
        { name: 'Veranstaltungen', values: [45, 62, 78, 95] },
      ],
    }),
});

type SlideData = z.infer<typeof Schema>;

const FONT_FACE = `
@font-face { font-family: 'PT Sans'; src: url('/fonts/PTSans-Regular.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: 'PT Sans'; src: url('/fonts/PTSans-Bold.woff2') format('woff2'); font-weight: 700; font-style: normal; font-display: swap; }
`;

const buildData = (categories: string[], series: z.infer<typeof SeriesSchema>[]) =>
  categories.map((name, i) => {
    const entry: Record<string, string | number> = { name };
    series.forEach((s) => {
      entry[s.name] = s.values[i] ?? 0;
    });
    return entry;
  });

const graphColor = (index: number, custom?: string) => {
  const fallback = custom || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
  return `var(--graph-${index}, ${fallback})`;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 shadow-lg text-sm"
      style={{
        backgroundColor: 'var(--card-color, #fff)',
        border: '1px solid var(--stroke, #E5E0D6)',
      }}
    >
      <p className="font-bold mb-1" style={{ color: 'var(--background-text, #000)' }}>
        {label}
      </p>
      {payload.map((e: any, i: number) => (
        <p key={i} style={{ color: 'var(--background-text, #000)' }}>
          {e.name}: <span className="font-bold">{e.value?.toLocaleString('de-DE')}</span>
        </p>
      ))}
    </div>
  );
};

const ChartRenderer: React.FC<{ chart: z.infer<typeof Schema>['chart'] }> = ({ chart }) => {
  const data = buildData(chart.categories, chart.series);
  const axisProps = {
    tick: { fill: 'var(--background-text, #666)', fontSize: 11 },
    axisLine: { stroke: 'var(--stroke, #E5E0D6)' },
    tickLine: { stroke: 'var(--stroke, #E5E0D6)' },
  };

  switch (chart.type) {
    case 'bar':
      return (
        <ResponsiveContainer width="100%" height={380}>
          <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke, #E5E0D6)" />
            <XAxis dataKey="name" {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
            <Legend />
            {chart.series.map((s, i) => (
              <Bar
                key={s.name}
                dataKey={s.name}
                fill={graphColor(i, s.color)}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    case 'line':
      return (
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke, #E5E0D6)" />
            <XAxis dataKey="name" {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
            <Legend />
            {chart.series.map((s, i) => (
              <Line
                key={s.name}
                type="monotone"
                dataKey={s.name}
                stroke={graphColor(i, s.color)}
                strokeWidth={3}
                dot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    case 'area':
      return (
        <ResponsiveContainer width="100%" height={380}>
          <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--stroke, #E5E0D6)" />
            <XAxis dataKey="name" {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
            <Legend />
            {chart.series.map((s, i) => (
              <Area
                key={s.name}
                type="monotone"
                dataKey={s.name}
                stroke={graphColor(i, s.color)}
                fill={graphColor(i, s.color)}
                fillOpacity={0.3}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      );
    case 'pie':
    case 'donut': {
      const pieData = chart.categories.map((name, i) => ({
        name,
        value: chart.series.reduce((sum, s) => sum + (s.values[i] || 0), 0),
      }));
      return (
        <ResponsiveContainer width="100%" height={380}>
          <PieChart>
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={chart.type === 'donut' ? 60 : 0}
              outerRadius={130}
              dataKey="value"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={graphColor(i)} stroke="white" strokeWidth={2} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      );
    }
    default:
      return null;
  }
};

const ChartSlide = ({ data }: { data: Partial<SlideData> }) => {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: FONT_FACE }} />
      <div
        className="relative w-full rounded-sm max-w-[1280px] shadow-lg max-h-[720px] aspect-video z-20 mx-auto overflow-hidden px-16 py-12 flex flex-col"
        style={{
          fontFamily: "var(--heading-font-family, 'PT Sans')",
          background: 'var(--background-color, #F5F1E9)',
        }}
      >
        {((data as any)?.__companyName__ || (data as any)?._logo_url__) && (
          <div className="absolute top-0 left-0 right-0 px-12 pt-5">
            <div className="flex items-center gap-2">
              {(data as any)?._logo_url__ && (
                <img
                  src={(data as any)?._logo_url__}
                  alt="logo"
                  className="w-[60px] object-contain"
                />
              )}
              {(data as any)?._logo_url__ && (data as any)?.__companyName__ && (
                <span
                  style={{ backgroundColor: 'var(--stroke, #E5E0D6)' }}
                  className="w-[2px] h-5"
                />
              )}
              {(data as any)?.__companyName__ && (
                <span
                  className="text-sm font-bold"
                  style={{ color: 'var(--background-text, #000000)' }}
                >
                  {(data as any)?.__companyName__}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-between items-start mt-6 mb-6">
          <div>
            <h1
              className="text-[38px] font-bold leading-[1.1] tracking-[-1px] mb-2"
              style={{ color: 'var(--background-text, #000)' }}
            >
              {data.title}
            </h1>
            <div
              className="w-[100px] h-[5px]"
              style={{ backgroundColor: 'var(--primary-color, #005538)' }}
            />
          </div>
          <p
            className="text-[15px] max-w-[400px] leading-[1.6] text-right"
            style={{ color: 'var(--background-text, #000)', opacity: 0.7 }}
          >
            {data.description}
          </p>
        </div>

        <div
          className="flex-1 rounded-xl p-4"
          style={{
            backgroundColor: 'var(--card-color, #FFFFFF)',
            border: '1px solid var(--stroke, #E5E0D6)',
          }}
        >
          {data.chart && <ChartRenderer chart={data.chart} />}
        </div>
      </div>
    </>
  );
};

export default ChartSlide;

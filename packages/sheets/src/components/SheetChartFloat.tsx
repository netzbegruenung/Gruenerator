import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { type SheetChartData } from '../ai/buildChartData.js';

/** Grünerator brand palette (matches packages/ui chart.tsx). */
const COLORS = ['#005538', '#57ab27', '#8AC9B0', '#46962b', '#e6007e', '#f5a623', '#2b6cb0'];

/**
 * Props a Univer Float DOM passes to a registered component: `data` is the
 * Serializable payload from addFloatDomToRange({ data }); the rest are supplied
 * by Univer's FloatDom renderer (see ui/views/components/dom/FloatDom.tsx).
 */
export interface SheetChartFloatProps {
  data?: SheetChartData;
  unitId?: string;
  floatDomId?: string;
}

const wrapperStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  background: '#fff',
  border: '1px solid #d9d9d9',
  borderRadius: 6,
  boxSizing: 'border-box',
  padding: 8,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

/**
 * Renders an AI/user-created chart inside a Univer Float DOM. Univer's native
 * charts are Pro-only; this draws the same data with Recharts, anchored to the
 * source range. The config lives in the float-DOM `data` (persisted in the
 * workbook snapshot and synced through the mutation-log bridge).
 */
export function SheetChartFloat({ data }: SheetChartFloatProps) {
  if (!data || data.rows.length === 0 || data.seriesKeys.length === 0) {
    return <div style={wrapperStyle}>Keine Diagrammdaten</div>;
  }

  const { chartType, title, categoryKey, seriesKeys, rows } = data;
  // Guaranteed by the guard above (seriesKeys is non-empty).
  const firstSeries = seriesKeys[0]!;

  return (
    <div style={wrapperStyle}>
      {title ? (
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 4,
            color: '#111',
            flex: '0 0 auto',
          }}
        >
          {title}
        </div>
      ) : null}
      <div style={{ flex: '1 1 auto', minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'bar' ? (
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey={categoryKey} fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend />
              {seriesKeys.map((key, i) => (
                <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} />
              ))}
            </BarChart>
          ) : chartType === 'line' ? (
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey={categoryKey} fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend />
              {seriesKeys.map((key, i) => (
                <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} />
              ))}
            </LineChart>
          ) : chartType === 'area' ? (
            <AreaChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey={categoryKey} fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend />
              {seriesKeys.map((key, i) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={COLORS[i % COLORS.length]}
                  fill={COLORS[i % COLORS.length]}
                  fillOpacity={0.3}
                />
              ))}
            </AreaChart>
          ) : (
            // pie | donut — first numeric series only
            <PieChart>
              <Tooltip />
              <Legend />
              <Pie
                data={rows}
                dataKey={firstSeries}
                nameKey={categoryKey}
                cx="50%"
                cy="50%"
                outerRadius="80%"
                innerRadius={chartType === 'donut' ? '55%' : 0}
              >
                {rows.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

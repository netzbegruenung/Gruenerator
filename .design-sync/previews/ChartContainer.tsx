import { ChartContainer, type ChartConfig } from '@gruenerator/ui';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

const umfrage = [
  { monat: 'Jan', wert: 18 },
  { monat: 'Feb', wert: 19 },
  { monat: 'Mär', wert: 21 },
  { monat: 'Apr', wert: 20 },
  { monat: 'Mai', wert: 23 },
  { monat: 'Jun', wert: 25 },
];

const config = {
  wert: { label: 'Umfragewert %', color: 'var(--secondary-600, #5F8575)' },
} satisfies ChartConfig;

// Monthly Umfragewerte as a bar chart — the chart shell wraps a recharts
// BarChart with the DS chart styling and the brand-green series color.
export function Umfragewerte() {
  return (
    <div style={{ width: 520, height: 300 }}>
      <ChartContainer config={config} style={{ width: '100%', height: '100%' }}>
        <BarChart
          width={520}
          height={300}
          data={umfrage}
          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis dataKey="monat" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={32} domain={[0, 30]} />
          <Bar dataKey="wert" fill="var(--color-wert)" radius={4} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

import { type ConventionArea } from '@gruenerator/contracts';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@gruenerator/ui/chart';
import { CartesianGrid, Scatter, ScatterChart, XAxis, YAxis } from 'recharts';

import { AREA_COLOR, AREA_LABEL, AREA_ORDER } from './shared';

type Point = { listPlace: number; resultPercent: number; area: ConventionArea; name: string };

const config = Object.fromEntries(
  AREA_ORDER.map((a) => [a, { label: AREA_LABEL[a], color: AREA_COLOR[a] }])
) as ChartConfig;

export function ResultScatter({
  points,
  onArea,
}: {
  points: Point[];
  onArea: (area: ConventionArea) => void;
}) {
  if (points.length === 0) return null;
  return (
    <figure className="m-0 flex flex-col gap-xs">
      <figcaption className="text-sm font-medium text-grey-800 dark:text-grey-100">
        Ergebnis nach Listenplatz
      </figcaption>
      <ChartContainer
        config={config}
        className="aspect-auto h-56 w-full"
        role="img"
        aria-label={`Streudiagramm: ${points.length} Wahlergebnisse nach Listenplatz`}
      >
        <ScatterChart>
          <CartesianGrid />
          <XAxis type="number" dataKey="listPlace" name="Listenplatz" tickLine={false} />
          <YAxis
            type="number"
            dataKey="resultPercent"
            name="Ergebnis in %"
            tickLine={false}
            width={36}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          {AREA_ORDER.map((a) => (
            <Scatter
              key={a}
              name={AREA_LABEL[a]}
              data={points.filter((p) => p.area === a)}
              fill={`var(--color-${a})`}
              cursor="pointer"
              onClick={() => onArea(a)}
            />
          ))}
        </ScatterChart>
      </ChartContainer>
    </figure>
  );
}

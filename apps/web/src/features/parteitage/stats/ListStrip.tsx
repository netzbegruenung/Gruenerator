import { type ConventionArea } from '@gruenerator/contracts';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@gruenerator/ui/chart';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';

import { AREA_COLOR, AREA_LABEL } from './shared';

type Block = { block: string; kreisfreieStadt: number; kreis: number; ohne: number };

const config = {
  kreisfreieStadt: { label: AREA_LABEL.kreisfreie_stadt, color: AREA_COLOR.kreisfreie_stadt },
  kreis: { label: AREA_LABEL.kreis, color: AREA_COLOR.kreis },
  ohne: { label: AREA_LABEL.ohne, color: AREA_COLOR.ohne },
} satisfies ChartConfig;

const KEY_AREA: Record<keyof Omit<Block, 'block'>, ConventionArea> = {
  kreisfreieStadt: 'kreisfreie_stadt',
  kreis: 'kreis',
  ohne: 'ohne',
};

export function ListStrip({
  blocks,
  onArea,
}: {
  blocks: Block[];
  onArea: (area: ConventionArea) => void;
}) {
  if (blocks.length === 0) return null;
  const summary = blocks
    .map(
      (b) =>
        `Plätze ${b.block}: ${b.kreisfreieStadt} kreisfreie Stadt, ${b.kreis} Kreis, ${b.ohne} ohne KV`
    )
    .join('; ');
  return (
    <figure className="m-0 flex flex-col gap-xs">
      <figcaption className="text-sm font-medium text-grey-800 dark:text-grey-100">
        Gewählte Listenplätze nach Herkunft
      </figcaption>
      <ChartContainer
        config={config}
        className="aspect-auto h-48 w-full"
        role="img"
        aria-label={summary}
      >
        <BarChart data={blocks}>
          <XAxis dataKey="block" tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {(Object.keys(KEY_AREA) as (keyof typeof KEY_AREA)[]).map((key) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="a"
              fill={`var(--color-${key})`}
              cursor="pointer"
              onClick={() => onArea(KEY_AREA[key])}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </figure>
  );
}

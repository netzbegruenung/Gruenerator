import { conventionAreaSchema, seatTypeSchema } from '@gruenerator/contracts';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { type ParteitagFilters } from './aggregate';

const PARAMS = {
  area: 'bereich',
  seatType: 'platz',
  topic: 'thema',
  day: 'tag',
  outcome: 'ergebnis',
} as const satisfies Record<keyof ParteitagFilters, string>;

function parse(params: URLSearchParams): ParteitagFilters {
  const area = conventionAreaSchema.safeParse(params.get(PARAMS.area));
  const seatType = seatTypeSchema.safeParse(params.get(PARAMS.seatType));
  const outcome = params.get(PARAMS.outcome);
  const day = params.get(PARAMS.day);
  return {
    area: area.success ? area.data : null,
    seatType: seatType.success ? seatType.data : null,
    topic: params.get(PARAMS.topic) || null,
    day: day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null,
    outcome: outcome === 'gewaehlt' || outcome === 'unterlegen' ? outcome : null,
  };
}

export function useParteitagFilters(): [
  ParteitagFilters,
  (patch: Partial<ParteitagFilters>) => void,
] {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parse(params), [params]);

  const update = useCallback(
    (patch: Partial<ParteitagFilters>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const key of Object.keys(patch) as (keyof ParteitagFilters)[]) {
            const value = patch[key];
            if (value) next.set(PARAMS[key], value);
            else next.delete(PARAMS[key]);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  return [filters, update];
}

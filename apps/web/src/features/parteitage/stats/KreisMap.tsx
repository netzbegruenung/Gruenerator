import { geoMercator, geoPath } from 'd3-geo';
import { scaleLinear } from 'd3-scale';
import { useEffect, useMemo, useState } from 'react';

import { TEXT_CLASS } from './shared';

import type { FeatureCollection, Geometry } from 'geojson';

const URL_NRW = '/geo/nrw-kreise.geo.json';
const WIDTH = 420;
const HEIGHT = 440;
const RAMP_LOW = '#e6f2dc';
const RAMP_HIGH = '#1a5e30';

type KreisProps = { AGS: string; GEN: string };

type Props = {
  /** Reden je AGS. */
  counts: Record<string, number>;
  selected: string | null;
  onSelect: (ags: string | null) => void;
};

function useGeo(): FeatureCollection<Geometry, KreisProps> | 'error' | null {
  const [data, setData] = useState<FeatureCollection<Geometry, KreisProps> | 'error' | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(URL_NRW)
      .then((r) => r.json())
      .then((d: FeatureCollection<Geometry, KreisProps>) => alive && setData(d))
      .catch(() => alive && setData('error'));
    return () => {
      alive = false;
    };
  }, []);
  return data;
}

function label(name: string, n: number): string {
  return `${name}: ${n} ${n === 1 ? 'Rede' : 'Reden'}`;
}

export function KreisMap({ counts, selected, onSelect }: Props) {
  const geo = useGeo();
  const [hover, setHover] = useState<string | null>(null);

  const max = Math.max(1, ...Object.values(counts));
  const shapes = useMemo(() => {
    if (!geo || geo === 'error') return [];
    const path = geoPath(geoMercator().fitSize([WIDTH, HEIGHT], geo));
    return geo.features.map((f) => ({
      ags: f.properties.AGS,
      name: f.properties.GEN,
      d: path(f) ?? '',
      cx: path.centroid(f)[0],
      cy: path.centroid(f)[1],
    }));
  }, [geo]);
  const color = useMemo(
    () => scaleLinear<string>().domain([1, max]).range([RAMP_LOW, RAMP_HIGH]).clamp(true),
    [max]
  );

  if (geo === 'error') {
    return <p className={`m-0 text-sm ${TEXT_CLASS}`}>Karte konnte nicht geladen werden.</p>;
  }
  if (!geo) return null;

  const active = shapes.find((s) => s.ags === hover) ?? null;

  return (
    <figure className="m-0 flex flex-col gap-xs">
      <figcaption className="text-sm font-medium text-grey-800 dark:text-grey-100">
        Reden nach Kreis
      </figcaption>
      <div className="relative max-w-md">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="block h-auto max-w-full"
          role="group"
          aria-label="Karte der NRW-Kreise mit Anzahl der Reden"
        >
          {shapes.map((s) => {
            const n = counts[s.ags] ?? 0;
            const isSel = selected === s.ags;
            return (
              <path
                key={s.ags}
                d={s.d}
                role="button"
                tabIndex={0}
                aria-label={label(s.name, n)}
                aria-pressed={isSel}
                fill={n > 0 ? color(n) : 'var(--grey-100, #eee)'}
                stroke={isSel ? 'var(--primary-600)' : 'var(--grey-50, #fff)'}
                strokeWidth={isSel ? 2.5 : 0.8}
                className="cursor-pointer outline-none focus-visible:stroke-[var(--primary-600)] focus-visible:[stroke-width:2.5px]"
                onClick={() => onSelect(isSel ? null : s.ags)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(isSel ? null : s.ags);
                  }
                }}
                onMouseEnter={() => setHover(s.ags)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(s.ags)}
                onBlur={() => setHover(null)}
              />
            );
          })}
        </svg>
        {active ? (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded bg-grey-900 px-2 py-1 text-xs text-white"
            style={{
              left: `${Math.min(Math.max((active.cx / WIDTH) * 100, 15), 85)}%`,
              top: `${Math.max((active.cy / HEIGHT) * 100 - 8, 0)}%`,
            }}
          >
            {label(active.name, counts[active.ags] ?? 0)}
          </div>
        ) : null}
      </div>
      <div className={`flex items-center gap-2 text-xs ${TEXT_CLASS}`}>
        <span>0</span>
        <span
          aria-hidden="true"
          className="inline-block h-2 w-24 rounded"
          style={{ background: `linear-gradient(to right, ${RAMP_LOW}, ${RAMP_HIGH})` }}
        />
        <span>{max} Reden</span>
        <span>· grau: keine Reden</span>
      </div>
      <p className={`m-0 text-xs ${TEXT_CLASS}`}>© GeoBasis-DE / BKG (2026), dl-de/by-2.0</p>
    </figure>
  );
}

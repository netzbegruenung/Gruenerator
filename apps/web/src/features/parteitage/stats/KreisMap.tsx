import { geoMercator, geoPath } from 'd3-geo';
import { useEffect, useMemo, useState } from 'react';

import { TEXT_CLASS } from './shared';

import type { FeatureCollection, Geometry } from 'geojson';

const URL_NRW = '/geo/nrw-kreise.geo.json';
const WIDTH = 420;
const HEIGHT = 440;
const STEPS = ['var(--pt-ramp-1)', 'var(--pt-ramp-2)', 'var(--pt-ramp-3)', 'var(--pt-ramp-4)'];

/** Gestufte Rampe; 0 Reden bekommt eine Schraffur, nie eine Rampenfarbe. */
export function kreisFill(n: number, max: number): string {
  if (n <= 0) return 'url(#pt-zero)';
  return STEPS[Math.min(STEPS.length, Math.max(1, Math.ceil((n / max) * STEPS.length))) - 1];
}

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
  const [focus, setFocus] = useState<string | null>(null);

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

  if (geo === 'error') {
    return <p className={`m-0 text-sm ${TEXT_CLASS}`}>Karte konnte nicht geladen werden.</p>;
  }
  if (!geo) return null;

  const selShape = shapes.find((s) => s.ags === selected) ?? null;
  const focusShape = shapes.find((s) => s.ags === focus) ?? null;
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
          <defs>
            <pattern
              id="pt-zero"
              width={6}
              height={6}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width={6} height={6} fill="var(--pt-bg)" />
              <line x1={0} y1={0} x2={0} y2={6} stroke="var(--pt-zero-line)" strokeWidth={1.5} />
            </pattern>
          </defs>
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
                fill={kreisFill(n, max)}
                stroke="var(--pt-bg)"
                strokeWidth={0.8}
                className="cursor-pointer outline-none"
                onClick={() => onSelect(isSel ? null : s.ags)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(isSel ? null : s.ags);
                  }
                }}
                onMouseEnter={() => setHover(s.ags)}
                onMouseLeave={() => setHover(null)}
                onFocus={(e) => {
                  setHover(s.ags);
                  let visible = true;
                  try {
                    visible = e.currentTarget.matches(':focus-visible');
                  } catch {
                    visible = true;
                  }
                  setFocus(visible ? s.ags : null);
                }}
                onBlur={() => {
                  setHover(null);
                  setFocus(null);
                }}
              />
            );
          })}
          {selShape ? (
            <path
              d={selShape.d}
              fill="none"
              stroke="var(--pt-ink)"
              strokeWidth={3.5}
              pointerEvents="none"
              data-testid="kreis-selected"
            />
          ) : null}
          {focusShape ? (
            <g pointerEvents="none" data-testid="kreis-focus">
              <path d={focusShape.d} fill="none" stroke="var(--pt-bg)" strokeWidth={5} />
              <path
                d={focusShape.d}
                fill="none"
                stroke="var(--pt-ink)"
                strokeWidth={2}
                strokeDasharray="4 3"
              />
            </g>
          ) : null}
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
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 rounded-sm border"
          style={{
            borderColor: 'var(--pt-zero-line)',
            background:
              'repeating-linear-gradient(45deg, var(--pt-zero-line) 0 1.5px, var(--pt-bg) 1.5px 4px)',
          }}
        />
        <span>keine Reden</span>
        {STEPS.map((c) => (
          <span
            key={c}
            aria-hidden="true"
            className="inline-block h-3 w-5"
            style={{ background: c }}
          />
        ))}
        <span>1 bis {max} Reden</span>
      </div>
      <p className={`m-0 text-xs ${TEXT_CLASS}`}>© GeoBasis-DE / BKG (2026), dl-de/by-2.0</p>
    </figure>
  );
}

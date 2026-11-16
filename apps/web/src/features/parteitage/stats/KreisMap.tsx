import { geoMercator, geoPath } from 'd3-geo';
import { useEffect, useMemo, useState } from 'react';
import { HiOutlineTableCells } from 'react-icons/hi2';

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

/** Legendenstufen passend zu `kreisFill`: nur Stufen, die eine ganze Zahl treffen kann. */
export function rampSteps(max: number): { color: string; label: string }[] {
  const out: { color: string; label: string }[] = [];
  STEPS.forEach((color, i) => {
    const lo = Math.floor((max * i) / STEPS.length) + 1;
    const hi = Math.floor((max * (i + 1)) / STEPS.length);
    if (hi < lo) return;
    out.push({ color, label: lo === hi ? `${lo}` : `${lo} bis ${hi}` });
  });
  return out;
}

function label(name: string, n: number): string {
  return `${name}: ${n} ${n === 1 ? 'Rede' : 'Reden'}`;
}

export function KreisMap({ counts, selected, onSelect }: Props) {
  const geo = useGeo();
  const [hover, setHover] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [asTable, setAsTable] = useState(false);

  const max = Math.max(1, ...Object.values(counts));
  const steps = rampSteps(max);
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
  const readout = active ?? selShape;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const rows = [...shapes].sort((a, b) => a.name.localeCompare(b.name, 'de'));

  return (
    <figure className="m-0 flex flex-col gap-sm rounded-lg border border-grey-200 bg-background p-md dark:border-grey-700">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <figcaption className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
          <span className="text-base font-semibold text-grey-800 dark:text-grey-100">
            Woher die Reden kommen
          </span>
          <span className={`text-sm ${TEXT_CLASS}`}>
            {total} {total === 1 ? 'Rede' : 'Reden'} nach Kreis oder kreisfreier Stadt des
            Kreisverbands.
          </span>
        </figcaption>
        <button
          type="button"
          aria-pressed={asTable}
          onClick={() => setAsTable((v) => !v)}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-2 text-sm font-medium text-primary-600 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:text-primary-300"
        >
          <HiOutlineTableCells aria-hidden="true" />
          {asTable ? 'Als Karte zeigen' : 'Als Tabelle zeigen'}
        </button>
      </div>

      {asTable ? (
        <div
          className="max-h-96 overflow-auto"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard-reachable
          tabIndex={0}
          role="region"
          aria-label="Reden je Kreis, alphabetisch"
        >
          <table className={`w-full border-collapse text-sm ${TEXT_CLASS}`}>
            <thead>
              <tr className="text-left">
                <th scope="col" className="p-1.5">
                  Kreis oder kreisfreie Stadt
                </th>
                <th scope="col" className="p-1.5 text-right">
                  Reden
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.ags} className="border-t border-grey-200 dark:border-grey-700">
                  <th scope="row" className="p-1.5 text-left font-normal">
                    {s.name}
                  </th>
                  <td className="p-1.5 text-right tabular-nums">{counts[s.ags] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid items-start gap-md md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
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
                  <line
                    x1={0}
                    y1={0}
                    x2={0}
                    y2={6}
                    stroke="var(--pt-zero-line)"
                    strokeWidth={1.5}
                  />
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
                <g pointerEvents="none" data-testid="kreis-selected">
                  <path d={selShape.d} fill="none" stroke="var(--pt-bg)" strokeWidth={6} />
                  <path d={selShape.d} fill="none" stroke="var(--pt-ink)" strokeWidth={3} />
                </g>
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
                aria-hidden="true"
                className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-grey-200 bg-background px-2 py-1 text-xs whitespace-nowrap text-foreground shadow-md dark:border-grey-700"
                style={{
                  left: `${Math.min(Math.max((active.cx / WIDTH) * 100, 15), 85)}%`,
                  top: `${Math.max((active.cy / HEIGHT) * 100 - 10, 0)}%`,
                }}
              >
                <strong className="block">{active.name}</strong>
                {counts[active.ags] ?? 0} {(counts[active.ags] ?? 0) === 1 ? 'Rede' : 'Reden'}
              </div>
            ) : null}
          </div>

          <div className={`flex flex-col gap-sm text-sm ${TEXT_CLASS}`}>
            <div className="flex flex-col gap-1.5">
              <p className="m-0 font-semibold text-grey-800 dark:text-grey-100">Reden je Kreis</p>
              <ul className="m-0 flex list-none flex-wrap gap-x-md gap-y-1 p-0 text-xs">
                <li className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="inline-block size-3.5 rounded-xs border"
                    style={{
                      borderColor: 'var(--pt-zero-line)',
                      background:
                        'repeating-linear-gradient(45deg, var(--pt-zero-line) 0 1.5px, var(--pt-bg) 1.5px 4px)',
                    }}
                  />
                  keine
                </li>
                {steps.map((st) => (
                  <li key={st.color} className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="inline-block size-3.5 rounded-xs"
                      style={{ background: st.color }}
                    />
                    {st.label}
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-t border-grey-200 pt-sm dark:border-grey-700" aria-hidden="true">
              {readout ? (
                <>
                  <strong className="block text-foreground">{readout.name}</strong>
                  {counts[readout.ags] ?? 0} {(counts[readout.ags] ?? 0) === 1 ? 'Rede' : 'Reden'}
                </>
              ) : (
                'Kreis überfahren oder anwählen, um die Zahl zu sehen.'
              )}
            </div>
          </div>
        </div>
      )}
      <p className={`m-0 text-xs ${TEXT_CLASS}`}>© GeoBasis-DE / BKG (2026), dl-de/by-2.0</p>
    </figure>
  );
}

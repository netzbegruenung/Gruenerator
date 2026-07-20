import { geoMercator, geoPath } from 'd3-geo';
import { scaleLinear } from 'd3-scale';
import { useEffect, useMemo, useState } from 'react';
import { feature } from 'topojson-client';

import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Topology } from 'topojson-specification';

/** Value + labels for one geo region; `v === null` renders as "keine Daten". */
export interface ChoroplethValue {
  v: number | null;
  label?: string;
  sub?: string;
  date?: string;
}
export type ChoroplethValues = Record<string, ChoroplethValue>;

const DE_URL = '/geo/de-bundeslaender.geo.json';
const EU_URL = '/geo/europe-110m.json';

// EU/near-EU countries the Europe map draws (names as they appear in the
// world-atlas countries-110m `properties.name`).
const EU_NAMES = new Set([
  'Germany',
  'Austria',
  'Finland',
  'Sweden',
  'Ireland',
  'France',
  'Spain',
  'Portugal',
  'Italy',
  'Switzerland',
  'Belgium',
  'Netherlands',
  'Luxembourg',
  'Denmark',
  'Norway',
  'United Kingdom',
  'Poland',
  'Czechia',
  'Slovakia',
  'Hungary',
  'Slovenia',
  'Croatia',
  'Bosnia and Herz.',
  'Serbia',
  'Montenegro',
  'Albania',
  'Macedonia',
  'North Macedonia',
  'Greece',
  'Bulgaria',
  'Romania',
  'Moldova',
  'Lithuania',
  'Latvia',
  'Estonia',
  'Kosovo',
]);

const fmt = (v: number | null | undefined): string =>
  v == null ? 'keine Daten' : `${String(v).replace('.', ',')}%`;

function useJson<T>(url: string): T | 'error' | null {
  const [data, setData] = useState<T | 'error' | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(url)
      .then((r) => r.json())
      .then((d: T) => alive && setData(d))
      .catch(() => alive && setData('error'));
    return () => {
      alive = false;
    };
  }, [url]);
  return data;
}

interface MapChartProps {
  geo: FeatureCollection;
  /** Optional geometry to fit the projection to (Europe uses a fixed bbox). */
  fitGeo?: Feature | FeatureCollection | Geometry;
  width: number;
  height: number;
  values: ChoroplethValues;
  /** Only label regions whose projected area exceeds this (keeps tiny states clean). */
  labelMin: number;
  /** Fallback color-scale range, used only until real values arrive. */
  domain: [number, number];
}

function MapChart({ geo, fitGeo, width, height, values, labelMin, domain }: MapChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  // Scale the color ramp to the actual PolitPro values (min..max) so a spread
  // like Thüringen 4 % → Baden-Württemberg 30 % uses the full gradient instead
  // of clamping against a fixed range. Fall back to `domain` until data loads.
  const scale = useMemo<[number, number]>(() => {
    const vals = Object.values(values)
      .map((x) => x.v)
      .filter((v): v is number => v != null);
    if (vals.length < 2) return domain;
    const lo = Math.floor(Math.min(...vals));
    const hi = Math.ceil(Math.max(...vals));
    return lo === hi ? [lo, lo + 1] : [lo, hi];
  }, [values, domain]);

  const feats = useMemo(() => {
    const proj = geoMercator().fitSize([width, height], fitGeo ?? geo);
    const path = geoPath(proj);
    const color = scaleLinear<string>().domain(scale).range(['#dceae2', '#2c5741']).clamp(true);
    return geo.features.map((f, i) => {
      const name = String(f.properties?.name ?? '');
      const d: Partial<ChoroplethValue> = values[name] ?? {};
      const centroid = path.centroid(f);
      return {
        i,
        d: path(f) ?? '',
        name: d.label ?? name,
        sub: d.sub,
        v: d.v ?? null,
        date: d.date,
        area: path.area(f),
        cx: centroid[0],
        cy: centroid[1],
        fill: d.v == null ? 'var(--map-nodata)' : color(d.v),
      };
    });
  }, [geo, fitGeo, width, height, values, scale]);

  const active = hover != null ? feats[hover] : null;
  const mid = (scale[0] + scale[1]) / 2;

  return (
    <div className="relative [--map-stroke:#fff] [--map-nodata:#eceeec] dark:[--map-stroke:#1b2b23] dark:[--map-nodata:#243029]">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto max-w-full"
      >
        {feats.map((s) => (
          <path
            key={s.i}
            d={s.d}
            fill={s.fill}
            stroke="var(--map-stroke)"
            strokeWidth={hover === s.i ? 2 : 1}
            className="cursor-pointer transition-opacity duration-100"
            style={{ opacity: hover == null || hover === s.i ? 1 : 0.55 }}
            onMouseEnter={() => setHover(s.i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {feats
          .filter((s) => s.v != null && s.area > labelMin)
          .map((s) => (
            <text
              key={`t${s.i}`}
              x={s.cx}
              y={s.cy}
              textAnchor="middle"
              dominantBaseline="middle"
              pointerEvents="none"
              style={{
                fontSize: 12,
                fontWeight: 700,
                fill: (s.v ?? 0) >= mid ? '#fff' : '#22382e',
              }}
            >
              {fmt(s.v)}
            </text>
          ))}
      </svg>

      {active && active.cx > 0 && active.cx < width && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#22382e] px-3 py-1.5 text-[13px] text-white shadow-[0_4px_14px_rgba(0,0,0,0.25)]"
          style={{
            left: Math.min(Math.max(active.cx, 70), width - 70),
            top: Math.max(active.cy - 34, 0),
          }}
        >
          <strong>{active.name}</strong>
          {active.sub ? ` (${active.sub})` : ''} · {fmt(active.v)}
          {active.date ? ` (${active.date})` : ''}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 text-[12px] text-[#5c6b63] dark:text-grey-400">
        <span>{scale[0]}%</span>
        <div className="h-2 max-w-[140px] flex-1 rounded bg-gradient-to-r from-[#dceae2] to-[#2c5741]" />
        <span>{scale[1]}%</span>
        <span className="ml-2 inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded bg-[var(--map-nodata)]" />
          keine Daten
        </span>
      </div>
    </div>
  );
}

function MapSkeleton({ width, height }: { width: number; height: number }) {
  return (
    <div
      style={{ width, height, maxWidth: '100%' }}
      className="animate-pulse rounded-2xl bg-grey-100 dark:bg-grey-800/50"
    />
  );
}

function MapError() {
  return <div className="p-6 text-sm text-grey-400">Karte konnte nicht geladen werden.</div>;
}

interface GreensMapProps {
  values?: ChoroplethValues;
  width?: number;
  height?: number;
}

export function DeutschlandMap({ values = {}, width = 380, height = 470 }: GreensMapProps) {
  const geo = useJson<FeatureCollection>(DE_URL);
  if (geo === 'error') return <MapError />;
  if (!geo) return <MapSkeleton width={width} height={height} />;
  return (
    <MapChart
      geo={geo}
      width={width}
      height={height}
      values={values}
      labelMin={900}
      domain={[3, 18]}
    />
  );
}

// Fixed lon/lat frame so Europe stays centred regardless of which countries carry data.
const EU_FIT: Geometry = {
  type: 'MultiPoint',
  coordinates: [
    [-11, 35],
    [31, 35],
    [31, 66],
    [-11, 66],
  ],
};

export function EuropaMap({ values = {}, width = 380, height = 470 }: GreensMapProps) {
  const topo = useJson<Topology>(EU_URL);
  if (topo === 'error') return <MapError />;
  if (!topo) return <MapSkeleton width={width} height={height} />;
  const all = feature(topo, topo.objects.countries) as unknown as FeatureCollection;
  const geo: FeatureCollection = {
    type: 'FeatureCollection',
    features: all.features.filter((f) => EU_NAMES.has(String(f.properties?.name ?? ''))),
  };
  return (
    <div className="overflow-hidden">
      <MapChart
        geo={geo}
        fitGeo={EU_FIT}
        width={width}
        height={height}
        values={values}
        labelMin={280}
        domain={[2, 15]}
      />
    </div>
  );
}

import {
  buildChoropleth,
  europeFeatures,
  EU_FIT,
  fmtValue as fmt,
  LABEL_INK,
  RAMP_HIGH,
  RAMP_LOW,
  RAMP_MID,
  type ChoroplethValues,
} from '@gruenerator/shared/monitor';
import { useEffect, useMemo, useState } from 'react';
import { feature } from 'topojson-client';

import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Topology } from 'topojson-specification';

const DE_URL = '/geo/de-bundeslaender.geo.json';
const EU_URL = '/geo/europe-110m.json';

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

  const { scale, shapes } = useMemo(
    () => buildChoropleth({ geo, fitGeo, width, height, values, domain }),
    [geo, fitGeo, width, height, values, domain]
  );
  const feats = useMemo(
    () =>
      shapes.map((s) => ({
        ...s,
        fill: s.v == null ? 'var(--map-nodata)' : s.marked ? 'url(#alliance-hatch)' : s.fill,
      })),
    [shapes]
  );

  const active = hover != null ? feats[hover] : null;
  const mid = (scale[0] + scale[1]) / 2;
  const hasMarked = feats.some((s) => s.marked);

  return (
    <div className="relative [--map-nodata:var(--dash-skeleton,#efe8eb)] [--map-stroke:var(--dash-card,#fff)]">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto max-w-full"
      >
        <defs>
          <pattern
            id="alliance-hatch"
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={6} height={6} fill={RAMP_LOW} />
            <line x1={0} y1={0} x2={0} y2={6} stroke={RAMP_MID} strokeWidth={2.5} />
          </pattern>
        </defs>
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
          .filter((s) => s.v != null && !s.marked && s.area > labelMin)
          .map((s) => (
            <text
              key={`t${s.i}`}
              x={s.cx}
              y={s.cy}
              textAnchor="middle"
              dominantBaseline="middle"
              pointerEvents="none"
              // The halo keeps numbers readable where they spill past a narrow
              // region (Denmark, Croatia, Luxembourg) onto a lighter neighbour.
              style={{
                fontSize: 12,
                fontWeight: 700,
                fill: (s.v ?? 0) >= mid ? '#fff' : LABEL_INK,
                stroke: (s.v ?? 0) >= mid ? RAMP_HIGH : '#fff',
                strokeWidth: 3,
                strokeLinejoin: 'round',
                paintOrder: 'stroke',
              }}
            >
              {fmt(s.v)}
            </text>
          ))}
      </svg>

      {active && active.cx > 0 && active.cx < width && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#2a0f1d] px-3 py-1.5 text-[13px] text-white shadow-[0_4px_14px_rgba(0,0,0,0.25)]"
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

      <div className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
        <span>{scale[0]}%</span>
        <div className="h-2 max-w-[140px] flex-1 rounded bg-gradient-to-r from-[#f8cfe1] to-[#8a004a]" />
        <span>{scale[1]}%</span>
        <span className="ml-2 inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded bg-[var(--map-nodata)]" />
          keine Daten
        </span>
        {hasMarked && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded bg-[repeating-linear-gradient(45deg,#c2457f_0_2px,#f8cfe1_2px_5px)]" />
            Bündnis
          </span>
        )}
      </div>
    </div>
  );
}

function MapSkeleton({ width, height }: { width: number; height: number }) {
  return (
    <div
      style={{ width, height, maxWidth: '100%' }}
      className="animate-pulse rounded-2xl bg-(--dash-skeleton)"
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
      // 600 keeps the city-states (Bremen 95, Hamburg 254, Berlin 275) tooltip-only
      // but lets Saarland (706) carry its number.
      labelMin={600}
      domain={[3, 18]}
    />
  );
}

export function EuropaMap({ values = {}, width = 380, height = 470 }: GreensMapProps) {
  const topo = useJson<Topology>(EU_URL);
  if (topo === 'error') return <MapError />;
  if (!topo) return <MapSkeleton width={width} height={height} />;
  const all = feature(topo, topo.objects.countries) as unknown as FeatureCollection;
  const geo = europeFeatures(all);
  return (
    <div className="overflow-hidden">
      <MapChart
        geo={geo}
        fitGeo={EU_FIT}
        width={width}
        height={height}
        values={values}
        // Only countries with data get a number, and none of them collide, so
        // even Luxembourg (38) carries its own.
        labelMin={30}
        domain={[2, 15]}
      />
    </div>
  );
}

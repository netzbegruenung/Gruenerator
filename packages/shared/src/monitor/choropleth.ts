import { type EuGreensData, type PollsOverviewResponse } from '@gruenerator/contracts';
import { geoMercator, geoPath } from 'd3-geo';
import { scaleLinear } from 'd3-scale';

import { BUNDESLAENDER } from './bundeslaender.js';
import { formatPollDate } from './pollFormat.js';

import type { Feature, FeatureCollection, Geometry } from 'geojson';

// Reine Helfer der Umfragen-Karten (Bundesländer, Europa) und der Sonntagsfrage.
// Web (SVG im DOM) und App (react-native-svg) zeichnen aus denselben Pfaden,
// Farben und Werten.

/** Display colors for parties in the monitor poll views (DE + AT). */
export const PARTY_COLORS: Record<string, string> = {
  'CDU/CSU': '#000000',
  AfD: '#009ee0',
  SPD: '#e3000f',
  GRÜNE: '#46962b',
  Grüne: '#46962b',
  'DIE LINKE': '#be3075',
  Linke: '#be3075',
  BSW: '#571D47',
  FDP: '#ffed00',
  Sonstige: '#aaaaaa',
  ÖVP: '#63C3D0',
  NEOS: '#E84188',
  SPÖ: '#e3000f',
  FPÖ: '#0E6EB8',
  KPÖ: '#d40000',
};

/** Value + labels for one geo region; `v === null` renders as "keine Daten". */
export interface ChoroplethValue {
  v: number | null;
  label?: string;
  sub?: string;
  date?: string;
  /**
   * Broad-alliance value (greens a minority partner): rendered hatched and
   * excluded from the color scale + numeric labels so it isn't read as pure
   * green strength.
   */
  marked?: boolean;
}
export type ChoroplethValues = Record<string, ChoroplethValue>;

// PolitPro country code → world-atlas English geo name (Europe choropleth join).
export const EU_CODE_GEO: Record<string, string> = {
  de: 'Germany',
  at: 'Austria',
  fi: 'Finland',
  se: 'Sweden',
  ie: 'Ireland',
  nl: 'Netherlands',
  lu: 'Luxembourg',
  it: 'Italy',
  hr: 'Croatia',
  pt: 'Portugal',
  lv: 'Latvia',
  ro: 'Romania',
  ee: 'Estonia',
  be: 'Belgium',
  dk: 'Denmark',
  no: 'Norway',
  ch: 'Switzerland',
  gb: 'United Kingdom',
  uk: 'United Kingdom',
  pl: 'Poland',
  cz: 'Czechia',
  sk: 'Slovakia',
  hu: 'Hungary',
  si: 'Slovenia',
  gr: 'Greece',
  bg: 'Bulgaria',
  lt: 'Lithuania',
  es: 'Spain',
  fr: 'France',
};

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

/** Only the countries the Europe map draws. */
export function europeFeatures(all: FeatureCollection): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: all.features.filter((f) => EU_NAMES.has(String(f.properties?.name ?? ''))),
  };
}

// Label anchors (lon/lat) for regions whose polygon centroid lands somewhere
// unusable — Brandenburg's centroid falls exactly on the Berlin enclave, so its
// number would render on top of Berlin. Norway's is pulled off the map by
// Svalbard, the UK's onto the Irish Sea by Northern Ireland, and Croatia's
// crescent puts it in Bosnia.
const LABEL_ANCHORS: Record<string, [number, number]> = {
  Brandenburg: [13.75, 52.05],
  Norway: [8.8, 61.2],
  'United Kingdom': [-1.6, 52.6],
  Croatia: [16.2, 45.6],
};

// Fixed lon/lat frame so Europe stays centred regardless of which countries carry data.
export const EU_FIT: Geometry = {
  type: 'MultiPoint',
  coordinates: [
    [-11, 35],
    [31, 35],
    [31, 66],
    [-11, 66],
  ],
};

// Farbrampe der grünen Stärke in den Dashboard-Farben (Magenta wie /briefing):
// hell = schwach, dunkel = stark.
export const RAMP_LOW = '#f8cfe1';
export const RAMP_MID = '#c2457f';
export const RAMP_HIGH = '#8a004a';
/** Zahl auf hellen Flächen. */
export const LABEL_INK = '#3a0d24';

/** Parties with a share above 0, strongest first. */
export function partyOrder(average: Record<string, number>): string[] {
  return Object.entries(average)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([k]) => k);
}

/** Per-Bundesland Grüne value keyed by geo name — ONE request for all 16. */
export function laenderGrueneValues(data: PollsOverviewResponse): ChoroplethValues {
  const values: ChoroplethValues = {};
  const byParliament = new Map(data.entries.map((e) => [e.parliament, e]));
  for (const b of BUNDESLAENDER) {
    const entry = byParliament.get(b.id);
    values[b.name] = {
      v: entry?.gruene ?? null,
      date: entry?.latestPollDate ? formatPollDate(entry.latestPollDate) : undefined,
    };
  }
  return values;
}

/** Grüne value per European country keyed by world-atlas geo name. */
export function europaGrueneValues(data: EuGreensData): ChoroplethValues {
  const values: ChoroplethValues = {};
  for (const r of data.results) {
    const geo = EU_CODE_GEO[r.countryCode];
    if (!geo) continue;
    values[geo] = { v: r.percent, label: r.countryName, sub: r.party, marked: r.broadAlliance };
  }
  return values;
}

/** "12,5%" or "keine Daten". */
export const fmtValue = (v: number | null | undefined): string =>
  v == null ? 'keine Daten' : `${String(v).replace('.', ',')}%`;

/**
 * Color-scale range scaled to the actual values (min..max) so a spread like
 * Thüringen 4 % → Baden-Württemberg 30 % uses the full ramp. Broad-alliance
 * values are excluded (FR NFP 24 % would dwarf real green results). Falls back
 * to `domain` until there are two real values.
 */
export function scaleDomain(values: ChoroplethValues, domain: [number, number]): [number, number] {
  const vals = Object.values(values)
    .filter((x) => !x.marked)
    .map((x) => x.v)
    .filter((v): v is number => v != null);
  if (vals.length < 2) return domain;
  const lo = Math.floor(Math.min(...vals));
  const hi = Math.ceil(Math.max(...vals));
  return lo === hi ? [lo, lo + 1] : [lo, hi];
}

export interface MapShape {
  /** Index in `geo.features`. */
  i: number;
  /** SVG path data. */
  d: string;
  /** The geo name the values are keyed by. */
  key: string;
  name: string;
  sub?: string;
  v: number | null;
  date?: string;
  marked: boolean;
  /** Projected area in px² — drives which regions carry a number. */
  area: number;
  cx: number;
  cy: number;
  /** Ramp color for a real value; callers draw "keine Daten" / hatch themselves. */
  fill: string;
}

export interface ChoroplethInput {
  geo: FeatureCollection;
  /** Optional geometry to fit the projection to (Europe uses a fixed bbox). */
  fitGeo?: Feature | FeatureCollection | Geometry;
  width: number;
  height: number;
  values: ChoroplethValues;
  /** Fallback color-scale range, used only until real values arrive. */
  domain: [number, number];
}

/** Paths, centroids and ramp colors for one map at one size. */
export function buildChoropleth(input: ChoroplethInput): {
  scale: [number, number];
  shapes: MapShape[];
} {
  const { geo, fitGeo, width, height, values, domain } = input;
  const scale = scaleDomain(values, domain);
  const proj = geoMercator().fitSize([width, height], fitGeo ?? geo);
  const path = geoPath(proj);
  const color = scaleLinear<string>().domain(scale).range([RAMP_LOW, RAMP_HIGH]).clamp(true);
  const shapes = geo.features.map((f, i): MapShape => {
    const key = String(f.properties?.name ?? '');
    const d: Partial<ChoroplethValue> = values[key] ?? {};
    const anchor = LABEL_ANCHORS[key];
    const centroid = anchor ? (proj(anchor) ?? path.centroid(f)) : path.centroid(f);
    return {
      i,
      d: path(f) ?? '',
      key,
      name: d.label ?? key,
      sub: d.sub,
      v: d.v ?? null,
      date: d.date,
      marked: d.marked ?? false,
      area: path.area(f),
      cx: centroid[0],
      cy: centroid[1],
      fill: d.v == null ? RAMP_LOW : color(d.v),
    };
  });
  return { scale, shapes };
}

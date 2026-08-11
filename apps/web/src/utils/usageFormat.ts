/**
 * Shared formatting for everything that renders consumption and footprint.
 *
 * Two surfaces read the same table (`user_usage_daily`) through two endpoints:
 * the personal "Nutzung" tab (`/api/usage/me`) and the platform transparency
 * page (`/api/transparency/usage`). They must not disagree about what 1.5 kg
 * looks like, how far that is by car, or what the `sharepic` feature is called
 * — a visitor who compares the two pages and finds different wording reads it
 * as different data, not different code.
 *
 * The magnitude thresholds are deliberate: a footprint spans four orders of
 * magnitude between a trial account and a heavy platform month, so the unit has
 * to move with it or the number becomes unreadable at one end.
 */
import { type UsageFeature } from '@gruenerator/contracts';

export const FEATURE_LABELS: Record<UsageFeature, string> = {
  chat: 'Chat',
  docs: 'Dokumente',
  sheets: 'Tabellen',
  presentations: 'Präsentationen',
  boards: 'Boards',
  sharepic: 'Sharepics & Bilder',
  subtitler: 'Untertitel',
  search: 'Suche & Recherche',
  monitor: 'Monitor',
  sites: 'Websites',
  texte: 'Texte',
  notebook: 'Notebooks',
  other: 'Sonstiges',
};

export const UNIT_LABELS: Record<string, string> = {
  tokens: 'Tokens',
  images: 'Bilder',
  transcriptions: 'Transkriptionen',
  searches: 'Recherchen',
};

const numberFormat = new Intl.NumberFormat('de-DE');
export const oneDecimal = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

export function formatCount(value: number): string {
  return numberFormat.format(value);
}

/** Long token counts get an abbreviated form so the tiles stay readable. */
export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${numberFormat.format(Math.round(value / 100_000) / 10)} Mio.`;
  if (value >= 10_000) return `${numberFormat.format(Math.round(value / 1000))} Tsd.`;
  return numberFormat.format(value);
}

/** Footprints span four orders of magnitude between a trial and a heavy month. */
export function formatGrams(grams: number): string {
  if (grams >= 1000) return `${twoDecimals.format(grams / 1000)} kg`;
  if (grams >= 1) return `${oneDecimal.format(grams)} g`;
  return `${numberFormat.format(Math.round(grams * 1000))} mg`;
}

export function formatEnergy(wh: number): string {
  if (wh >= 1000) return `${twoDecimals.format(wh / 1000)} kWh`;
  return `${oneDecimal.format(wh)} Wh`;
}

/**
 * Average CO2 of the German car fleet, g/km (UBA). Only ever used to make an
 * abstract milligram figure imaginable — never as a claim of its own.
 */
export const CAR_G_PER_KM = 150;

export function carComparison(grams: number): string {
  const metres = (grams / CAR_G_PER_KM) * 1000;
  if (metres >= 1000) return `${oneDecimal.format(metres / 1000)} km Autofahrt`;
  return `${numberFormat.format(Math.round(metres))} m Autofahrt`;
}

export function formatDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? day
    : date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

/**
 * How much the reference (GPT-4o, Jegham et al. 2025) itself is an estimate —
 * inferred from API latency and GPU datasheets, not metered. Applied as a
 * symmetric band around the reference figure so the CO2 savings we claim show
 * up as a corridor rather than a single number the estimate can't actually
 * support. A round, openly stated choice, same spirit as the image boundary
 * uplift in energyFootprint.ts.
 */
export const REFERENCE_UNCERTAINTY = 0.3;

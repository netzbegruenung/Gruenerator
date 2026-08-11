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

/**
 * What a model was used FOR, as a section heading.
 *
 * A flat model list reads as one kind of thing, so Voxtral and Linkup end up
 * looking like chat models with an odd unit. Grouping by function is what makes
 * "welches Modell macht eigentlich die Untertitel" answerable from the table.
 */
export const FUNCTION_LABELS: Record<string, string> = {
  tokens: 'Textmodelle',
  images: 'Bildmodelle',
  transcriptions: 'Spracherkennung',
  searches: 'Websuche',
};

/** Order the function sections appear in — text first, it dominates every window. */
export const FUNCTION_ORDER = ['tokens', 'images', 'transcriptions', 'searches'] as const;

/**
 * Human names for the upstreams the tracker records.
 *
 * The raw values are routing keys, not product names: `litellm` is the proxy in
 * front of our self-hosted models, and what a user is actually looking at there
 * is verdigado. Showing the key would name our plumbing instead of the host.
 */
export const PROVIDER_LABELS: Record<string, string> = {
  mistral: 'Mistral AI',
  scaleway: 'Scaleway',
  litellm: 'verdigado',
  regolo: 'Regolo / Seeweb',
  greenpt: 'GreenPT',
  bfl: 'Black Forest Labs',
  linkup: 'Linkup',
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

const numberFormat = new Intl.NumberFormat('de-DE');
/**
 * Kept for PUE and grid intensity — those are published INPUTS, not our own
 * estimates, and "PUE 1" would misstate a datasheet figure of 1,25. The
 * no-decimals rule applies to what we compute, not to what we cite.
 */
export const oneDecimal = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

export function formatCount(value: number): string {
  return numberFormat.format(value);
}

/** Long token counts get an abbreviated form so the tiles stay readable. */
export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${numberFormat.format(Math.round(value / 100_000) / 10)} Mio.`;
  if (value >= 10_000) return `${numberFormat.format(Math.round(value / 1000))} Tsd.`;
  return numberFormat.format(value);
}

/**
 * Footprints span four orders of magnitude between a trial and a heavy month.
 *
 * No decimals anywhere: the underlying estimate rests on per-model coefficients
 * and a bounded share for the lanes nobody meters, so a tenth of a gram is
 * precision we do not have. "154,1 g" claims a resolution the arithmetic cannot
 * back; "154 g" says the same thing without the false claim.
 *
 * The unit switches a decade later than the obvious 1000 for the same reason —
 * rounding 1400 g to "1 kg" would throw away 30% to avoid a decimal point,
 * which is a worse lie than the one we are removing. So grams run to 9999.
 */
export function formatGrams(grams: number): string {
  // Threshold tested against the ROUNDED value, not the raw one: 9999,6 g
  // rounds to 10000, and picking the unit first would print "10.000 g" where
  // the very next value prints "10 kg". Same at the mg/g seam (0,9996 g).
  const rounded = Math.round(grams);
  if (rounded >= 10_000) return `${numberFormat.format(Math.round(grams / 1000))} kg`;
  if (rounded >= 1) return `${numberFormat.format(rounded)} g`;
  return `${numberFormat.format(Math.round(grams * 1000))} mg`;
}

export function formatEnergy(wh: number): string {
  const rounded = Math.round(wh);
  if (rounded >= 10_000) return `${numberFormat.format(Math.round(wh / 1000))} kWh`;
  return `${numberFormat.format(rounded)} Wh`;
}

/**
 * Average CO2 of the German car fleet, g/km (UBA). Only ever used to make an
 * abstract milligram figure imaginable — never as a claim of its own.
 */
export const CAR_G_PER_KM = 150;

export function carComparison(grams: number): string {
  const metres = (grams / CAR_G_PER_KM) * 1000;
  const rounded = Math.round(metres);
  if (rounded >= 10_000) return `${numberFormat.format(Math.round(metres / 1000))} km Autofahrt`;
  return `${numberFormat.format(rounded)} m Autofahrt`;
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

/** The footprint fields the GPT-4o comparison needs, from either endpoint. */
export interface ReferenceComparisonInput {
  emissions_g: number;
  image_emissions_g: number;
  energy_wh: number;
  image_energy_wh: number;
  reference_emissions_g: number;
  reference_energy_wh: number;
}

export interface ReferenceComparisonResult {
  /** False when there is no text usage at all — nothing to compare. */
  hasComparison: boolean;
  /** True when we come out ahead. Callers switch framing, never visibility. */
  saved: boolean;
  /** Magnitude of the difference, always positive; `saved` carries the sign. */
  magnitude: number;
  low: number;
  high: number;
  /** Our own text-only figures. The personal tab must NOT render these. */
  textEmissions: number;
  textEnergy: number;
}

/**
 * The GPT-4o comparison, computed once for both surfaces.
 *
 * This lived twice — in the personal tab and on the transparency page — and
 * drifted twice inside a single pull request: first the page kept a stale
 * `return null` that hid an unfavourable result, then the tab's note outlived
 * the card it described. Two copies of one rule is the bug, so there is one.
 *
 * Text only on both sides: the reference has no image half, so comparing it
 * against a total that includes Flux would invent a saving out of an
 * accounting mismatch.
 */
export function referenceComparison(
  footprint: ReferenceComparisonInput
): ReferenceComparisonResult {
  const textEmissions = footprint.emissions_g - footprint.image_emissions_g;
  const textEnergy = footprint.energy_wh - footprint.image_energy_wh;
  const difference = footprint.reference_emissions_g - textEmissions;
  const saved = difference >= 0;

  return {
    hasComparison: textEmissions > 0 || textEnergy > 0 || footprint.reference_emissions_g > 0,
    saved,
    magnitude: Math.abs(difference),
    low: Math.max(
      saved
        ? footprint.reference_emissions_g * (1 - REFERENCE_UNCERTAINTY) - textEmissions
        : textEmissions - footprint.reference_emissions_g * (1 + REFERENCE_UNCERTAINTY),
      0
    ),
    high: Math.max(
      saved
        ? footprint.reference_emissions_g * (1 + REFERENCE_UNCERTAINTY) - textEmissions
        : textEmissions - footprint.reference_emissions_g * (1 - REFERENCE_UNCERTAINTY),
      0
    ),
    textEmissions,
    textEnergy,
  };
}

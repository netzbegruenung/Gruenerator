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
  // Sekunden, keine Aufrufe: ein Vorlesen sind viele Anfragen, eine Zählung
  // beschriebe unsere Satz-Aufteilung und nicht die Nutzung.
  speech_seconds: 'Sekunden',
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
  speech_seconds: 'Sprachausgabe',
};

/** Order the function sections appear in — text first, it dominates every window. */
export const FUNCTION_ORDER = [
  'tokens',
  'images',
  'transcriptions',
  'searches',
  'speech_seconds',
] as const;

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
  // Cortecs ist ein Router, kein Rechenzentrum. Sein Name steht hier NUR für den
  // Fall, dass der Kopf `x-cortecs-provider` fehlte — sonst trägt die Buchung
  // den echten Unterauftragnehmer (usageModelMiddleware.ts). Wer diese Zeile in
  // der Übersicht sieht, sieht eine unvollständige Zuordnung, keinen Standort.
  cortecs: 'Cortecs (Vermittler)',
  // Die beiden Endpunkte, die unser Gemma 4 31B real bedienen. Ohne diese
  // Zeilen stünde in der Übersicht der rohe Routing-Schlüssel. Kein Standort im
  // Namen: der steckt in den Koeffizienten (energyFootprint.ts), und infercom
  // sitzt in Luxemburg, während es in Deutschland rechnet — eine Flagge im
  // Label müsste sich für eins von beidem entscheiden und würde das andere
  // falsch behaupten.
  infercom: 'infercom',
  berget: 'Berget',
  litellm: 'verdigado',
  regolo: 'Regolo / Seeweb',
  greenpt: 'GreenPT',
  bfl: 'Black Forest Labs',
  linkup: 'Linkup',
  // Bewusst ohne Länderzusatz: KugelAudios Unterauftragnehmer reichen von
  // Finnland bis Polen, und der Anbieter legt nicht offen, welcher eine
  // konkrete Anfrage bedient hat. Ein Standort hier wäre eine Behauptung.
  kugelaudio: 'KugelAudio',
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

/**
 * Seconds as a duration.
 *
 * Speech is counted in seconds, and a bare "1.284" next to a label reads as a
 * count of something — which is exactly the misreading the unit name avoids.
 */
export function formatDuration(seconds: number): string {
  // Round to whole minutes FIRST, then split. Rounding the remainder on its own
  // lets it reach 60 — 7190 s came out as "1 Std. 60 Min." rather than "2 Std.".
  const totalMinutes = Math.round(seconds / 60);

  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${hours} Std. ${minutes} Min.` : `${hours} Std.`;
  }
  // Below a minute stays in seconds, so a short read-aloud is not "0 Min.".
  if (seconds >= 60) return `${numberFormat.format(totalMinutes)} Min.`;
  return `${numberFormat.format(seconds)} Sek.`;
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

/**
 * The corridor as one sentence, because both ends carry a sign and a unit and
 * "0 mg – 72 g" told the reader nothing about which side of zero they were on.
 *
 * Lives here rather than in a component so the personal tab and the
 * transparency page cannot phrase the same range two different ways — the bug
 * this module already exists to prevent.
 */
export function formatCorridor(worst: number, best: number): string {
  const side = (v: number): string =>
    v >= 0 ? `${formatGrams(v)} gespart` : `${formatGrams(-v)} mehr`;
  // Straddling zero: name both directions explicitly, never a bare interval.
  if (worst < 0 && best > 0)
    return `von ${formatGrams(-worst)} mehr bis ${formatGrams(best)} gespart`;
  return `${side(worst)} bis ${side(best)}`;
}

/** The footprint fields the GPT-4o comparison needs, from either endpoint. */
export interface ReferenceComparisonInput {
  emissions_g: number;
  image_emissions_g: number;
  energy_wh: number;
  image_energy_wh: number;
  reference_emissions_g: number;
  reference_energy_wh: number;
  market_emissions_g: number;
  image_market_emissions_g: number;
  market_backed_share: number;
}

export interface ReferenceComparisonResult {
  /** False when there is no text usage at all — nothing to compare. */
  hasComparison: boolean;
  /** True when we come out ahead. Callers switch framing, never visibility. */
  saved: boolean;
  /** Magnitude of the headline difference, always positive; `saved` has the sign. */
  magnitude: number;
  /**
   * SIGNED bounds of the corridor — positive is a saving, negative an excess.
   *
   * They are signed on purpose. The corridor spans two things at once
   * (Jegham's +/-30% on the GPT-4o side, and the two accounting methods on
   * ours), and those can STRADDLE ZERO: location-based we come out worse,
   * market-based better. Clamping both ends to a positive magnitude — which is
   * what this returned before 14.08.2026 — silently rendered the favourable end
   * as "0 g" and hid a real saving. The platform page was the proof: 468 g
   * location vs 371 g reference reads as 97 g too much, while the market-based
   * side is 0 g and therefore 371 g SAVED.
   *
   * `worst` = location-based figure against the strict end of the reference.
   * `best`  = market-based figure against the generous end.
   */
  worst: number;
  best: number;
  /** True when the corridor crosses zero, i.e. the answer genuinely depends on
   *  which accounting method you accept. Callers must then name both. */
  straddlesZero: boolean;
  /** True when the two methods actually diverge, i.e. the market end is worth
   *  naming. False when no lane in the window has an instrument. */
  marketDiffers: boolean;
  /** Our text-only market-based emissions. Personal tab must NOT render it. */
  textMarketEmissions: number;
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
  // Subtract the image half of the MARKET total, not the location one. The two
  // differ whenever images ran on a lane that has an instrument: Regolo serves
  // Qwen-Image from Seeweb's certified supply, so its market-based image
  // emissions are 0 while the location-based ones are not. Using
  // `image_emissions_g` here over-subtracted exactly those, understating the
  // market-based text side and making the favourable end of the corridor look
  // better than it is. Only Black Forest Labs has no instrument.
  const textMarketEmissions = Math.max(
    footprint.market_emissions_g - footprint.image_market_emissions_g,
    0
  );
  const difference = footprint.reference_emissions_g - textEmissions;
  const saved = difference >= 0;

  // The favourable end pairs the generous reading of BOTH inputs: the top of
  // Jegham's corridor with our green-power contracts honoured. The unfavourable
  // end pairs the strict reading of both. Anything mixed would be arbitrary.
  const refLow = footprint.reference_emissions_g * (1 - REFERENCE_UNCERTAINTY);
  const refHigh = footprint.reference_emissions_g * (1 + REFERENCE_UNCERTAINTY);

  return {
    hasComparison: textEmissions > 0 || textEnergy > 0 || footprint.reference_emissions_g > 0,
    saved,
    magnitude: Math.abs(difference),
    // No branch on `saved` and no clamping: one signed subtraction per end, so
    // the pair keeps its meaning when the two methods disagree about the sign.
    worst: refLow - textEmissions,
    best: refHigh - textMarketEmissions,
    straddlesZero: refLow - textEmissions < 0 && refHigh - textMarketEmissions > 0,
    marketDiffers: footprint.market_backed_share > 0 && textMarketEmissions < textEmissions,
    textEmissions,
    textMarketEmissions,
    textEnergy,
  };
}

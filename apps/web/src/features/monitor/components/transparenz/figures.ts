/**
 * Every number the "Nachhaltigkeit" story tells, derived from one response.
 *
 * Kept apart from the components so the arithmetic is testable without a DOM
 * and the chapters only arrange sentences. Nothing here is a constant of the
 * page: a figure that cannot be derived from the response is not on it.
 */
import {
  type GetTransparencyStatsResponseDto,
  type TransparencyFeatureEntryDto,
  type UsageFeature,
} from '@gruenerator/contracts';

import { CAR_G_PER_PERSON_KM, FUNCTION_LABELS } from '../../../../utils/usageFormat';

/** The three slices chapter 03 names. Briefing is a chat thread, so it counts as chat. */
export type StoryGroup = 'chat' | 'images' | 'rest';

const STORY_GROUP: Partial<Record<UsageFeature, StoryGroup>> = {
  chat: 'chat',
  briefing: 'chat',
  sharepic: 'images',
};

/** Units whose operations are counted but carry no footprint (no provider data). */
const UNVALUED_UNITS = [
  'searches',
  'transcriptions',
  'characters',
  'ocr_pages',
  'speech_seconds',
  'embedding_tokens',
] as const;

export interface StoryFigures {
  days: number;
  requests: number;
  energyWh: number;
  emissionsG: number;
  emissionsLowG: number;
  emissionsHighG: number;
  /** Electricity per request, Wh — PUE already included in `energy_wh`. */
  whPerRequest: number;
  /** Average grid intensity the platform ran on, g CO2e per kWh. */
  gramsPerKwh: number;
  carKm: number;
  gramsPerRequest: number;
  /** Minutes a 10 W LED runs on one request's electricity. */
  ledMinutesPerRequest: number;
  gramsPerDay: number;
  /** CO2 per second of wall time, for the "seit du hier bist" counter. */
  gramsPerSecond: number;
  groups: Record<StoryGroup, number>;
  /** How many tokens the models read per token they write. */
  readPerWritten: number | null;
  measuredShare: number;
  /** Function labels ("Websuche", …) that ran in the window but carry no footprint. */
  unvaluedFunctions: string[];
  /** Market-based figure (renewable instruments counted); null when it saves nothing. */
  marketEmissionsG: number | null;
  /** The provider that ran most of the electricity, by raw key. */
  mainProvider: string | null;
}

function groupEmissions(byFeature: TransparencyFeatureEntryDto[]): Record<StoryGroup, number> {
  const groups: Record<StoryGroup, number> = { chat: 0, images: 0, rest: 0 };
  for (const entry of byFeature) {
    groups[STORY_GROUP[entry.feature] ?? 'rest'] += entry.emissions_g;
  }
  return groups;
}

export function deriveFigures(data: GetTransparencyStatsResponseDto): StoryFigures {
  const { footprint, totals, providers, byModel } = data;
  const requests = totals.requests;
  const perRequest = (value: number) => (requests > 0 ? value / requests : 0);
  const whPerRequest = perRequest(footprint.energy_wh);

  const presentUnits = new Set(byModel.filter((m) => m.ops > 0).map((m) => m.unit));
  // Transcriptions and searches are reported in `unvalued_ops` even when the
  // model split folded them away, so they count as present from there too.
  if (footprint.unvalued_ops.transcriptions > 0) presentUnits.add('transcriptions');
  if (footprint.unvalued_ops.searches > 0) presentUnits.add('searches');
  if (footprint.unvalued_ops.speech_seconds > 0) presentUnits.add('speech_seconds');

  const mainProvider =
    [...providers].sort((a, b) => b.energy_wh - a.energy_wh)[0]?.provider ?? null;

  return {
    days: data.days,
    requests,
    energyWh: footprint.energy_wh,
    emissionsG: footprint.emissions_g,
    emissionsLowG: footprint.emissions_g_low,
    emissionsHighG: footprint.emissions_g_high,
    whPerRequest,
    gramsPerKwh: footprint.energy_wh > 0 ? footprint.emissions_g / (footprint.energy_wh / 1000) : 0,
    carKm: footprint.emissions_g / CAR_G_PER_PERSON_KM,
    gramsPerRequest: perRequest(footprint.emissions_g),
    ledMinutesPerRequest: (whPerRequest / 10) * 60,
    gramsPerDay: data.days > 0 ? footprint.emissions_g / data.days : 0,
    gramsPerSecond: data.days > 0 ? footprint.emissions_g / (data.days * 86_400) : 0,
    groups: groupEmissions(data.byFeature),
    readPerWritten: totals.output_tokens > 0 ? totals.input_tokens / totals.output_tokens : null,
    measuredShare: footprint.measured_share,
    unvaluedFunctions: UNVALUED_UNITS.filter((unit) => presentUnits.has(unit)).map(
      (unit) => FUNCTION_LABELS[unit]
    ),
    marketEmissionsG:
      footprint.market_emissions_g < footprint.emissions_g ? footprint.market_emissions_g : null,
    mainProvider,
  };
}

/**
 * A share as words, the way a person would say it ("gut zwei Drittel").
 * Coarse on purpose: the sentence names the grams right next to it.
 */
export function shareInWords(share: number): string {
  if (share >= 0.95) return 'Fast alles';
  if (share >= 0.8) return 'Gut drei Viertel';
  if (share >= 0.72) return 'Rund drei Viertel';
  if (share >= 0.66) return 'Gut zwei Drittel';
  if (share >= 0.6) return 'Knapp zwei Drittel';
  if (share >= 0.52) return 'Gut die Hälfte';
  if (share >= 0.45) return 'Rund die Hälfte';
  if (share >= 0.3) return 'Rund ein Drittel';
  return 'Ein kleinerer Teil';
}

const de = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

/** "5", "22-mal" etc. — whole numbers only, the estimate has no decimals to give. */
export function wholeNumber(value: number): string {
  return de.format(Math.round(value));
}

/** "rund 34 Minuten" / "rund 2 Stunden" for the LED comparison. */
export function formatMinutes(minutes: number): string {
  if (minutes >= 90) return `${wholeNumber(minutes / 60)} Stunden`;
  if (minutes >= 1.5) return `${wholeNumber(minutes)} Minuten`;
  return `${wholeNumber(minutes * 60)} Sekunden`;
}

/** German list: "A, B und C". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`;
}

/**
 * Platform-wide consumption aggregate for the public transparency page.
 *
 * Same table as the personal usage tab, summed across every user. Three things
 * make this more than "the same query without the user filter":
 *
 *  1. `user_id` is collapsed in SQL, not in JavaScript. No per-user row is ever
 *     loaded, so there is nothing to leak by accident.
 *
 *  2. Days representing fewer than MIN_GROUP_SIZE distinct users are dropped
 *     from EVERYTHING — not merely hidden from the daily series. Suppressing
 *     only the series would leave the day inside `totals`, and two windows
 *     differing by one day could be subtracted to recover it. Dropping the day
 *     from the aggregate closes that, at the cost of a headline figure that
 *     under-reports early and quiet days. Under-reporting a public footprint is
 *     the wrong direction, so `suppressed_days` ships alongside it.
 *
 *  3. The footprint is a SCALE. `energyFootprint.ts` values un-metered lanes at
 *     the centre of their plausible span; here both ends are computed too and
 *     all three are published. A single number invites being quoted as fact.
 *
 * The result is cached in redis: this is an unauthenticated endpoint, and three
 * aggregate scans per page view is a denial-of-service surface handed to anyone
 * with curl.
 *
 * An optional `locale` narrows everything above to the users whose profile
 * currently says Germany or Austria. It is a join at read time, not a column:
 * a person who switches country takes their history with them, which is fine
 * for a figure that describes the platform rather than a moment. A profile
 * without a locale is in neither segment. The filter sits in step 1 already, so
 * the suppression threshold is applied to the segment, not to the platform —
 * a thin country publishes nothing rather than a number about a few people.
 *
 * An optional `feature` narrows to one product area. Unlike the country it IS a
 * column on every row, so the split covers the whole history. The area split
 * needs more than one threshold, because the areas are published side by side
 * with the platform total and anyone can subtract:
 *
 *  - A CELL (day × area) is published only with at least MIN_GROUP_SIZE
 *    people. Monitor on a busy chat day can still be a handful of people.
 *  - Secondary suppression per day: the cells hidden on a day, taken together,
 *    must also reach MIN_GROUP_SIZE — otherwise "day total minus the published
 *    areas" recovers them. If they do not, that day carries no area figure at
 *    all (it stays in the platform total, where it is harmless).
 *  - Over the window, everything not published as a cell is one remainder
 *    (total minus the areas). It too must reach MIN_GROUP_SIZE, or the window
 *    publishes no area split at all.
 *
 * The rule is computed from the full census, never from the request, so the
 * filtered view of an area and the unfiltered per-area row always describe the
 * same cells — the two cannot be subtracted from each other either.
 */

import { getTransparencyStatsResponseSchema, usageFeatureSchema } from '@gruenerator/contracts';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';

import { profiles, userUsageDaily } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { createLogger } from '../../utils/logger.js';
import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';

import {
  estimateFootprint,
  estimateImageFootprint,
  gridIntensityFor,
  getPublicTextCalculationProfiles,
  isPueEstimated,
  pueFor,
  emissionsFromEnergy,
  hasMarketInstrument,
  marketIntensityFor,
  referenceFootprint,
  TOKEN_CALIBRATION_PUE,
  unmeasuredRemainder,
} from './energyFootprint.js';

import type {
  GetTransparencyStatsResponseDto,
  TransparencyLocale,
  UsageFeature,
} from '@gruenerator/contracts';

const log = createLogger('platformUsage');

/**
 * How many distinct users a day must represent to be published.
 *
 * Five, matching the convention official statistics use for cell suppression.
 * The published figures are already aggregates over features and models, so the
 * risk this guards against is not identification from a single row but the
 * inverse: a day on which one identifiable person was the platform.
 */
export const MIN_GROUP_SIZE = 5;

/**
 * Long enough that a burst of page views costs one set of scans, short enough
 * that the page is not visibly stale. The snapshot carries `generated_at` so a
 * reader can see the age rather than having to trust it.
 */
const CACHE_TTL_SECONDS = 15 * 60;

/** Bumped when the response shape changes, so old entries expire immediately
 *  rather than being served until their TTL runs out. */
const CACHE_KEY_PREFIX = 'transparency:usage:v3';

/** What `profiles.locale` holds for each publishable segment. */
const LOCALE_VALUE: Record<TransparencyLocale, string> = { de: 'de-DE', at: 'de-AT' };

const WMS_PER_WH = 3_600_000;
const UG_PER_G = 1_000_000;

function publicCalculation() {
  return {
    version: '2026-09-14',
    direct_measurement: {
      energy: 'provider-reported kWh × 1,000 = Wh' as const,
      emissions: 'provider-reported g CO2e' as const,
    },
    estimated_text: {
      formula:
        '(input_tokens × input_mwh_per_token + output_tokens × output_mwh_per_token + requests × fixed_mwh_per_request) × provider_pue / calibration_pue' as const,
      calibration_pue: TOKEN_CALIBRATION_PUE,
      profiles: getPublicTextCalculationProfiles(),
    },
    emissions_formula: 'energy_kwh × grid_g_per_kwh = g CO2e' as const,
  };
}

/** Rows predate schema changes; an unknown slug must not break the response. */
const KNOWN_FEATURES = new Set<string>(usageFeatureSchema.options);

function featureFallback(feature: string): UsageFeature {
  // Boundary cast: the Set membership check IS the runtime assertion.
  return (KNOWN_FEATURES.has(feature) ? feature : 'other') as UsageFeature;
}

// A unit missing from this set does not raise anything — it is silently read as
// 'tokens', which files the row under text models with a token count of zero.
const KNOWN_UNITS = new Set<string>([
  'tokens',
  'images',
  'transcriptions',
  'searches',
  'speech_seconds',
]);
type KnownUnit = 'tokens' | 'images' | 'transcriptions' | 'searches' | 'speech_seconds';

function unitFallback(unit: string): KnownUnit {
  return (KNOWN_UNITS.has(unit) ? unit : 'tokens') as KnownUnit;
}

/**
 * Per-provider accumulator. `pueWeighted` sums PUE * energy so the published
 * constant can be the energy-weighted average actually applied, rather than
 * whichever of the two tables happened to be read last — a provider serving
 * both text and images is costed with two different PUEs.
 */
interface ProviderAccumulator {
  energyWms: number;
  emissionsUg: number;
  pueWeighted: number;
  /** True as soon as ANY contributing kind used an estimated PUE. */
  pueEstimated: boolean;
}

function startOfWindow(days: number): string {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  return since.toISOString().slice(0, 10);
}

/** An empty but well-formed answer, for a window with too little activity. */
function emptyStats(days: number, sinceDay: string, suppressedDays: number, activeUsers: number) {
  return {
    success: true as const,
    days,
    since: sinceDay,
    generated_at: new Date().toISOString(),
    min_group_size: MIN_GROUP_SIZE,
    sufficient_data: false,
    active_users: activeUsers,
    suppressed_days: suppressedDays,
    totals: {
      requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      images: 0,
      transcriptions: 0,
      searches: 0,
      speech_seconds: 0,
    },
    footprint: {
      energy_wh: 0,
      energy_wh_low: 0,
      energy_wh_high: 0,
      emissions_g: 0,
      emissions_g_low: 0,
      emissions_g_high: 0,
      measured_share: 0,
      calibrated_share: 0,
      bounded_share: 0,
      covered_share: 0,
      image_energy_wh: 0,
      image_emissions_g: 0,
      reference_energy_wh: 0,
      reference_emissions_g: 0,
      market_emissions_g: 0,
      image_market_emissions_g: 0,
      market_backed_share: 0,
      unvalued_ops: { transcriptions: 0, searches: 0, speech_seconds: 0 },
    },
    calculation: publicCalculation(),
    providers: [],
    daily: [],
    byFeature: [],
    byModel: [],
  } satisfies GetTransparencyStatsResponseDto;
}

function cellKey(day: string, feature: string): string {
  return `${day}|${feature}`;
}

type Db = ReturnType<typeof getDrizzleInstance>;

/** `(day, feature) IN (VALUES …)` for a set of cells, user ids stay in SQL. */
function inCells(cells: readonly (readonly [string, string])[]) {
  return sql`(${userUsageDaily.day}, ${userUsageDaily.feature}) IN (VALUES ${sql.join(
    cells.map(([day, feature]) => sql`(${day}::date, ${feature})`),
    sql`, `
  )})`;
}

async function distinctUsersIn(
  db: Db,
  cells: readonly (readonly [string, string])[],
  localeScope: ReturnType<typeof sql> | undefined
): Promise<number> {
  if (cells.length === 0) return 0;
  const [row] = await db
    .select({ users: sql<number>`count(distinct ${userUsageDaily.userId})::int` })
    .from(userUsageDaily)
    .where(and(inCells(cells), localeScope));
  return row?.users ?? 0;
}

/**
 * Which day × area cells may be published, and whether the window may be split
 * by area at all — see the header comment for the three rules.
 */
async function publishableAreaCells(
  db: Db,
  dayList: string[],
  localeScope: ReturnType<typeof sql> | undefined
): Promise<{
  cells: Set<string>;
  activeDays: Map<string, Set<string>>;
  splitAllowed: boolean;
}> {
  const census = await db
    .select({
      day: userUsageDaily.day,
      feature: userUsageDaily.feature,
      users: sql<number>`count(distinct ${userUsageDaily.userId})::int`,
    })
    .from(userUsageDaily)
    .where(and(inArray(userUsageDaily.day, dayList), localeScope))
    .groupBy(userUsageDaily.day, userUsageDaily.feature);

  const activeDays = new Map<string, Set<string>>();
  const byDay = new Map<string, { feature: string; users: number }[]>();
  for (const row of census) {
    const set = activeDays.get(row.feature) ?? new Set<string>();
    set.add(row.day);
    activeDays.set(row.feature, set);
    byDay.set(row.day, [...(byDay.get(row.day) ?? []), row]);
  }

  // Per day: the thin cells together. Only days that have any need a query.
  const thin = census.filter((c) => c.users < MIN_GROUP_SIZE);
  const thinDays = [...new Set(thin.map((c) => c.day))];
  const thinUsersByDay = new Map<string, number>();
  if (thinDays.length > 0) {
    const rows = await db
      .select({
        day: userUsageDaily.day,
        users: sql<number>`count(distinct ${userUsageDaily.userId})::int`,
      })
      .from(userUsageDaily)
      .where(and(inCells(thin.map((c) => [c.day, c.feature] as const)), localeScope))
      .groupBy(userUsageDaily.day);
    for (const row of rows) thinUsersByDay.set(row.day, row.users);
  }

  const cells = new Set<string>();
  const hidden: (readonly [string, string])[] = [];
  for (const [day, entries] of byDay) {
    const thinUsers = thinUsersByDay.get(day) ?? 0;
    const dayAllowed = thinUsers === 0 || thinUsers >= MIN_GROUP_SIZE;
    for (const entry of entries) {
      if (dayAllowed && entry.users >= MIN_GROUP_SIZE) cells.add(cellKey(day, entry.feature));
      else hidden.push([day, entry.feature]);
    }
  }

  const remainderUsers = await distinctUsersIn(db, hidden, localeScope);
  return {
    cells,
    activeDays,
    splitAllowed: remainderUsers === 0 || remainderUsers >= MIN_GROUP_SIZE,
  };
}

/**
 * Compute the aggregate. Prefer `getPlatformUsageStats`, which caches this.
 */
export async function computePlatformUsageStats(
  days: number,
  locale: TransparencyLocale | null,
  feature: UsageFeature | null = null
): Promise<GetTransparencyStatsResponseDto> {
  const sinceDay = startOfWindow(days);
  const db = getDrizzleInstance();

  // A subquery rather than a join: `user_id` must stay collapsed in every
  // statement below, and a join would put a per-user row within reach.
  const localeScope = locale
    ? sql`${userUsageDaily.userId} IN (SELECT ${profiles.id} FROM ${profiles} WHERE ${profiles.locale} = ${LOCALE_VALUE[locale]})`
    : undefined;
  const scope = and(localeScope, feature ? eq(userUsageDaily.feature, feature) : undefined);

  // Step 1 — who was active on which day. This decides what may be published at
  // all, so it runs before anything is summed. Always the whole segment, also
  // for an area request: the area rule below is defined on top of it.
  const dayUsers = await db
    .select({
      day: userUsageDaily.day,
      activeUsers: sql<number>`count(distinct ${userUsageDaily.userId})::int`,
    })
    .from(userUsageDaily)
    .where(and(gte(userUsageDaily.day, sinceDay), localeScope))
    .groupBy(userUsageDaily.day);

  const eligibleDays = new Map<string, number>();
  let suppressedDays = 0;
  for (const row of dayUsers) {
    if (row.activeUsers >= MIN_GROUP_SIZE) eligibleDays.set(row.day, row.activeUsers);
    else suppressedDays++;
  }

  if (eligibleDays.size === 0) return emptyStats(days, sinceDay, suppressedDays, 0);

  const area = await publishableAreaCells(db, [...eligibleDays.keys()], localeScope);

  // An area request publishes exactly its publishable cells. Its suppressed
  // days are the ones it was active on but may not show — a day the area was
  // idle is not missing from its series.
  let dayList = [...eligibleDays.keys()];
  if (feature) {
    if (!area.splitAllowed) return emptyStats(days, sinceDay, suppressedDays, 0);
    const active = area.activeDays.get(feature) ?? new Set<string>();
    dayList = dayList.filter((day) => area.cells.has(cellKey(day, feature)));
    suppressedDays = active.size - dayList.length;
    if (dayList.length === 0) return emptyStats(days, sinceDay, suppressedDays, 0);
  }

  // Step 2 — distinct users over the eligible days. Not derivable from step 1:
  // the same person active on ten days counts once here and ten times there.
  const [windowUsers] = await db
    .select({ activeUsers: sql<number>`count(distinct ${userUsageDaily.userId})::int` })
    .from(userUsageDaily)
    .where(and(inArray(userUsageDaily.day, dayList), scope));

  const activeUsers = windowUsers?.activeUsers ?? 0;
  if (activeUsers < MIN_GROUP_SIZE) {
    return emptyStats(days, sinceDay, suppressedDays + eligibleDays.size, activeUsers);
  }

  // Step 3 — the aggregate itself, with `user_id` collapsed in the database.
  //
  // Summing before estimating is safe: the footprint is linear in tokens plus a
  // per-request constant, so estimating from summed counts equals summing the
  // per-user estimates exactly. Casting to float8 rather than bigint because
  // node-postgres hands bigint back as a string, and these totals sit far below
  // the 2^53 where float8 would start losing integers.
  const rows = await db
    .select({
      day: userUsageDaily.day,
      feature: userUsageDaily.feature,
      provider: userUsageDaily.provider,
      model: userUsageDaily.model,
      unit: userUsageDaily.unit,
      requests: sql<number>`sum(${userUsageDaily.requests})::float8`,
      inputTokens: sql<number>`sum(${userUsageDaily.inputTokens})::float8`,
      outputTokens: sql<number>`sum(${userUsageDaily.outputTokens})::float8`,
      ops: sql<number>`sum(${userUsageDaily.ops})::float8`,
      energyWms: sql<number>`sum(${userUsageDaily.energyWms})::float8`,
      emissionsUg: sql<number>`sum(${userUsageDaily.emissionsUg})::float8`,
      measuredRequests: sql<number>`sum(${userUsageDaily.measuredRequests})::float8`,
      measuredInputTokens: sql<number>`sum(${userUsageDaily.measuredInputTokens})::float8`,
      measuredOutputTokens: sql<number>`sum(${userUsageDaily.measuredOutputTokens})::float8`,
    })
    .from(userUsageDaily)
    .where(and(inArray(userUsageDaily.day, dayList), scope))
    .groupBy(
      userUsageDaily.day,
      userUsageDaily.feature,
      userUsageDaily.provider,
      userUsageDaily.model,
      userUsageDaily.unit
    );

  const totals = {
    requests: 0,
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    images: 0,
    transcriptions: 0,
    searches: 0,
    speech_seconds: 0,
  };
  const daily = new Map<string, { requests: number; input: number; output: number }>();
  const byFeature = new Map<
    UsageFeature,
    {
      requests: number;
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
      images: number;
      transcriptions: number;
      searches: number;
      speech_seconds: number;
      emissionsUg: number;
    }
  >();
  const byModel = new Map<
    string,
    {
      provider: string;
      model: string;
      unit: KnownUnit;
      requests: number;
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
      ops: number;
    }
  >();
  const byProvider = new Map<string, ProviderAccumulator>();

  // The central estimate, and the shares that describe how much of it rests on
  // a meter. Mirrors userUsageContractRouter — see the comment there on why
  // coverage is weighted by OUTPUT tokens rather than by all tokens.
  let energyWms = 0;
  let emissionsUg = 0;
  // Every watt-hour in `energyWms` lands in exactly one of these three, and the
  // API publishes all three. Keeping the middle one as its own counter rather
  // than as `energy - measured - bounded` is the point: a lane that one day
  // enters the total through a fourth route would vanish into that subtraction,
  // which is exactly how the largest class here went unnamed until 09/2026.
  let measuredEnergyWms = 0;
  let calibratedEnergyWms = 0;
  let boundedEnergyWms = 0;
  // The two ends of the published scale. The figures above are the MIDDLE and
  // are what every headline shows; these differ from it only where a lane is
  // valued by bracket rather than by meter, or where the provider's location is
  // a span rather than a known country.
  let energyWmsLow = 0;
  let emissionsUgLow = 0;
  let energyWmsHigh = 0;
  let emissionsUgHigh = 0;
  let imageEnergyWms = 0;
  let imageEmissionsUg = 0;
  let textOutputTokens = 0;
  let coveredOutputTokens = 0;
  let coveredRequests = 0;
  // MARKET-based counterpart of `emissionsUg`, accumulated over the same rows.
  // Independent of the low/high band above: that band is uncertainty, this is a
  // second accounting method. See MARKET_INTENSITY_G_PER_KWH.
  let marketEmissionsUg = 0;
  let imageMarketEmissionsUg = 0;
  let marketBackedEnergyWms = 0;

  const addProvider = (
    provider: string,
    energy: number,
    emissions: number,
    kind: 'tokens' | 'images'
  ): void => {
    const entry = byProvider.get(provider) ?? {
      energyWms: 0,
      emissionsUg: 0,
      pueWeighted: 0,
      pueEstimated: false,
    };
    entry.energyWms += energy;
    entry.emissionsUg += emissions;
    entry.pueWeighted += pueFor(provider, kind) * energy;
    // OR across kinds: a provider whose token PUE is published but whose image
    // PUE is not still carries an estimate in its weighted average, and the
    // label has to reflect the weaker half.
    entry.pueEstimated ||= isPueEstimated(provider, kind);
    byProvider.set(provider, entry);
  };

  for (const row of rows) {
    const unit = unitFallback(row.unit);
    // A cell that may not be published as its own area is folded into
    // „Sonstiges", so the per-area rows match what an area request returns.
    const rowFeature = area.cells.has(cellKey(row.day, row.feature))
      ? featureFallback(row.feature)
      : 'other';
    const tokens = row.inputTokens + row.outputTokens;
    // This row's contribution to the platform emissions (central estimate), so the
    // per-feature breakdown can carry a CO2 figure of its own.
    let rowEmissionsUg = 0;

    if (unit === 'tokens') {
      textOutputTokens += row.outputTokens;
      const rest = unmeasuredRemainder(row);
      if (row.energyWms > 0) {
        // Measured beats estimated, and a measurement has no band: both ends of
        // the range get the same value. It covers only the measured calls; the
        // remainder is estimated below.
        energyWms += row.energyWms;
        measuredEnergyWms += row.energyWms;
        emissionsUg += row.emissionsUg;
        energyWmsLow += row.energyWms;
        emissionsUgLow += row.emissionsUg;
        energyWmsHigh += row.energyWms;
        emissionsUgHigh += row.emissionsUg;
        rowEmissionsUg += row.emissionsUg;
        marketEmissionsUg += emissionsFromEnergy(row.energyWms, marketIntensityFor(row.provider));
        if (hasMarketInstrument(row.provider)) marketBackedEnergyWms += row.energyWms;
        coveredOutputTokens += row.outputTokens - rest.outputTokens;
        coveredRequests += row.requests - rest.requests;
        addProvider(row.provider, row.energyWms, row.emissionsUg, 'tokens');
      }
      if (rest.requests + rest.inputTokens + rest.outputTokens > 0) {
        const base = { provider: row.provider, model: row.model, ...rest };
        const mid = estimateFootprint(base);
        if (mid) {
          const low = estimateFootprint({ ...base, bound: 'low' });
          const high = estimateFootprint({ ...base, bound: 'high' });
          energyWms += mid.energyWms;
          emissionsUg += mid.emissionsUg;
          energyWmsLow += low?.energyWms ?? mid.energyWms;
          emissionsUgLow += low?.emissionsUg ?? mid.emissionsUg;
          energyWmsHigh += high?.energyWms ?? mid.energyWms;
          emissionsUgHigh += high?.emissionsUg ?? mid.emissionsUg;
          rowEmissionsUg += mid.emissionsUg;
          marketEmissionsUg += mid.marketEmissionsUg;
          if (hasMarketInstrument(row.provider)) marketBackedEnergyWms += mid.energyWms;
          coveredOutputTokens += rest.outputTokens;
          coveredRequests += rest.requests;
          if (mid.basis === 'bound') boundedEnergyWms += mid.energyWms;
          else calibratedEnergyWms += mid.energyWms;
          addProvider(row.provider, mid.energyWms, mid.emissionsUg, 'tokens');
        }
      }
    }

    if (unit === 'images') {
      const base = { provider: row.provider, model: row.model, images: row.ops };
      const mid = estimateImageFootprint(base);
      if (mid) {
        const low = estimateImageFootprint({ ...base, bound: 'low' });
        const high = estimateImageFootprint({ ...base, bound: 'high' });
        energyWms += mid.energyWms;
        emissionsUg += mid.emissionsUg;
        energyWmsLow += low?.energyWms ?? mid.energyWms;
        emissionsUgLow += low?.emissionsUg ?? mid.emissionsUg;
        energyWmsHigh += high?.energyWms ?? mid.energyWms;
        emissionsUgHigh += high?.emissionsUg ?? mid.emissionsUg;
        imageEnergyWms += mid.energyWms;
        imageEmissionsUg += mid.emissionsUg;
        rowEmissionsUg = mid.emissionsUg;
        marketEmissionsUg += mid.marketEmissionsUg;
        imageMarketEmissionsUg += mid.marketEmissionsUg;
        if (hasMarketInstrument(row.provider)) marketBackedEnergyWms += mid.energyWms;
        if (mid.basis === 'bound') boundedEnergyWms += mid.energyWms;
        else calibratedEnergyWms += mid.energyWms;
        addProvider(row.provider, mid.energyWms, mid.emissionsUg, 'images');
      }
    }

    totals.requests += row.requests;
    totals.input_tokens += row.inputTokens;
    totals.output_tokens += row.outputTokens;
    totals.total_tokens += tokens;
    if (unit === 'images') totals.images += row.ops;
    if (unit === 'transcriptions') totals.transcriptions += row.ops;
    if (unit === 'searches') totals.searches += row.ops;
    if (unit === 'speech_seconds') totals.speech_seconds += row.ops;

    const dayEntry = daily.get(row.day) ?? { requests: 0, input: 0, output: 0 };
    dayEntry.requests += row.requests;
    dayEntry.input += row.inputTokens;
    dayEntry.output += row.outputTokens;
    daily.set(row.day, dayEntry);

    const featureEntry = byFeature.get(rowFeature) ?? {
      requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      images: 0,
      transcriptions: 0,
      searches: 0,
      speech_seconds: 0,
      emissionsUg: 0,
    };
    featureEntry.requests += row.requests;
    featureEntry.input_tokens += row.inputTokens;
    featureEntry.output_tokens += row.outputTokens;
    featureEntry.total_tokens += tokens;
    featureEntry.emissionsUg += rowEmissionsUg;
    if (unit === 'images') featureEntry.images += row.ops;
    if (unit === 'transcriptions') featureEntry.transcriptions += row.ops;
    if (unit === 'searches') featureEntry.searches += row.ops;
    if (unit === 'speech_seconds') featureEntry.speech_seconds += row.ops;
    byFeature.set(rowFeature, featureEntry);

    const modelKey = `${row.provider}|${row.model}|${unit}`;
    const modelEntry = byModel.get(modelKey) ?? {
      provider: row.provider,
      model: row.model,
      unit,
      requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      ops: 0,
    };
    modelEntry.requests += row.requests;
    modelEntry.input_tokens += row.inputTokens;
    modelEntry.output_tokens += row.outputTokens;
    modelEntry.total_tokens += tokens;
    modelEntry.ops += row.ops;
    byModel.set(modelKey, modelEntry);
  }

  const reference = referenceFootprint({
    outputTokens: coveredOutputTokens,
    requests: coveredRequests,
  });

  return {
    success: true as const,
    days,
    since: sinceDay,
    generated_at: new Date().toISOString(),
    min_group_size: MIN_GROUP_SIZE,
    sufficient_data: true,
    active_users: activeUsers,
    suppressed_days: suppressedDays,
    totals,
    footprint: {
      energy_wh: energyWms / WMS_PER_WH,
      energy_wh_low: energyWmsLow / WMS_PER_WH,
      energy_wh_high: energyWmsHigh / WMS_PER_WH,
      emissions_g: emissionsUg / UG_PER_G,
      emissions_g_low: emissionsUgLow / UG_PER_G,
      emissions_g_high: emissionsUgHigh / UG_PER_G,
      measured_share: energyWms > 0 ? measuredEnergyWms / energyWms : 0,
      calibrated_share: energyWms > 0 ? calibratedEnergyWms / energyWms : 0,
      bounded_share: energyWms > 0 ? boundedEnergyWms / energyWms : 0,
      covered_share: textOutputTokens > 0 ? coveredOutputTokens / textOutputTokens : 0,
      image_energy_wh: imageEnergyWms / WMS_PER_WH,
      image_emissions_g: imageEmissionsUg / UG_PER_G,
      reference_energy_wh: reference.energyWms / WMS_PER_WH,
      reference_emissions_g: reference.emissionsUg / UG_PER_G,
      market_emissions_g: marketEmissionsUg / UG_PER_G,
      image_market_emissions_g: imageMarketEmissionsUg / UG_PER_G,
      market_backed_share: energyWms > 0 ? marketBackedEnergyWms / energyWms : 0,
      unvalued_ops: {
        transcriptions: totals.transcriptions,
        searches: totals.searches,
        speech_seconds: totals.speech_seconds,
      },
    },
    calculation: publicCalculation(),
    // Only providers that actually contributed energy. Listing a search or
    // transcription provider here at 0 g would read as "this one is free"; what
    // is really true about them lives in `unvalued_ops`.
    providers: [...byProvider.entries()]
      .map(([provider, entry]) => ({
        provider,
        grid_g_per_kwh: gridIntensityFor(provider),
        pue: entry.energyWms > 0 ? entry.pueWeighted / entry.energyWms : pueFor(provider),
        pue_estimated: entry.pueEstimated,
        energy_wh: entry.energyWms / WMS_PER_WH,
        emissions_g: entry.emissionsUg / UG_PER_G,
      }))
      .sort((a, b) => b.energy_wh - a.energy_wh),
    daily: [...daily.entries()]
      .map(([day, entry]) => ({
        day,
        active_users: eligibleDays.get(day) ?? 0,
        requests: entry.requests,
        input_tokens: entry.input,
        output_tokens: entry.output,
      }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    byFeature: (area.splitAllowed ? [...byFeature.entries()] : [])
      .map(([area, { emissionsUg: featureEmissionsUg, ...entry }]) => ({
        feature: area,
        ...entry,
        emissions_g: featureEmissionsUg / UG_PER_G,
      }))
      .sort((a, b) => b.total_tokens - a.total_tokens || b.requests - a.requests),
    byModel: [...byModel.values()].sort((a, b) => b.total_tokens - a.total_tokens || b.ops - a.ops),
  };
}

/**
 * Cache-aside wrapper. A redis outage degrades to computing on every request
 * rather than to an error — `jsonCache` treats every failure as a miss.
 */
export async function getPlatformUsageStats(
  days: number,
  locale: TransparencyLocale | null,
  feature: UsageFeature | null = null
): Promise<GetTransparencyStatsResponseDto> {
  const segment = `${days}:${locale ?? 'all'}:${feature ?? 'all'}`;
  const key = `${CACHE_KEY_PREFIX}:${segment}`;

  const cached = await getCachedJson(key, getTransparencyStatsResponseSchema);
  if (cached) return cached;

  const stats = await computePlatformUsageStats(days, locale, feature);
  await setCachedJson(key, stats, CACHE_TTL_SECONDS);
  log.debug(`Recomputed platform usage for ${segment} (${stats.daily.length} published days)`);
  return stats;
}

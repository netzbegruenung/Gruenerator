/**
 * Zod schemas for the PUBLIC transparency endpoint.
 * Mirrors apps/api/routes/transparency/transparencyContractRouter.ts.
 *
 * Same underlying table as `userUsage.ts` (`user_usage_daily`), summed over
 * every user instead of filtered to one. The shared pieces are imported rather
 * than restated so the two views cannot drift apart.
 *
 * The differences from the personal view are all consequences of the audience:
 *
 *  - Nobody is authenticated, so nothing may be traceable to a person. The
 *    aggregate drops `user_id` in SQL, and small cells are suppressed on top of
 *    that (`min_group_size`).
 *  - A public figure gets read as a claim, so it is published as a RANGE with
 *    its own coverage disclosed, not as a single number.
 *  - The constants behind the arithmetic ship with the result. A footprint
 *    nobody can recompute is an assertion, not transparency.
 */
import { z } from 'zod';

import {
  usageByFeatureEntrySchema,
  usageByModelEntrySchema,
  usageTotalsSchema,
} from './userUsage.js';

/**
 * Energy and emissions for the whole platform in the window, as a band.
 *
 * `*_low`, the unsuffixed field and `*_high` are three points of one
 * computation, differing only in where an un-metered lane is valued inside its
 * span and where a provider of unknown location sits between the possible grids
 * (apps/api/services/usage/energyFootprint.ts, `EnergyBound`). Where every lane
 * is metered and every country known, all three coincide — the width of the
 * scale IS the remaining uncertainty, and it narrows as coverage grows.
 *
 * The unsuffixed field is the MIDDLE. It used to be the upper end, on the
 * reasoning that a lone rendered number should be the one that cannot flatter
 * us; what that produced instead was a number reliably wrong in one direction,
 * with the width of the real uncertainty hidden behind it. The ends are now
 * published beside the middle rather than standing in for it.
 */
export const transparencyFootprintSchema = z.object({
  /** Watt-hours, CENTRAL estimate — the figure every headline shows. */
  energy_wh: z.number(),
  /** The two ends of the published scale. Both equal `energy_wh` wherever the
   *  lane is metered and the provider's country is known, so the width of the
   *  scale is exactly the uncertainty we actually have. */
  energy_wh_low: z.number(),
  energy_wh_high: z.number(),
  /** Grams CO2e, location-based accounting, central estimate. */
  emissions_g: z.number(),
  emissions_g_low: z.number(),
  emissions_g_high: z.number(),
  /** 0..1 — share of the counted energy that was metered by the provider. */
  measured_share: z.number(),
  /** 0..1 — share of the energy whose MODEL was never metered anywhere, so it
   *  is valued from the bracket between two models that were. Costed at the
   *  centre of that bracket since the mid-estimate change; it used to be its
   *  ceiling, which is what the name still remembers. */
  bounded_share: z.number(),
  /** 0..1 — share of GENERATED tokens a footprint covers. Output-weighted. */
  covered_share: z.number(),
  /** The image half of the two totals above. One image outweighs hundreds of
   *  chat turns, so a combined figure would read as a chat footprint. */
  image_energy_wh: z.number(),
  image_emissions_g: z.number(),
  /** The same work costed against GPT-4o (Jegham et al., arXiv:2505.09598).
   *  Text only, and it can come out worse OR better than ours per lane. */
  reference_energy_wh: z.number(),
  reference_emissions_g: z.number(),
  /** MARKET-based counterpart of `emissions_g` — see the field of the same
   *  name in userUsage.ts for the method, the evidence per lane and the
   *  asymmetry that keeps it from being a like-for-like comparison. */
  market_emissions_g: z.number(),
  /** Image half of `market_emissions_g` — see the field of the same name in
   *  userUsage.ts. Regolo images have an instrument, BFL images do not. */
  image_market_emissions_g: z.number(),
  /** 0..1 — share of the counted energy backed by a named instrument. */
  market_backed_share: z.number(),
  /**
   * Operations that are counted but carry NO footprint, because no defensible
   * coefficient exists for them yet.
   *
   * Present as its own field rather than left to be inferred from `totals`: a
   * dashboard that renders a CO2 figure beside an activity count implies the
   * activity is included. For these it is not, and the number that says so has
   * to be as easy to reach as the number it qualifies.
   */
  unvalued_ops: z.object({
    /** No provider reports impact for speech-to-text, and the table records no
     *  audio duration — the quantity the energy would scale with. */
    transcriptions: z.number(),
    /** The energy sits in the search provider's crawl and index, not with us. */
    searches: z.number(),
    /**
     * Seconds of synthesised speech. KugelAudio reports no consumption, and no
     * published text-to-speech measurement shares the system boundary every
     * figure in energyFootprint.ts is calibrated against — so there is no
     * coefficient to value these with.
     *
     * Unlike `transcriptions` the DURATION is recorded here, which is the
     * quantity the energy would scale with. Once a defensible coefficient
     * exists, the whole period can be revalued without a backfill.
     */
    speech_seconds: z.number(),
  }),
});

/**
 * The constants a figure was computed with, per provider, so the arithmetic can
 * be checked from outside. `energy_wh`/`emissions_g` are that provider's share
 * of the platform total, at the central estimate.
 */
export const transparencyProviderEntrySchema = z.object({
  provider: z.string(),
  /** Location-based annual grid average, gCO2e/kWh. */
  grid_g_per_kwh: z.number(),
  /** Power Usage Effectiveness of the datacenter. */
  pue: z.number(),
  /** True when `pue` is our location-derived estimate rather than a figure the
   *  operator publishes. The two are indistinguishable as numbers, so the
   *  surface that prints them has to be told which one it got. */
  pue_estimated: z.boolean(),
  energy_wh: z.number(),
  emissions_g: z.number(),
});

/**
 * One day of platform activity.
 *
 * `active_users` is what the suppression threshold is applied to; a day below
 * it is omitted from the series entirely and counted in `suppressed_days`.
 */
export const transparencyDayEntrySchema = z.object({
  day: z.string(),
  active_users: z.number(),
  requests: z.number(),
  input_tokens: z.number(),
  output_tokens: z.number(),
});

/**
 * The shared per-feature breakdown, plus this area's share of the platform
 * emissions, at the central estimate. 0 for areas whose operations carry no
 * footprint at all — see `unvalued_ops` for why that is a gap, not a saving.
 */
export const transparencyFeatureEntrySchema = usageByFeatureEntrySchema.extend({
  emissions_g: z.number(),
});

export const getTransparencyStatsResponseSchema = z.object({
  success: z.literal(true),
  days: z.number(),
  since: z.string(),
  /** When this snapshot was computed. The endpoint is cached, so it is older
   *  than the request — saying so is cheaper than pretending it is live. */
  generated_at: z.string(),
  /**
   * Smallest number of distinct users a cell must represent to be published.
   * Shipped with the data so the suppression rule is inspectable rather than
   * folded invisibly into the numbers.
   */
  min_group_size: z.number(),
  /**
   * False when the whole window has fewer active users than `min_group_size`.
   * Everything else is then zeroed — an early platform must not publish a
   * footprint that describes two people's afternoon.
   */
  sufficient_data: z.boolean(),
  /** Distinct users over the whole window. */
  active_users: z.number(),
  /** Days withheld for falling under the threshold. Reported so the gap in the
   *  series is visible as suppression rather than as inactivity. */
  suppressed_days: z.number(),
  totals: usageTotalsSchema,
  footprint: transparencyFootprintSchema,
  providers: z.array(transparencyProviderEntrySchema),
  daily: z.array(transparencyDayEntrySchema),
  byFeature: z.array(transparencyFeatureEntrySchema),
  byModel: z.array(usageByModelEntrySchema),
});

export const transparencyErrorResponseSchema = z.object({
  error: z.string(),
});

export type TransparencyFootprintDto = z.infer<typeof transparencyFootprintSchema>;
export type TransparencyProviderEntryDto = z.infer<typeof transparencyProviderEntrySchema>;
export type TransparencyDayEntryDto = z.infer<typeof transparencyDayEntrySchema>;
export type TransparencyFeatureEntryDto = z.infer<typeof transparencyFeatureEntrySchema>;
export type GetTransparencyStatsResponseDto = z.infer<typeof getTransparencyStatsResponseSchema>;

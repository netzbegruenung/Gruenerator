/**
 * Zod schemas for the personal consumption endpoint.
 * Mirrors apps/api/routes/usage/userUsageContractRouter.ts.
 *
 * Reads the `user_usage_daily` aggregate the backend writes for every AI call
 * and returns it pre-sliced for the profile "Nutzung" tab: totals, a daily
 * series for the chart, and breakdowns by tool and by model.
 */
import { z } from 'zod';

export const usageFeatureSchema = z.enum([
  'chat',
  'docs',
  'sheets',
  'presentations',
  'boards',
  'sharepic',
  'subtitler',
  'search',
  'monitor',
  'sites',
  'texte',
  'notebook',
  'other',
]);

/**
 * What is being counted.
 *
 * `speech_seconds` counts SECONDS of generated audio, not calls — one read-aloud
 * is many requests, so a count would describe our chunking rather than any use.
 * The name says so out loud because the usage tab renders the number right next
 * to this label.
 *
 * Widening this enum is additive and safe only while `userUsage` stays out of
 * the `validateResponse` list in packages/shared/src/api/contractsClient.ts: a
 * validating client REJECTS a row carrying a value it predates rather than
 * skipping it. Check that before turning validation on here.
 */
export const usageUnitSchema = z.enum([
  'tokens',
  'images',
  'transcriptions',
  'searches',
  'speech_seconds',
]);

export const usageTotalsSchema = z.object({
  requests: z.number(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  total_tokens: z.number(),
  images: z.number(),
  transcriptions: z.number(),
  searches: z.number(),
  speech_seconds: z.number(),
});

/**
 * Environmental footprint of the text generation in the window.
 *
 * Partly measured — GreenPT reports energy and emissions on every response —
 * and otherwise derived from token counts via coefficients measured against
 * those same models (apps/api/services/usage/energyFootprint.ts).
 *
 * The two share fields are what keep the number honest: a footprint computed
 * from 40% of the tokens must not be rendered as the whole truth, and an
 * estimate must not be dressed up as a measurement.
 */
export const usageFootprintSchema = z.object({
  /** Watt-hours. */
  energy_wh: z.number(),
  /** Grams CO2e, location-based accounting. */
  emissions_g: z.number(),
  /** 0..1 — share of the counted energy that was measured rather than estimated. */
  measured_share: z.number(),
  /**
   * 0..1 — share of the counted energy whose MODEL was never metered anywhere,
   * so it is valued from the bracket between two models that were. Costed at
   * the centre of that bracket; it used to be its ceiling, which is what the
   * name still remembers. The figure resolves once the lane is metered. The
   * remainder (1 - measured - bounded) is a metered coefficient transferred to
   * the same model at another provider.
   */
  bounded_share: z.number(),
  /**
   * 0..1 — share of the window's GENERATED tokens that a footprint covers.
   * Weighted by output rather than by all tokens because output drives energy
   * 100-760x, and real traffic is ~14:1 input-heavy.
   */
  covered_share: z.number(),
  /**
   * The image half of the two totals above, broken out. One generated image
   * costs as much as several hundred chat turns, so a combined figure would
   * read as a chat footprint and be wrong about where the impact sits.
   */
  image_energy_wh: z.number(),
  image_emissions_g: z.number(),
  /**
   * The same requests costed against GPT-4o (Jegham et al., arXiv:2505.09598 —
   * chosen because its system boundary matches ours exactly). Covers only the
   * traffic `covered_share` accounts for, so both sides describe the same work.
   * Energy can come out WORSE than ours on some lanes and better on others; the
   * UI must not present the pair as a guaranteed saving.
   */
  reference_energy_wh: z.number(),
  reference_emissions_g: z.number(),
  /**
   * `emissions_g` again, same scope, computed with the MARKET-based method:
   * zero for every lane whose operator holds a named renewable instrument
   * (Scaleway Guarantee of Origin, Hetzner EMAS, Seeweb certified supply),
   * unchanged where none is documented — image generation above all, where the
   * inference region is invisible to us.
   *
   * Exists to be rendered as the other end of a RANGE against `emissions_g`,
   * never on its own. The two are different accounting methods, not an
   * uncertainty interval, and the GHG Protocol asks for both.
   *
   * ONE-SIDED BY CONSTRUCTION: `reference_emissions_g` has no market-based
   * counterpart, because certificates are only spendable by whoever cancelled
   * them and we hold none of Microsoft's. Any surface showing this field has to
   * say that the optimistic end applies one method to one side.
   */
  market_emissions_g: z.number(),
  /**
   * The image half of `market_emissions_g`, so a consumer can isolate the TEXT
   * side of either method. Necessary rather than convenient: image lanes differ
   * in whether they have an instrument at all — Regolo serves Qwen-Image from
   * Seeweb's certified supply (market-based 0), Black Forest Labs sits behind
   * Azure Front Door with no locatable region (market == location). Subtracting
   * `image_emissions_g` from `market_emissions_g` therefore over-subtracts
   * exactly the Regolo images and makes the market-based text side look better
   * than it is.
   */
  image_market_emissions_g: z.number(),
  /**
   * 0..1 — share of the counted energy whose provider actually has a named
   * instrument. At 1 the whole range rests on documented contracts; below 1 the
   * remainder simply carries its location factor into both ends, so the range
   * narrows rather than overstating.
   */
  market_backed_share: z.number(),
});

export const usageDayEntrySchema = z.object({
  day: z.string(),
  requests: z.number(),
  input_tokens: z.number(),
  output_tokens: z.number(),
});

export const usageByFeatureEntrySchema = z.object({
  feature: usageFeatureSchema,
  requests: z.number(),
  total_tokens: z.number(),
  images: z.number(),
  transcriptions: z.number(),
  searches: z.number(),
  speech_seconds: z.number(),
});

export const usageByModelEntrySchema = z.object({
  provider: z.string(),
  model: z.string(),
  unit: usageUnitSchema,
  requests: z.number(),
  total_tokens: z.number(),
  ops: z.number(),
});

export const getUserUsageResponseSchema = z.object({
  success: z.literal(true),
  days: z.number(),
  since: z.string(),
  totals: usageTotalsSchema,
  footprint: usageFootprintSchema,
  daily: z.array(usageDayEntrySchema),
  byFeature: z.array(usageByFeatureEntrySchema),
  byModel: z.array(usageByModelEntrySchema),
});

export const userUsageErrorResponseSchema = z.object({
  error: z.string(),
});

export type UsageFeature = z.infer<typeof usageFeatureSchema>;
export type UsageUnit = z.infer<typeof usageUnitSchema>;
export type UsageTotalsDto = z.infer<typeof usageTotalsSchema>;
export type UsageFootprintDto = z.infer<typeof usageFootprintSchema>;
export type UsageDayEntryDto = z.infer<typeof usageDayEntrySchema>;
export type UsageByFeatureEntryDto = z.infer<typeof usageByFeatureEntrySchema>;
export type UsageByModelEntryDto = z.infer<typeof usageByModelEntrySchema>;
export type GetUserUsageResponseDto = z.infer<typeof getUserUsageResponseSchema>;

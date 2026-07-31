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

export const usageUnitSchema = z.enum(['tokens', 'images', 'transcriptions', 'searches']);

export const usageTotalsSchema = z.object({
  requests: z.number(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  total_tokens: z.number(),
  images: z.number(),
  transcriptions: z.number(),
  searches: z.number(),
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
  /** 0..1 — share of the window's text tokens that any footprint covers. */
  covered_share: z.number(),
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

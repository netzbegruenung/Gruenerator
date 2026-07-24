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
export type UsageDayEntryDto = z.infer<typeof usageDayEntrySchema>;
export type UsageByFeatureEntryDto = z.infer<typeof usageByFeatureEntrySchema>;
export type UsageByModelEntryDto = z.infer<typeof usageByModelEntrySchema>;
export type GetUserUsageResponseDto = z.infer<typeof getUserUsageResponseSchema>;

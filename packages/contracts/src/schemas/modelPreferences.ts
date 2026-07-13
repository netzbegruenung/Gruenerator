/**
 * Zod schemas for AI model preferences endpoints.
 *
 * Per-user toggle of which chat models appear in the model picker.
 * Stored under `profiles.user_defaults.models`.
 */
import { z } from 'zod';

export const modelIdSchema = z.enum(['mistral-medium-3.5', 'litellm', 'gemma-litellm']);

export const modelPreferenceSchema = z.object({
  enabled: z.boolean(),
});

export const modelPreferencesMapSchema = z.record(modelPreferenceSchema);

export const modelPreferencesResponseSchema = z.object({
  success: z.boolean(),
  preferences: modelPreferencesMapSchema,
  defaults: modelPreferencesMapSchema,
});

export const updateModelPreferenceBodySchema = z.object({
  modelId: modelIdSchema,
  enabled: z.boolean(),
});

export const modelPreferencesErrorResponseSchema = z.object({
  error: z.string(),
});

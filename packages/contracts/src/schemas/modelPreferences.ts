/**
 * Zod schemas for AI model preferences endpoints.
 *
 * Per-user toggle of which chat models appear in the model picker.
 * Stored under `profiles.user_defaults.models`.
 */
import { z } from 'zod';

/**
 * F0: die Werte stehen in `profiles.user_defaults.models` und in bereits
 * ausgelieferten Mobile-Bundles. Die Größen-Lanes kamen additiv dazu; die drei
 * Vendor-IDs bleiben gültig und werden serverseitig auf ihre Lane abgebildet
 * (`resolveTextModelId` in @gruenerator/core/models).
 */
export const modelIdSchema = z.enum([
  'gruenerator-small',
  'gruenerator-medium',
  'gruenerator-ultra',
  'greenpt',
  // Veraltet — nur noch entgegengenommen, nicht mehr angeboten.
  'mistral-medium-3.5',
  'litellm',
  'gemma-litellm',
]);

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

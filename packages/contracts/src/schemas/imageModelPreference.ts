import { z } from 'zod';

export const imageModelIdSchema = z.enum([
  'flux-klein',
  'flux-pro',
  'flux-max',
  'regolo-image',
  'ionos-image',
]);

export const imageModelPreferenceResponseSchema = z.object({
  success: z.boolean(),
  defaultImageModel: imageModelIdSchema,
});

export const updateImageModelPreferenceBodySchema = z.object({
  modelId: imageModelIdSchema,
});

export const imageModelPreferenceErrorResponseSchema = z.object({
  error: z.string(),
});

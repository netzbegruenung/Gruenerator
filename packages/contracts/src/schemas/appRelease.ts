import { z } from 'zod';

/**
 * The version of the mobile app that is live in Apple's App Store. Looked up by
 * the backend, so devices never ask Apple themselves. Android asks Google Play
 * on the device (Play In-App Updates) and has no counterpart here.
 */
export const iosStoreReleaseResponseSchema = z.object({
  /** null while the app is not (yet) public or the lookup failed. */
  version: z.string().nullable(),
});

export type IosStoreReleaseResponse = z.infer<typeof iosStoreReleaseResponseSchema>;

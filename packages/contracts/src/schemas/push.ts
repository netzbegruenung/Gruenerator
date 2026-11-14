/**
 * Zod schemas for app push device registration (`/api/push/devices`).
 *
 * The device sends its native APNs/FCM token and a 32-byte key it generated
 * itself. The server encrypts every push with that key (AES-256-GCM), so
 * Apple and Google only ever carry ciphertext. Wire format is F0 once an app
 * ships against it: add fields, never rename.
 */
import { z } from 'zod';

export const pushPlatformSchema = z.enum(['ios', 'android']);
export type PushPlatform = z.infer<typeof pushPlatformSchema>;

/** Which APNs host serves the token: dev-client builds get sandbox tokens. */
export const apnsEnvironmentSchema = z.enum(['production', 'sandbox']);
export type ApnsEnvironment = z.infer<typeof apnsEnvironmentSchema>;

/** Standard base64 of exactly 32 bytes (44 chars incl. one `=`). */
const pushKeySchema = z.string().regex(/^[A-Za-z0-9+/]{43}=$/, 'key must be 32 bytes, base64');

export const registerPushDeviceBodySchema = z
  .object({
    platform: pushPlatformSchema,
    token: z.string().min(1).max(4096),
    key: pushKeySchema,
    apnsEnvironment: apnsEnvironmentSchema.nullable(),
  })
  .refine((b) => (b.platform === 'ios') === (b.apnsEnvironment !== null), {
    message: 'apnsEnvironment is required for ios and must be null for android',
    path: ['apnsEnvironment'],
  });
export type RegisterPushDeviceBody = z.infer<typeof registerPushDeviceBodySchema>;

export const registerPushDeviceResponseSchema = z.object({ id: z.string().uuid() });

export const pushDeviceParamsSchema = z.object({ id: z.string().uuid() });

export const pushOkResponseSchema = z.object({ success: z.literal(true) });

export const pushErrorResponseSchema = z.object({ message: z.string() });

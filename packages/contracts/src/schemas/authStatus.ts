/**
 * Zod schemas for the /api/auth/status endpoint.
 *
 * The status endpoint reports the current session: either authenticated (with
 * the full UserProfile) or unauthenticated (user = null). Both branches return
 * 200, so a single response schema covers the surface.
 *
 * Reuses `userProfileSchema` from userProfile.ts so the contract is the single
 * source of truth for the canonical UserProfile shape end-to-end.
 */
import { z } from 'zod';

import { userProfileSchema } from './userProfile.js';

export const authStatusResponseSchema = z.object({
  isAuthenticated: z.boolean(),
  user: userProfileSchema.nullable(),
});

export type AuthStatusResponseSchema = z.infer<typeof authStatusResponseSchema>;

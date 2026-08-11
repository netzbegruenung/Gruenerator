/**
 * Zod schemas for the BGST-instance admin overview — read-only, scoped to
 * whichever single deployment it's mounted on (each deployment has its own
 * Postgres, so this never crosses instances). Data-minimal: no chat content,
 * no `beta_features`/`user_defaults` dump beyond the `roles` projection.
 */
import { z } from 'zod';

export const bgstUserSummarySchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  isAdmin: z.boolean(),
  lastLogin: z.string().nullable(),
  createdAt: z.string().nullable(),
});

export const bgstUsersResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(bgstUserSummarySchema),
});

// Read projection over `profiles.user_defaults.profile.roles` — no new
// table, no write capability. Shape mirrors UserRole in @gruenerator/chat
// loosely (kept untyped here since the jsonb blob isn't schema-validated).
export const bgstUserRoleSummarySchema = z.object({
  userId: z.string(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  roles: z.array(z.record(z.string(), z.unknown())).nullable(),
});

export const bgstRolesResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(bgstUserRoleSummarySchema),
});

export const bgstOverviewErrorResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

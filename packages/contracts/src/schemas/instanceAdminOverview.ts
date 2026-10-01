/**
 * Zod schemas for the BGST-instance admin overview — read-only, scoped to
 * whichever single deployment it's mounted on (each deployment has its own
 * Postgres, so this never crosses instances). Data-minimal: no chat content,
 * no `beta_features`/`user_defaults` dump beyond the `roles` projection.
 */
import { z } from 'zod';

export const instanceAdminUserSummarySchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  isAdmin: z.boolean(),
  lastLogin: z.string().nullable(),
  createdAt: z.string().nullable(),
  /** The admin's decision on the „Panda" lane; null = instance default. */
  pandaEnabled: z.boolean().nullable(),
  /** What applies right now: the decision, else the instance default. */
  pandaEffective: z.boolean(),
});

export type InstanceAdminUserSummary = z.infer<typeof instanceAdminUserSummarySchema>;

/** Unlock or lock the „Panda" lane for one account (after training). */
export const instanceAdminSetPandaBodySchema = z.object({
  enabled: z.boolean(),
});

export const instanceAdminSetPandaResponseSchema = z.object({
  success: z.boolean(),
  data: instanceAdminUserSummarySchema,
});

export const instanceAdminUsersResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(instanceAdminUserSummarySchema),
});

// Read projection over `profiles.user_defaults.profile.roles` — no new
// table, no write capability. Shape mirrors UserRole in @gruenerator/chat
// loosely (kept untyped here since the jsonb blob isn't schema-validated).
export const instanceAdminUserRoleSummarySchema = z.object({
  userId: z.string(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  roles: z.array(z.record(z.string(), z.unknown())).nullable(),
});

export const instanceAdminRolesResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(instanceAdminUserRoleSummarySchema),
});

export const instanceAdminOverviewErrorResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

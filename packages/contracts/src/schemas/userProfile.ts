/**
 * Zod schemas for user-profile endpoints.
 * Mirrors apps/api/routes/auth/userProfile.ts.
 */
import { z } from 'zod';

// ── Request body schemas (moved from controller) ────────────────────────────

export const profileUpdateBodySchema = z.object({
  display_name: z.string().optional(),
  username: z.string().optional(),
  avatar_robot_id: z.number().int().min(1).max(10).optional(),
  email: z.string().optional(),
  custom_prompt: z.string().optional(),
});

export const avatarUpdateBodySchema = z.object({
  avatar_robot_id: z.number().int().min(1).max(10),
});

export const betaFeatureToggleBodySchema = z.object({
  feature: z.string().min(1),
  enabled: z.boolean(),
});

export const messageColorUpdateBodySchema = z.object({
  color: z.string().min(1),
});

export const userDefaultUpdateBodySchema = z.object({
  generator: z.string().min(1),
  key: z.string().min(1),
  value: z.unknown(),
});

export const deleteAccountBodySchema = z.object({
  confirm: z.string().optional(),
  confirmation: z.string().optional(),
  password: z.string().optional(),
});

// ── Shared sub-schemas ───────────────────────────────────────────────────────

/** Flat UserProfile shape returned from ProfileService */
export const userProfileSchema = z.object({
  id: z.string(),
  keycloak_id: z.string().optional(),
  // The `profiles.email` column is nullable at the DB level (TEXT NULL), but
  // the canonical `UserProfile` type models the POST-null-strip shape — NOT
  // the raw storage shape. `apps/api/middleware/authMiddleware.ts`'s
  // `toBetterAuthUser()` is the single authoritative boundary that coerces
  // every `null` field to `undefined` before calling `userProfileSchema.parse()`.
  // After that boundary, every consumer sees `email: string | undefined`
  // (absent or present, never null).
  //
  // **Invariant**: any new code path that parses `userProfileSchema` MUST
  // null-strip first, or it will trip on NULL rows. See the comment on
  // `toBetterAuthUser` for details.
  //
  // Why not `.nullable().optional()`? That widens the inferred type to
  // `string | null | undefined` and propagates three distinct "no email"
  // states through every consumer, doubling the test surface and forcing
  // per-call-site `?? undefined` coercions. The null-strip boundary makes
  // that unnecessary — one answer, one type.
  email: z.string().optional(),
  // Set when email comes from an external IdP (e.g. Keycloak) — used by
  // the frontend to gate "change email" UI for SSO users.
  auth_email: z.string().optional(),
  username: z.string().optional(),
  display_name: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  // Defaults mirror the `additionalFields` config in apps/api/config/betterAuth.ts.
  // Zod applies them only when the parsed input is missing the key, so existing
  // responses (which already populate every field) are unaffected. The purpose
  // is to let `authMiddleware.toBetterAuthUser()` parse a raw Better Auth
  // session object without inline fallbacks.
  avatar_robot_id: z.number().default(1),
  chat_color: z.string().optional(),
  beta_features: z.record(z.boolean()).default({}),
  user_defaults: z.record(z.record(z.unknown())).default({}),
  locale: z.enum(['de-DE', 'de-AT']).optional(),
  is_admin: z.boolean().optional(),
  groups_enabled: z.boolean().default(false),
  custom_generators: z.boolean().default(false),
  database_access: z.boolean().default(false),
  collab: z.boolean().default(false),
  notebook: z.boolean().default(false),
  sharepic: z.boolean().default(false),
  anweisungen: z.boolean().default(false),
  labor_enabled: z.boolean().default(false),
  sites_enabled: z.boolean().default(true),
  chat: z.boolean().default(false),
  interactive_antrag_enabled: z.boolean().default(true),
  vorlagen: z.boolean().default(false),
  video_editor: z.boolean().default(false),
  scanner: z.boolean().optional(),
  prompts: z.boolean().optional(),
  docs: z.boolean().optional(),
  boards: z.boolean().optional(),
  bundestag_api_enabled: z.boolean().optional(),
  memory_enabled: z.boolean().optional(),
  wordpress_enabled: z.boolean().optional(),
  custom_prompt: z.string().optional(),
  created_at: z.union([z.string(), z.date()]),
  updated_at: z.union([z.string(), z.date()]),
  last_login: z.union([z.string(), z.date()]).optional(),
  // extra field added by the handler
  is_sso_user: z.boolean().optional(),
});

/** Canonical user profile type — single source of truth across backend + frontend. */
export type UserProfile = z.infer<typeof userProfileSchema>;

export const betaFeaturesSchema = z.record(z.boolean());

export const userDefaultsSchema = z.record(z.record(z.unknown()));

// ── Response schemas ─────────────────────────────────────────────────────────

export const getProfileResponseSchema = z.object({
  success: z.literal(true),
  user: userProfileSchema,
});

export const updateProfileResponseSchema = z.object({
  success: z.literal(true),
  profile: userProfileSchema,
  message: z.string(),
});

export const updateAvatarResponseSchema = z.object({
  success: z.literal(true),
  profile: userProfileSchema,
  message: z.string(),
});

export const getBetaFeaturesResponseSchema = z.object({
  success: z.literal(true),
  betaFeatures: betaFeaturesSchema,
});

export const updateBetaFeaturesResponseSchema = z.object({
  success: z.literal(true),
  betaFeatures: betaFeaturesSchema,
  message: z.string(),
});

export const updateMessageColorResponseSchema = z.object({
  success: z.literal(true),
  messageColor: z.string(),
  message: z.string(),
});

export const getUserDefaultsResponseSchema = z.object({
  success: z.literal(true),
  userDefaults: userDefaultsSchema,
});

export const updateUserDefaultsResponseSchema = z.object({
  success: z.literal(true),
  userDefaults: userDefaultsSchema,
  message: z.string(),
});

export const deleteAccountResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

export const userProfileErrorResponseSchema = z.object({
  success: z.literal(false),
  message: z.string(),
});

export const deleteAccountErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string().optional(),
  message: z.string(),
});

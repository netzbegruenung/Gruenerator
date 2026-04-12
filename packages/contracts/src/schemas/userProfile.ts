/**
 * Zod schemas for user-profile endpoints.
 * Mirrors apps/api/routes/auth/userProfile.ts.
 */
import { z } from 'zod';

// ── Request body schemas (moved from controller) ────────────────────────────

export const profileUpdateBodySchema = z.object({
  display_name: z.string().optional(),
  username: z.string().optional(),
  avatar_robot_id: z.number().int().min(1).max(9).optional(),
  email: z.string().optional(),
  custom_prompt: z.string().optional(),
});

export const avatarUpdateBodySchema = z.object({
  avatar_robot_id: z.number().int().min(1).max(9),
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

export const notificationPreferencesBodySchema = z.object({
  category: z.string().min(1),
  channels: z.object({
    email: z.boolean().optional(),
    push: z.boolean().optional(),
    in_app: z.boolean().optional(),
  }),
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
  email: z.string(),
  // Set when email comes from an external IdP (e.g. Keycloak) — used by
  // the frontend to gate "change email" UI for SSO users.
  auth_email: z.string().optional(),
  username: z.string().optional(),
  display_name: z.string().optional(),
  avatar_robot_id: z.number(),
  chat_color: z.string().optional(),
  beta_features: z.record(z.boolean()),
  user_defaults: z.record(z.record(z.unknown())),
  locale: z.enum(['de-DE', 'de-AT']).optional(),
  groups_enabled: z.boolean(),
  custom_generators: z.boolean(),
  database_access: z.boolean(),
  collab: z.boolean(),
  notebook: z.boolean(),
  sharepic: z.boolean(),
  anweisungen: z.boolean(),
  labor_enabled: z.boolean(),
  sites_enabled: z.boolean(),
  chat: z.boolean(),
  interactive_antrag_enabled: z.boolean(),
  vorlagen: z.boolean(),
  video_editor: z.boolean(),
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

export const channelPreferencesSchema = z.object({
  email: z.boolean(),
  push: z.boolean(),
  in_app: z.boolean(),
});

export const notificationPreferencesResponseDataSchema = z.record(channelPreferencesSchema);

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

export const getNotificationPreferencesResponseSchema = z.object({
  success: z.literal(true),
  preferences: notificationPreferencesResponseDataSchema,
  defaults: notificationPreferencesResponseDataSchema,
});

export const updateNotificationPreferencesResponseSchema = z.object({
  success: z.literal(true),
  preferences: notificationPreferencesResponseDataSchema,
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

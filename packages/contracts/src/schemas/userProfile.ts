/**
 * Zod schemas for user-profile endpoints.
 * Mirrors apps/api/routes/auth/userProfile.ts.
 */
import { ROBOT_ID_MIN, ROBOT_ID_MAX } from '@gruenerator/core/avatar';
import { z } from 'zod';

/**
 * Fehlercode, mit dem die KI-Eingänge eine fehlende Art.-9-Einwilligung
 * abweisen (HTTP 403). Bewusst **nicht** 401: die Sitzung ist gültig, es fehlt
 * nur die Einwilligung — auf 401 räumen beide Clients die Anmeldung ab.
 *
 * F0: der Wert steht in ausgelieferten Mobile-Binaries. Nicht umbenennen.
 */
export const AI_CONSENT_REQUIRED_CODE = 'ai_consent_required';

/** Erkennt die 403-Antwort oben an einem beliebig getippten Fehlerrumpf. */
export function isAiConsentRequiredBody(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { code?: unknown }).code === AI_CONSENT_REQUIRED_CODE
  );
}

// ── Request body schemas (moved from controller) ────────────────────────────

/**
 * Closed set of default start pages — which Workplace surface the sidebar
 * "start" icon (and the root/login redirect) opens.
 *   'chat'     → /start      (Chat)
 *   'arbeiten' → /workplace  (Arbeiten)
 * F0: die Werte stehen in der Datenbank und in ausgelieferten Binaries — die
 * Pfade dahinter dürfen sich ändern, die Enum-Werte nicht.
 */
export const startPageSchema = z.enum(['chat', 'arbeiten']);
export type StartPage = z.infer<typeof startPageSchema>;

/**
 * Closed set of feedback-launcher appearances — how the floating feedback
 * button renders, or whether it renders at all.
 *   'text' → pill with the label „Feedback" (default)
 *   'icon' → compact icon-only button
 *   'off'  → hidden entirely
 */
export const feedbackButtonSchema = z.enum(['text', 'icon', 'off']);
export type FeedbackButtonMode = z.infer<typeof feedbackButtonSchema>;

/**
 * Absender for the PDF letterhead.
 *
 * Free text, and the address is multi-line: senderLines() splits it on '\n',
 * and real Gliederung addresses ("c/o Kreisgeschäftsstelle", "Stiege 2/Top 5")
 * do not fit a street/zip/city triple. Capped at 3 lines so the renderer's
 * 5-line clamp (organization + name + address) never has to truncate.
 *
 * Always `.optional()`, never `.default()` — a default would make the field
 * required in the inferred UserProfile, and therefore in DEV_BYPASS_USER and
 * buildE2EBypassAuthData.
 */
export const senderOrganizationSchema = z.string().max(120);
export const senderAddressSchema = z
  .string()
  .max(300)
  .refine((v) => v.split('\n').length <= 3, 'höchstens 3 Zeilen');

export const profileUpdateBodySchema = z.object({
  display_name: z.string().optional(),
  username: z.string().optional(),
  avatar_robot_id: z.number().int().min(ROBOT_ID_MIN).max(ROBOT_ID_MAX).optional(),
  email: z.string().optional(),
  custom_prompt: z.string().optional(),
  default_startpage: startPageSchema.optional(),
  feedback_button: feedbackButtonSchema.optional(),
  reduce_motion: z.boolean().optional(),
  reduce_transparency: z.boolean().optional(),
  show_skip_link: z.boolean().optional(),
  /** The Gedächtnis switch in the Erinnerungen tab (profiles.memory_enabled). */
  memory_enabled: z.boolean().optional(),
  /**
   * Ausdrückliche Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO. Der Client
   * schreibt nur „erteilt/widerrufen" — den Zeitstempel setzt der Server, damit
   * der Nachweis nach Art. 7 Abs. 1 DSGVO nicht aus der Browseruhr stammt.
   */
  ai_consent: z.boolean().optional(),
});

/** The exact set of profile columns a client may write. */
export type ProfileUpdateBody = z.infer<typeof profileUpdateBodySchema>;

export const avatarUpdateBodySchema = z.object({
  avatar_robot_id: z.number().int().min(ROBOT_ID_MIN).max(ROBOT_ID_MAX),
});

export const betaFeatureToggleBodySchema = z.object({
  feature: z.string().min(1),
  enabled: z.boolean(),
});

export const messageColorUpdateBodySchema = z.object({
  color: z.string().min(1),
});

/**
 * Closed set of chat-start backgrounds. The values are preset *keys*, not raw
 * colours — the actual gradients live in the frontend CSS
 * (`apps/web/src/features/workplace/workplace-sunrise.css`), so a redesign
 * never needs a data migration. `sunrise` was the historical default; `mesh` is
 * the current one.
 *
 * Adding a key is the only safe direction here. A shipped mobile binary parses
 * this enum from the profile it fetches, so a key it has never heard of has to
 * degrade rather than fail — `resolveChatBackground` in
 * `@gruenerator/shared/settings` does that by falling back to the default. That
 * is also why no key is ever removed: rows in the database still carry it.
 */
export const chatBackgroundSchema = z.enum([
  'mesh',
  'nebel',
  'kern',
  'dunst',
  'sunrise',
  'tanne',
  'himmel',
  'sand',
  'magenta',
  'regenbogen',
  'neutral',
]);
export type ChatBackground = z.infer<typeof chatBackgroundSchema>;

export const chatBackgroundUpdateBodySchema = z.object({
  background: chatBackgroundSchema,
});

/** Closed set of supported locales — the single vocabulary for DE/AT audience. */
export const localeSchema = z.enum(['de-DE', 'de-AT']);
export type SupportedLocale = z.infer<typeof localeSchema>;

export const localeUpdateBodySchema = z.object({
  locale: localeSchema,
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
  // Absent means "never chosen" — consumers fall back to the `sunrise` preset.
  chat_background: chatBackgroundSchema.optional(),
  beta_features: z.record(z.boolean()).default({}),
  user_defaults: z.record(z.record(z.unknown())).default({}),
  locale: localeSchema.optional(),
  // Default mirrors the `additionalFields` config in apps/api/config/betterAuth.ts.
  default_startpage: startPageSchema.default('chat'),
  feedback_button: feedbackButtonSchema.default('text'),
  reduce_motion: z.boolean().default(false),
  reduce_transparency: z.boolean().default(false),
  show_skip_link: z.boolean().default(true),
  /**
   * ISO-Zeitstempel der Art.-9-Einwilligung; null = nicht erteilt.
   *
   * Better Auth führt das Feld als `type: 'date'` (TIMESTAMPTZ-Spalte) und
   * liefert in `session.user` deshalb ein `Date`, während `profileMapper`
   * bereits einen ISO-String liefert. Beide Eingaben akzeptieren und auf den
   * String normalisieren — wie bei `created_at`/`updated_at`.
   */
  ai_consent_at: z
    .union([z.string(), z.date()])
    .nullish()
    .transform((value) => (value instanceof Date ? value.toISOString() : value)),
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

export const updateChatBackgroundResponseSchema = z.object({
  success: z.literal(true),
  chatBackground: chatBackgroundSchema,
  message: z.string(),
});

export const updateLocaleResponseSchema = z.object({
  success: z.literal(true),
  locale: localeSchema,
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

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    first_name: text('first_name'),
    last_name: text('last_name'),
    display_name: text('display_name'),
    avatar_url: text('avatar_url'),
    deutschlandmodus: boolean('deutschlandmodus').notNull().default(false),
    is_admin: boolean('is_admin').notNull().default(false),
    profile_image: integer('profile_image').notNull().default(1),
    avatar_robot_id: integer('avatar_robot_id').notNull().default(1),
    keycloak_id: text('keycloak_id'),
    username: text('username'),
    last_login: timestamp('last_login', { withTimezone: true }),
    email: text('email'),
    email_verified: boolean('email_verified').notNull().default(false),
    custom_prompt: text('custom_prompt'),
    beta_features: jsonb('beta_features').$type<Record<string, boolean>>().notNull().default({}),
    presseabbinder: text('presseabbinder'),
    custom_antrag_gliederung: text('custom_antrag_gliederung'),
    auth_source: text('auth_source'),
    // Nullable: NULL heißt „Land unbekannt". Wer hier einen Default setzt,
    // schreibt wieder Deutschland in Profile, über die nichts bekannt ist.
    locale: text('locale'),
    locale_source: text('locale_source').$type<'idp' | 'user'>(),
    groups_enabled: boolean('groups_enabled').notNull().default(false),
    groups: boolean('groups').notNull().default(false),
    custom_generators: boolean('custom_generators').notNull().default(false),
    database_access: boolean('database_access').notNull().default(false),
    collab: boolean('collab').notNull().default(false),
    notebook: boolean('notebook').notNull().default(false),
    sharepic: boolean('sharepic').notNull().default(false),
    anweisungen: boolean('anweisungen').notNull().default(false),
    chat_color: text('chat_color'),
    chat_background: text('chat_background'),
    content_management: boolean('content_management').notNull().default(false),
    labor_enabled: boolean('labor_enabled').notNull().default(false),
    sites: boolean('sites').notNull().default(false),
    sites_enabled: boolean('sites_enabled').notNull().default(true),
    chat: boolean('chat').notNull().default(false),
    website: boolean('website').notNull().default(false),
    ai_sharepic: boolean('ai_sharepic').notNull().default(false),
    vorlagen: boolean('vorlagen').notNull().default(false),
    video_editor: boolean('video_editor').notNull().default(false),
    scanner: boolean('scanner').notNull().default(false),
    prompts: boolean('prompts').notNull().default(false),
    interactive_antrag_enabled: boolean('interactive_antrag_enabled').notNull().default(true),
    nextcloud_share_links: jsonb('nextcloud_share_links')
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    document_mode: text('document_mode').notNull().default('manual'),
    default_startpage: text('default_startpage').notNull().default('chat'),
    tts_voice_id: text('tts_voice_id'),
    user_defaults: jsonb('user_defaults')
      .$type<Record<string, Record<string, unknown>>>()
      .notNull()
      .default({}),
    docs: boolean('docs').notNull().default(false),
    boards: boolean('boards').notNull().default(false),
    bundestag_api_enabled: boolean('bundestag_api_enabled').notNull().default(false),
    memory_enabled: boolean('memory_enabled').notNull().default(true),
    feedback_button: text('feedback_button').notNull().default('text'),
    reduce_motion: boolean('reduce_motion').notNull().default(false),
    reduce_transparency: boolean('reduce_transparency').notNull().default(false),
    show_skip_link: boolean('show_skip_link').notNull().default(true),
    // Derived server-side from `user_defaults.profile.roles[].bundesland`
    // (see LandesverbandDerivationService) — not written directly by the
    // client. No `.references()` here to avoid a circular import with
    // landesverbaende.ts; the real FK constraint lives in the SQL migration.
    landesverband_id: text('landesverband_id'),
    /** Art. 9 Abs. 2 lit. a DSGVO — NULL heißt „nicht erteilt bzw. widerrufen". */
    ai_consent_at: timestamp('ai_consent_at', { withTimezone: true }),
  },
  (table) => ({
    emailIdx: index('idx_profiles_email').on(table.email),
    landesverbandIdx: index('idx_profiles_landesverband_id').on(table.landesverband_id),
  })
);

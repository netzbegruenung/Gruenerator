import {
  type GroupAudience,
  type GroupCloudProvider,
  type GroupColor,
  type GroupLink,
  type GroupRole,
  type JoinRequestStatus,
  type LandesverbandId,
} from '@gruenerator/contracts';
import { type InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  created_by: uuid('created_by'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
  join_token: text('join_token'),
  is_active: boolean('is_active').default(true),
  group_type: text('group_type').default('standard'),
  settings: jsonb('settings').$type<Record<string, unknown>>().default({}),
  /**
   * Tot: kein Leser, kein Schreiber. Die Wolke-Freigabe an eine Gruppe läuft
   * über `group_content_shares` (`content_type = 'nextcloud_share_link'`).
   * Nicht gedroppt, weil DB-Spalten extern eingefroren sind (CLAUDE.md, F0) —
   * Kandidat für einen expand→contract-Lauf, wenn ohnehin einer ansteht.
   */
  wolke_share_links: jsonb('wolke_share_links').$type<unknown[]>().default([]),
  avatar_url: text('avatar_url'),
  links: jsonb('links').$type<GroupLink[]>().default([]),
  // Discoverability. TEXT column (no enum DDL) narrowed to a closed union in TS.
  is_public: boolean('is_public').notNull().default(false),
  audience: text('audience').$type<GroupAudience>().notNull().default('all'),
  // Stable 6-char tail for Notion-style URLs (`/gruppen/<name>-<suffix>`).
  // Nullable until the boot-time backfill fills legacy rows.
  slug_suffix: text('slug_suffix'),
  // The one system group: every profile is a member, only instance admins
  // share, and member info is never exposed. See services/groups/systemGroup.ts.
  is_system: boolean('is_system').notNull().default(false),
  // Explicit Landesverband of the project (id of `LANDESVERBAENDE`); beats the
  // active role when picking LV recipe variants. Narrowed in contracts.
  landesverband: text('landesverband').$type<LandesverbandId>(),
  // „Nur Projekt-Rezepte verwenden": Chats im Projekt laden von sich aus nur
  // die Textsorten-Rezepte des Projekts (`prioritizeProjectRecipes`).
  recipes_exclusive: boolean('recipes_exclusive').notNull().default(false),
  // Set by a project admin: leaves the main lists, stays readable, takes no new content.
  archived_at: timestamp('archived_at', { withTimezone: true }),
  // Optional tile colour from the fixed palette; null = the default blue.
  color: text('color').$type<GroupColor>(),
});

export const group_memberships = pgTable('group_memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  group_id: uuid('group_id').notNull(),
  user_id: uuid('user_id').notNull(),
  role: text('role').$type<GroupRole>().default('member'),
  joined_at: timestamp('joined_at', { withTimezone: true }).defaultNow(),
  is_active: boolean('is_active').default(true),
  // Per-member opt-out: when true, this user's email + push notifications for
  // this group are suppressed (in-app notifications still appear). Toggled via
  // the group's 3-dot menu.
  notifications_muted: boolean('notifications_muted').notNull().default(false),
});

export const group_join_requests = pgTable('group_join_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  group_id: uuid('group_id').notNull(),
  user_id: uuid('user_id').notNull(),
  status: text('status').$type<JoinRequestStatus>().notNull().default('pending'),
  requested_at: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  reviewed_by: uuid('reviewed_by'),
  reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
});

// Laufzeit-DDL in schema.sql bzw. zz_20260927_group_feed.sql; hier nur die Typquelle.
export const group_content_shares = pgTable('group_content_shares', {
  id: uuid('id').primaryKey().defaultRandom(),
  group_id: uuid('group_id'),
  shared_by_user_id: uuid('shared_by_user_id'),
  content_type: text('content_type').notNull(),
  content_id: text('content_id').notNull(),
  permissions: jsonb('permissions').$type<Record<string, unknown>>().default({}),
  shared_at: timestamp('shared_at', { withTimezone: true }).defaultNow(),
  note: text('note'),
  pinned_at: timestamp('pinned_at', { withTimezone: true }),
  pinned_by: uuid('pinned_by'),
});

export const group_share_comments = pgTable('group_share_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  share_id: uuid('share_id').notNull(),
  group_id: uuid('group_id').notNull(),
  user_id: uuid('user_id'),
  body: text('body').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** Kommentar oberster Ebene, an dem diese Antwort hängt (zz_20260928_group_comment_threads.sql). */
  parent_id: uuid('parent_id'),
});

// Laufzeit-DDL in schema.sql bzw. zz_20260928_group_posts.sql.
export const group_posts = pgTable('group_posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  group_id: uuid('group_id').notNull(),
  author_id: uuid('author_id'),
  body: text('body').notNull().default(''),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  edited_at: timestamp('edited_at', { withTimezone: true }),
});

export const group_post_files = pgTable('group_post_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  post_id: uuid('post_id').notNull(),
  group_id: uuid('group_id').notNull(),
  stored_filename: text('stored_filename').notNull(),
  file_name: text('file_name').notNull(),
  mime_type: text('mime_type').notNull(),
  size_bytes: integer('size_bytes').notNull(),
  position: smallint('position').notNull().default(0),
});

// Laufzeit-DDL in schema.sql. `group_id` ist dort UNIQUE (eine Zeile je Projekt).
export const group_instructions = pgTable('group_instructions', {
  id: uuid('id').primaryKey().defaultRandom(),
  group_id: uuid('group_id'),
  custom_prompt: text('custom_prompt').default(''),
  instructions_enabled: boolean('instructions_enabled').default(false),
  is_active: boolean('is_active').default(true),
  // Projekt-Start (Begrüßung + Startfragen); getrennt von den Anweisungen, teilt nur die Zeile.
  welcome_message: text('welcome_message').default(''),
  start_questions: jsonb('start_questions').$type<string[]>().default([]),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Laufzeit-DDL in schema.sql / zz_20261124_group_cloud_sources.sql.
// Unique (group_id, user_id, provider, share_link_id, folder_path).
export const group_cloud_sources = pgTable('group_cloud_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  group_id: uuid('group_id').notNull(),
  user_id: uuid('user_id').notNull(),
  provider: text('provider').$type<GroupCloudProvider>().notNull(),
  share_link_id: text('share_link_id').notNull().default(''),
  folder_path: text('folder_path').notNull().default(''),
  name: text('name').notNull(),
  include_subfolders: boolean('include_subfolders').notNull().default(true),
  /** Nur Google Drive: die im Picker gewählten Dateien. */
  picked_files: jsonb('picked_files').$type<PickedCloudFile[]>().notNull().default([]),
  /** Datei-Schlüssel (WebDAV-href bzw. Drive-Id) → Dokument und gesehene Version. */
  synced_files: jsonb('synced_files')
    .$type<Record<string, SyncedCloudFile>>()
    .notNull()
    .default({}),
  file_count: integer('file_count').notNull().default(0),
  pending_count: integer('pending_count').notNull().default(0),
  last_synced_at: timestamp('last_synced_at', { withTimezone: true }),
  last_error: text('last_error'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export interface PickedCloudFile {
  id: string;
  name: string;
  mimeType: string;
}

export interface SyncedCloudFile {
  /** `documents.id` */
  id: string;
  /** Version beim letzten Einlesen (Drive: `modifiedTime`); Wolke prüft per ETag selbst. */
  v?: string | null;
}

export type GroupRow = InferSelectModel<typeof groups>;
export type GroupMembershipRow = InferSelectModel<typeof group_memberships>;
export type GroupJoinRequestRow = InferSelectModel<typeof group_join_requests>;
export type GroupContentShareRow = InferSelectModel<typeof group_content_shares>;
export type GroupShareCommentRow = InferSelectModel<typeof group_share_comments>;
export type GroupPostRow = InferSelectModel<typeof group_posts>;
export type GroupPostFileRow = InferSelectModel<typeof group_post_files>;
export type GroupInstructionsRow = InferSelectModel<typeof group_instructions>;
export type GroupCloudSourceRow = InferSelectModel<typeof group_cloud_sources>;

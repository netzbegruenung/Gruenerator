import {
  type GroupAudience,
  type GroupLink,
  type GroupRole,
  type JoinRequestStatus,
} from '@gruenerator/contracts';
import { type InferSelectModel } from 'drizzle-orm';
import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  created_by: uuid('created_by'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
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
});

export type GroupRow = InferSelectModel<typeof groups>;
export type GroupMembershipRow = InferSelectModel<typeof group_memberships>;
export type GroupJoinRequestRow = InferSelectModel<typeof group_join_requests>;
export type GroupContentShareRow = InferSelectModel<typeof group_content_shares>;
export type GroupShareCommentRow = InferSelectModel<typeof group_share_comments>;

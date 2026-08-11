import { type InferSelectModel } from 'drizzle-orm';
import { index, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { profiles } from './core.js';

// F1 registry: `id` is the slugified Bundesland/Landesorganisation name (see
// `slugifyName` in packages/shared/src/utils/slug.ts — the same function the
// derivation service uses to translate `profile.roles[].bundesland` labels
// into this id). Never renamed once seeded.
export const landesverbaende = pgTable('landesverbaende', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  country: text('country').notNull(),
  email_domains: text('email_domains').array().notNull().default([]),
  greeting_text: text('greeting_text'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Landesverband = InferSelectModel<typeof landesverbaende>;

// Who administers which Landesverband. A super-admin (`profiles.is_admin`)
// grants/revokes rows here — an LV-admin can never create their own.
export const landesverbandAdmins = pgTable(
  'landesverband_admins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    landesverband_id: text('landesverband_id')
      .notNull()
      .references(() => landesverbaende.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    assigned_by: uuid('assigned_by').references(() => profiles.id, { onDelete: 'set null' }),
    assigned_at: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('idx_landesverband_admins_user_id').on(table.user_id),
    lvUserUnique: unique('landesverband_admins_lv_user_unique').on(
      table.landesverband_id,
      table.user_id
    ),
  })
);

export type LandesverbandAdmin = InferSelectModel<typeof landesverbandAdmins>;

// LV-scoped hide layer, layered on top of the instance-wide `admin_hidden_skills`
// (see AdminHiddenSkillsService.getEffectiveHiddenSkillMentions). Same
// hidden-≠-blocked principle: a row only affects discovery, not `@mention`
// resolution.
export const landesverbandHiddenSkills = pgTable(
  'landesverband_hidden_skills',
  {
    landesverband_id: text('landesverband_id')
      .notNull()
      .references(() => landesverbaende.id, { onDelete: 'cascade' }),
    skill_mention: text('skill_mention').notNull(),
    hidden_at: timestamp('hidden_at', { withTimezone: true }).notNull().defaultNow(),
    hidden_by: uuid('hidden_by').references(() => profiles.id, { onDelete: 'set null' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.landesverband_id, table.skill_mention] }),
    lvIdx: index('idx_landesverband_hidden_skills_lv').on(table.landesverband_id),
  })
);

export type LandesverbandHiddenSkill = InferSelectModel<typeof landesverbandHiddenSkills>;

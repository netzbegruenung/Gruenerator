import { type InferSelectModel } from 'drizzle-orm';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// Exceptions table, not an allowlist: a row means "an admin hid this Rezept
// from discovery on THIS deployment's Postgres". Empty table = every Rezept
// visible = no-op on every instance until an admin actively curates one —
// same `hidden`-≠-`blocked` principle as the instance content policy in
// packages/shared/src/instances (direct `@mention`/link still resolves,
// see resolveSkillMention — only discovery surfaces read this table).
//
// Keyed by `mention` (e.g. 'presse'), NOT `identifier`: a skill's `identifier`
// is its OWNING AGENT and is shared across multiple Rezepte (18 skills share
// 8 identifiers, see packages/chat/src/lib/mentionables.ts's
// `mentionableKey` comment) — keying on it would hide a whole agent's worth
// of Rezepte instead of the single one an admin picked. `mention` is the
// actual unique per-Rezept slug.
export const adminHiddenSkills = pgTable('admin_hidden_skills', {
  skill_mention: text('skill_mention').primaryKey(),
  hidden_at: timestamp('hidden_at', { withTimezone: true }).notNull().defaultNow(),
  hidden_by: text('hidden_by'),
});

export type AdminHiddenSkill = InferSelectModel<typeof adminHiddenSkills>;

-- Backfill retired skill mentions to their live replacements on user recipes
-- (user_text_forms.mention). Keep this VALUES list in sync with
-- LEGACY_SKILL_MENTIONS in packages/shared/src/agents/skills/index.ts — this
-- migration does not read that map, so drift here would leave a recipe
-- tagged with a mention resolveSkillMention() no longer accepts.
--
-- Guarded against the (user_id, mention) unique constraint: if a user already
-- has a row on the live mention, the old row is left in place as-is (not
-- deleted, not merged) — a "loser" row, orphaned but harmless — rather than
-- erroring the migration.
--
-- Idempotent by construction: once a row's mention is updated to the live
-- value, it no longer matches `tf.mention = m.old` on a later boot.

UPDATE user_text_forms tf SET mention = m.live
  FROM (VALUES ('presse-hessen','presse-hessen-partei'), ('presse-mv','presse-mv-partei'),
               ('presse-bayern','presse-bayern-partei'), ('presse-sachsen-anhalt','presse-sachsen-anhalt-partei'),
               ('presse-berlin','presse-berlin-partei')) AS m(old, live)
 WHERE tf.mention = m.old
   AND NOT EXISTS (SELECT 1 FROM user_text_forms x WHERE x.user_id = tf.user_id AND x.mention = m.live);

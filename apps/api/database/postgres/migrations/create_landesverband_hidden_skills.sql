-- LV-scoped hide layer for Rezepte, layered on top of the instance-wide
-- admin_hidden_skills table (see AdminHiddenSkillsService.getEffectiveHiddenSkillMentions).
-- Same hidden-≠-blocked principle as admin_hidden_skills: a row only affects
-- discovery, `resolveSkillMention` (direct @mention) stays unfiltered.
-- Keyed by skill_mention, not identifier — see admin_hidden_skills' comment
-- for why (an identifier is a shared owning agent, not a single Rezept).

CREATE TABLE IF NOT EXISTS landesverband_hidden_skills (
  landesverband_id  TEXT NOT NULL REFERENCES landesverbaende(id) ON DELETE CASCADE,
  skill_mention     TEXT NOT NULL,
  hidden_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  hidden_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (landesverband_id, skill_mention)
);

CREATE INDEX IF NOT EXISTS idx_landesverband_hidden_skills_lv ON landesverband_hidden_skills(landesverband_id);

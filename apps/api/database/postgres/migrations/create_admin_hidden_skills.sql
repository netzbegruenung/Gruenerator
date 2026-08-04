-- Admin-curated Rezepte visibility, per deployment. Each instance has its own
-- Postgres, so no instance_id column is needed here — a row written by the
-- bgst admin UI only ever exists in bgst's own database.
--
-- Exceptions table: a row means "hidden from discovery", not "allowed".
-- Empty table = every Rezept visible = no-op on every existing deployment
-- until an admin actively hides one. Direct `@mention`/link resolution stays
-- unfiltered (see resolveSkillMention) — only discovery surfaces read this.
--
-- Keyed by `mention` (e.g. 'presse'), not the skill's `identifier` — the
-- identifier is the owning agent and is shared across several Rezepte.

CREATE TABLE IF NOT EXISTS admin_hidden_skills (
  skill_mention TEXT PRIMARY KEY,
  hidden_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  hidden_by     TEXT
);

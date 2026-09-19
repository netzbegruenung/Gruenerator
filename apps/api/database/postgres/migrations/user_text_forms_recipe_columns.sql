-- Recipe metadata + sharing for user-created "Rezepte" (user_text_forms).
-- Part of "Rezepte vereinheitlichen": user recipes get the same title/
-- description/icon shell and share model as user_agents, so they can live in
-- the Agentura alongside built-in and user agents.
--
-- No `audience`/locale column here, unlike user_agents: a recipe is a style
-- block a user writes for themselves, not an agent targeted at a DE/AT
-- audience — there is no locale to fork on. Deliberate deviation from
-- user_agents, not an oversight.
--
-- share_mode/is_public/public_ownership mirror user_agents_sharing_columns.sql
-- 1:1 (see that file for the sharing model and the CHECK-via-ADD-COLUMN
-- idempotency trick: if the column already exists, the whole ADD COLUMN
-- clause — constraint included — is skipped, so this never tries to add a
-- duplicate CHECK on a second boot).
--
-- Named to sort after create_user_text_forms.sql so the ALTERs always land on
-- an existing table on a fresh database.

ALTER TABLE user_text_forms ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE user_text_forms ADD COLUMN IF NOT EXISTS icon_key TEXT;

ALTER TABLE user_text_forms ADD COLUMN IF NOT EXISTS share_mode TEXT NOT NULL DEFAULT 'private'
  CHECK (share_mode IN ('private', 'groups', 'authenticated'));

ALTER TABLE user_text_forms ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_text_forms ADD COLUMN IF NOT EXISTS public_ownership TEXT
  CHECK (public_ownership IN ('owner', 'public_data'));

CREATE INDEX IF NOT EXISTS idx_user_text_forms_public ON user_text_forms (is_public) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_text_forms_mention ON user_text_forms (mention);

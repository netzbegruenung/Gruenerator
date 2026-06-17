-- Sharing for user-created agents (Agentura).
-- Mirrors the notebook share model:
--   share_mode       : who can SEE/USE the agent (private | groups | authenticated)
--   is_public        : list the agent in the public Agentura directory, on top of
--                      share_mode='authenticated' (the agent equivalent of "Von der Basis")
--   public_ownership : legal attestation required when is_public=true ('owner' | 'public_data')
-- Group shares live in the polymorphic group_content_shares table
-- (content_type='user_agents'). Agents are USED, not co-edited — no edit_policy.
-- The existing `locale` column doubles as the audience filter for the
-- authenticated listing.
--
-- Named to sort after create_user_agents.sql so the ALTERs always land on an
-- existing table on a fresh database.

ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS share_mode TEXT NOT NULL DEFAULT 'private'
  CHECK (share_mode IN ('private', 'groups', 'authenticated'));

ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_agents ADD COLUMN IF NOT EXISTS public_ownership TEXT
  CHECK (public_ownership IN ('owner', 'public_data'));

CREATE INDEX IF NOT EXISTS idx_user_agents_public ON user_agents (is_public) WHERE is_public = TRUE;

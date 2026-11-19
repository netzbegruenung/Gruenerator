-- Published snapshot next to the draft, legal block and moderation state for
-- user_sites, plus the admin-set unlock flag on profiles.
--
-- The first UPDATE moves all but the most recently updated live site of a user
-- into the Papierkorb, so the unique index below can be created: one site per
-- user was only enforced in code, not in the database.
--
-- The second UPDATE exists because the old is_published flag never served a
-- page; a row without a snapshot must not read as published.
ALTER TABLE user_sites ADD COLUMN IF NOT EXISTS published_snapshot JSONB NULL;
ALTER TABLE user_sites ADD COLUMN IF NOT EXISTS legal JSONB NULL;
ALTER TABLE user_sites
    ADD COLUMN IF NOT EXISTS moderation TEXT NOT NULL DEFAULT 'ok'
        CHECK (moderation IN ('ok', 'hidden', 'removed'));

UPDATE user_sites s
   SET deleted_at = NOW()
 WHERE s.deleted_at IS NULL
   AND s.user_id IS NOT NULL
   AND EXISTS (
       SELECT 1 FROM user_sites n
        WHERE n.user_id = s.user_id
          AND n.deleted_at IS NULL
          AND (n.updated_at, n.id) > (s.updated_at, s.id)
   );

CREATE UNIQUE INDEX IF NOT EXISTS user_sites_one_live_per_user
    ON user_sites (user_id) WHERE deleted_at IS NULL;

UPDATE user_sites SET is_published = FALSE
 WHERE is_published = TRUE AND published_snapshot IS NULL;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sites_unlocked BOOLEAN;

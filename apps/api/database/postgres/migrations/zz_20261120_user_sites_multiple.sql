-- Several Websites per account (up to SITES_PER_ACCOUNT_MAX, enforced in code).
-- Replaces the one-live-site-per-user unique index from zz_20261119_user_sites_publishing.sql
-- with a plain index for the list and count queries.
DROP INDEX IF EXISTS user_sites_one_live_per_user;

CREATE INDEX IF NOT EXISTS idx_user_sites_user_live
    ON user_sites (user_id) WHERE deleted_at IS NULL;

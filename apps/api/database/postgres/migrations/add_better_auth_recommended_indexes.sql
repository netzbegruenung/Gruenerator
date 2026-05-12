-- Better Auth recommended indexes that were missing from the schema.
-- See https://better-auth.com/docs/guides/optimizing-for-performance#database-indexes
--
-- Already present: idx_ba_sessions_user, idx_ba_sessions_token, idx_ba_accounts_user.
-- Adding here: identifier lookup for verification flows (password reset, email verify),
-- and email lookup for account-linking / admin support flows.

CREATE INDEX IF NOT EXISTS idx_ba_verification_identifier ON ba_verification(identifier);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

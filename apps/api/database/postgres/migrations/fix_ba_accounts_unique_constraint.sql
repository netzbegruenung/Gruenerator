-- Fix Better Auth ba_accounts unique constraint
--
-- Background: add_better_auth_tables.sql declared a UNIQUE (user_id, provider_id)
-- constraint, which prevents Better Auth from linking accounts when a user's
-- OAuth identity gets a new sub (Keycloak realm migration, user re-creation,
-- IdP changes account ID format, etc).
--
-- Concrete failure observed 2026-04-12: a Keycloak user (Moritz Wächter,
-- profiles.id=a062001f-...) had an old keycloak sub stored in
-- ba_accounts.account_id=49127841-..., but Keycloak now returns
-- sub=57c31823-... for the same email. Better Auth tried to INSERT a new
-- ba_accounts row to link the new sub to the existing user, and the
-- (user_id, provider_id) UNIQUE constraint blocked the INSERT with
-- "duplicate key value violates unique constraint
-- ba_accounts_user_id_provider_id_key".
--
-- The correct unique constraint per Better Auth's data model is
-- (account_id, provider_id) — preventing the same OAuth identity from being
-- claimed by two users, but allowing the same user to accumulate multiple
-- historical OAuth identities at the same provider (the old rows become
-- silent dead data; Better Auth queries by accountId so they're never read).
--
-- Transaction is managed by the migration runner — do not add BEGIN/COMMIT.

-- Drop both possible names of the wrong constraint (Postgres autogenerates
-- one when defined inline via UNIQUE(...); the other was added explicitly
-- in the second part of add_better_auth_tables.sql).
ALTER TABLE ba_accounts DROP CONSTRAINT IF EXISTS ba_accounts_user_id_provider_id_key;
ALTER TABLE ba_accounts DROP CONSTRAINT IF EXISTS ba_accounts_user_provider_unique;

-- Add the correct unique constraint matching Better Auth's expectations.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ba_accounts_account_provider_unique'
    ) THEN
        ALTER TABLE ba_accounts
            ADD CONSTRAINT ba_accounts_account_provider_unique UNIQUE (account_id, provider_id);
    END IF;
END $$;

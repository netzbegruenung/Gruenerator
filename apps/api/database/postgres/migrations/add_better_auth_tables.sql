-- Better Auth Migration
-- Adds tables required by Better Auth (sessions, accounts, verification)
-- and missing columns on profiles (created_at, email_verified)

-- Transaction is managed by the migration runner — do not add BEGIN/COMMIT here.

-- Add missing columns required by Better Auth
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

-- Backfill created_at from updated_at for existing rows
UPDATE profiles SET created_at = COALESCE(updated_at, CURRENT_TIMESTAMP) WHERE created_at IS NULL;

-- Better Auth session table
CREATE TABLE IF NOT EXISTS ba_sessions (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    push_token TEXT,
    device_name TEXT,
    device_type TEXT DEFAULT 'web',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ba_sessions_user ON ba_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ba_sessions_token ON ba_sessions(token);
CREATE INDEX IF NOT EXISTS idx_ba_sessions_push ON ba_sessions(user_id) WHERE push_token IS NOT NULL;

-- Better Auth account table (links OAuth providers to users)
CREATE TABLE IF NOT EXISTS ba_accounts (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    access_token_expires_at TIMESTAMPTZ,
    scope TEXT,
    id_token TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_ba_accounts_user ON ba_accounts(user_id);

-- Ensure unique constraint exists (safe if table was created with it or if added later)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ba_accounts_user_provider_unique'
    ) THEN
        ALTER TABLE ba_accounts ADD CONSTRAINT ba_accounts_user_provider_unique UNIQUE (user_id, provider_id);
    END IF;
END $$;

-- Better Auth verification table
CREATE TABLE IF NOT EXISTS ba_verification (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Backfill ba_accounts from existing profiles (one account per user with keycloak_id)
INSERT INTO ba_accounts (id, user_id, account_id, provider_id, created_at, updated_at)
SELECT
    gen_random_uuid()::TEXT,
    id,
    keycloak_id,
    CASE auth_source
        WHEN 'netzbegruenung-login' THEN 'keycloak-netzbegruenung'
        WHEN 'gruenes-netz-login' THEN 'keycloak-gruenes-netz'
        WHEN 'gruene-oesterreich-login' THEN 'keycloak-gruene-at'
        WHEN 'gruenerator-login' THEN 'keycloak-gruenerator'
        ELSE 'keycloak-gruenerator'
    END,
    COALESCE(updated_at, CURRENT_TIMESTAMP),
    COALESCE(updated_at, CURRENT_TIMESTAMP)
FROM profiles
WHERE keycloak_id IS NOT NULL
ON CONFLICT (user_id, provider_id) DO NOTHING;

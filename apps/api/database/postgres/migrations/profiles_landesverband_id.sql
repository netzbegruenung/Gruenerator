-- Derived server-side from user_defaults.profile.roles[].bundesland (see
-- LandesverbandDerivationService) — never written directly by the client.
-- No source flag (auto/manual): there is currently only one derivation path.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS landesverband_id TEXT
    REFERENCES landesverbaende(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_landesverband_id ON profiles(landesverband_id);

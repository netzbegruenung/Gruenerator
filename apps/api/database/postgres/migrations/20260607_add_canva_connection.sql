-- Direct Canva Connect API integration (OAuth2 + PKCE, no Nango).
-- Stores a single per-user Canva connection (encrypted tokens + metadata) as JSONB.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS canva_connection JSONB DEFAULT NULL;

-- better-auth 1.7 requires the jwt() plugin alongside @better-auth/mcp: it holds
-- the signing key for ID tokens and access tokens and serves /jwks, which is how
-- resource servers verify tokens from 1.7 on (the opaque-token + getMcpSession
-- lookup is gone). Created ahead of the upgrade so the cutover is code-only.
--
-- Column set mirrors the jwt plugin's declared schema in better-auth 1.7.1
-- (publicKey, privateKey, createdAt, expiresAt, alg, crv). Export key `jwks` in
-- the Drizzle schema must stay the plugin's model name; the SQL identifier
-- follows the ba_ convention.
--
-- Safe under 1.6.x: the table is unused until jwt() is registered.

CREATE TABLE IF NOT EXISTS ba_jwks (
  id          TEXT PRIMARY KEY,
  public_key  TEXT NOT NULL,
  private_key TEXT NOT NULL,
  alg         TEXT,
  crv         TEXT,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

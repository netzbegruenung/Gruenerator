-- app_push_devices: decouples Expo push registration from auth tokens.
--
-- Before this migration, the push_token column lived on app_refresh_tokens,
-- so a device's push identity was tied to its custom HS256 refresh token.
-- After the move to Better Auth sessions (PR #657), new installs no longer
-- have a refresh_token row, and registerPushToken() silently bailed. This
-- table owns device registration independently of session identity.

CREATE TABLE IF NOT EXISTS app_push_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  expo_push_token TEXT NOT NULL,
  device_name TEXT,
  device_type TEXT NOT NULL DEFAULT 'unknown',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_push_devices_user_token_unique UNIQUE (user_id, expo_push_token)
);

CREATE INDEX IF NOT EXISTS idx_app_push_devices_user ON app_push_devices (user_id);

-- Backfill from legacy app_refresh_tokens.push_token so pre-#657 devices
-- keep receiving notifications through the new service layer. Skip rows
-- whose refresh token is revoked or expired — those sessions are already
-- dead, and pushing to their devices would just fail at Expo.
INSERT INTO app_push_devices (user_id, expo_push_token, device_name, device_type, last_seen_at, created_at)
SELECT
  user_id,
  push_token,
  device_name,
  device_type,
  COALESCE(last_used_at, push_token_updated_at, issued_at),
  COALESCE(push_token_updated_at, issued_at)
FROM app_refresh_tokens
WHERE push_token IS NOT NULL
  AND revoked_at IS NULL
  AND expires_at > now()
ON CONFLICT (user_id, expo_push_token) DO NOTHING;

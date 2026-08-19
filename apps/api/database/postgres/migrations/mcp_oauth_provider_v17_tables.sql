-- better-auth 1.7: `@better-auth/oauth-provider` (via `@better-auth/mcp`) ersetzt
-- die drei 1.6-Tabellen durch sieben Modelle. Drizzle-Schema:
-- database/schema/oauthProvider.ts
--
-- Dateiname sortiert bewusst NACH mcp_oauth_provider_tables.sql — der Runner
-- ordnet alphabetisch, und diese Migration baut auf jenen Tabellen auf.
--
-- Die 1.6-Tabellen werden nach `_v16` umbenannt statt gelöscht: 1.7 speichert
-- Client-Secrets und Refresh-Token als base64url(SHA-256), die Umrechnung ist
-- einweg. Solange die Originale danebenliegen, ist der Schritt zurücknehmbar.
-- Eine spätere Contract-Migration räumt sie weg.

-- Zwei der drei Namen belegt 1.7 selbst wieder. Die Umbenennung hängt deshalb
-- an einer Spalte, die es nur in der 1.6-Fassung gibt — sonst benennt ein
-- zweiter Lauf die eben angelegte neue Tabelle in `_v16` um.
-- Index- und Constraint-Namen leben schemaweit, nicht pro Tabelle: die alten
-- müssen ihre Namen räumen, bevor die neuen Tabellen sie beanspruchen.
ALTER TABLE IF EXISTS ba_oauth_applications RENAME TO ba_oauth_applications_v16;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'ba_oauth_access_tokens'
      AND column_name = 'access_token'
  ) THEN
    ALTER TABLE ba_oauth_access_tokens RENAME TO ba_oauth_access_tokens_v16;
    ALTER INDEX IF EXISTS ba_oauth_access_tokens_pkey RENAME TO ba_oauth_access_tokens_v16_pkey;
    ALTER INDEX IF EXISTS idx_ba_oauth_access_tokens_user RENAME TO idx_ba_oauth_access_tokens_v16_user;
    ALTER INDEX IF EXISTS idx_ba_oauth_access_tokens_client RENAME TO idx_ba_oauth_access_tokens_v16_client;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'ba_oauth_consents'
      AND column_name = 'consent_given'
  ) THEN
    ALTER TABLE ba_oauth_consents RENAME TO ba_oauth_consents_v16;
    ALTER INDEX IF EXISTS ba_oauth_consents_pkey RENAME TO ba_oauth_consents_v16_pkey;
    ALTER INDEX IF EXISTS idx_ba_oauth_consents_user RENAME TO idx_ba_oauth_consents_v16_user;
    ALTER INDEX IF EXISTS idx_ba_oauth_consents_client RENAME TO idx_ba_oauth_consents_v16_client;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ba_oauth_clients (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  client_id TEXT NOT NULL UNIQUE,
  client_secret TEXT,
  client_discovery_id TEXT,
  disabled BOOLEAN DEFAULT FALSE,
  skip_consent BOOLEAN,
  enable_end_session BOOLEAN,
  subject_type TEXT,
  scopes TEXT[],
  client_credentials_scopes TEXT[],
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name TEXT,
  uri TEXT,
  icon TEXT,
  contacts TEXT[],
  tos TEXT,
  policy TEXT,
  software_id TEXT,
  software_version TEXT,
  software_statement TEXT,
  redirect_uris TEXT[] NOT NULL,
  post_logout_redirect_uris TEXT[],
  backchannel_logout_uri TEXT,
  backchannel_logout_session_required BOOLEAN,
  token_endpoint_auth_method TEXT,
  application_type TEXT,
  jwks TEXT,
  jwks_uri TEXT,
  grant_types TEXT[],
  response_types TEXT[],
  require_pkce BOOLEAN,
  dpop_bound_access_tokens BOOLEAN DEFAULT FALSE,
  reference_id TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_ba_oauth_clients_user ON ba_oauth_clients(user_id);
CREATE INDEX IF NOT EXISTS idx_ba_oauth_clients_discovery ON ba_oauth_clients(client_discovery_id);

CREATE TABLE IF NOT EXISTS ba_oauth_resources (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  identifier TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  access_token_ttl INTEGER,
  refresh_token_ttl INTEGER,
  signing_algorithm TEXT,
  signing_key_id TEXT,
  allowed_scopes TEXT[],
  custom_claims JSONB,
  dpop_bound_access_tokens_required BOOLEAN DEFAULT FALSE,
  disabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  policy_version INTEGER DEFAULT 1,
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS ba_oauth_client_resources (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  client_id TEXT NOT NULL REFERENCES ba_oauth_clients(client_id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL REFERENCES ba_oauth_resources(identifier) ON DELETE CASCADE,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ba_oauth_client_resources_pair_unique UNIQUE (client_id, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_ba_oauth_client_resources_client ON ba_oauth_client_resources(client_id);
CREATE INDEX IF NOT EXISTS idx_ba_oauth_client_resources_resource ON ba_oauth_client_resources(resource_id);

CREATE TABLE IF NOT EXISTS ba_oauth_refresh_tokens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  token TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL REFERENCES ba_oauth_clients(client_id) ON DELETE CASCADE,
  session_id TEXT REFERENCES ba_sessions(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reference_id TEXT,
  authorization_code_id TEXT,
  resources TEXT[],
  requested_user_info_claims TEXT[],
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked TIMESTAMPTZ,
  rotated_at TIMESTAMPTZ,
  rotation_replay_response TEXT,
  rotation_replay_expires_at TIMESTAMPTZ,
  auth_time TIMESTAMPTZ,
  confirmation JSONB,
  scopes TEXT[] NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ba_oauth_refresh_tokens_client ON ba_oauth_refresh_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_ba_oauth_refresh_tokens_session ON ba_oauth_refresh_tokens(session_id);
CREATE INDEX IF NOT EXISTS idx_ba_oauth_refresh_tokens_user ON ba_oauth_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_ba_oauth_refresh_tokens_code ON ba_oauth_refresh_tokens(authorization_code_id);

CREATE TABLE IF NOT EXISTS ba_oauth_access_tokens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  token TEXT UNIQUE,
  client_id TEXT NOT NULL REFERENCES ba_oauth_clients(client_id) ON DELETE CASCADE,
  session_id TEXT REFERENCES ba_sessions(id) ON DELETE SET NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  reference_id TEXT,
  authorization_code_id TEXT,
  resources TEXT[],
  requested_user_info_claims TEXT[],
  refresh_id TEXT REFERENCES ba_oauth_refresh_tokens(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked TIMESTAMPTZ,
  confirmation JSONB,
  scopes TEXT[] NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ba_oauth_access_tokens_client ON ba_oauth_access_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_ba_oauth_access_tokens_session ON ba_oauth_access_tokens(session_id);
CREATE INDEX IF NOT EXISTS idx_ba_oauth_access_tokens_user ON ba_oauth_access_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_ba_oauth_access_tokens_code ON ba_oauth_access_tokens(authorization_code_id);
CREATE INDEX IF NOT EXISTS idx_ba_oauth_access_tokens_refresh ON ba_oauth_access_tokens(refresh_id);

CREATE TABLE IF NOT EXISTS ba_oauth_consents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  client_id TEXT NOT NULL REFERENCES ba_oauth_clients(client_id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  reference_id TEXT,
  resources TEXT[],
  requested_user_info_claims TEXT[],
  scopes TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ba_oauth_consents_client ON ba_oauth_consents(client_id);
CREATE INDEX IF NOT EXISTS idx_ba_oauth_consents_user ON ba_oauth_consents(user_id);

CREATE TABLE IF NOT EXISTS ba_oauth_client_assertions (
  id TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);

-- ---------------------------------------------------------------------------
-- Datenübernahme
-- ---------------------------------------------------------------------------

-- Clients. `type` ('web'|'public') zerfällt in application_type und
-- token_endpoint_auth_method. 1.7 verlangt, dass die registrierte Methode
-- exakt der entspricht, die der Client benutzt (null hieße
-- 'client_secret_basic'); 1.6 nahm beide an. Wir setzen 'client_secret_post',
-- weil das die Methode ist, die unser eigener MCP-Client registriert
-- (services/mcp/McpOAuthService.ts) und die MCP-Clients in der Praxis senden.
-- grant_types/response_types schreibt der Upgrade-Guide ausdrücklich fest
-- ("register each client's grant_types explicitly, or the token endpoint
-- rejects them with unauthorized_client") und verlangt sie reziprok: code
-- verlangt authorization_code. Ohne sie fiele das Plugin zwar auf denselben
-- Wert zurück, aber nur solange keine Resource-Prüfung dazwischenkommt.
-- scopes bleibt NULL — das heißt "keine Einschränkung" und ist das
-- 1.6-Verhalten; eine leere Liste hieße "gar nichts erlaubt".
INSERT INTO ba_oauth_clients (
  id, client_id, client_secret, disabled, user_id, created_at, updated_at,
  name, icon, metadata, redirect_uris, token_endpoint_auth_method,
  application_type, grant_types, response_types, client_credentials_scopes
)
SELECT
  a.id,
  a.client_id,
  CASE
    WHEN a.type = 'public' OR a.client_secret IS NULL OR a.client_secret = '' THEN NULL
    ELSE rtrim(translate(encode(sha256(convert_to(a.client_secret, 'UTF8')), 'base64'), '+/', '-_'), '=')
  END,
  COALESCE(a.disabled, FALSE),
  a.user_id,
  a.created_at,
  a.updated_at,
  a.name,
  a.icon,
  CASE WHEN a.metadata ~ '^\s*[\[{]' THEN a.metadata::JSONB ELSE NULL END,
  ARRAY(SELECT u FROM unnest(string_to_array(a.redirect_urls, ',')) AS u WHERE u <> ''),
  CASE
    WHEN a.type = 'public' OR a.client_secret IS NULL OR a.client_secret = '' THEN 'none'
    ELSE 'client_secret_post'
  END,
  'web',
  ARRAY['authorization_code', 'refresh_token'],
  ARRAY['code'],
  ARRAY[]::TEXT[]
FROM ba_oauth_applications_v16 a
ON CONFLICT DO NOTHING;

-- Refresh-Token. In 1.6 lagen sie in derselben Zeile wie der Access-Token und
-- im Klartext; 1.7 hat eine eigene Tabelle und hasht. Abgelaufene und
-- benutzerlose Zeilen bleiben liegen — die neue Tabelle verlangt user_id.
INSERT INTO ba_oauth_refresh_tokens (
  id, token, client_id, user_id, expires_at, created_at, scopes
)
SELECT
  t.id,
  rtrim(translate(encode(sha256(convert_to(t.refresh_token, 'UTF8')), 'base64'), '+/', '-_'), '='),
  t.client_id,
  t.user_id,
  t.refresh_token_expires_at,
  t.created_at,
  ARRAY(SELECT s FROM unnest(string_to_array(t.scopes, ' ')) AS s WHERE s <> '')
FROM ba_oauth_access_tokens_v16 t
WHERE t.user_id IS NOT NULL
  AND t.refresh_token_expires_at > NOW()
  AND EXISTS (SELECT 1 FROM ba_oauth_clients c WHERE c.client_id = t.client_id)
ON CONFLICT DO NOTHING;

-- Access-Token werden NICHT übernommen: sie leben eine Stunde, waren beim
-- Stichprobenlauf auf Test wie Prod ausnahmslos abgelaufen, und mit aktivem
-- jwt()-Plugin sind neue Access-Token JWTs, die gar keine Zeile mehr anlegen.

-- Einwilligungen. `consent_given` gibt es nicht mehr; ein abgelehntes Consent
-- ist in 1.7 schlicht eine fehlende Zeile.
INSERT INTO ba_oauth_consents (
  id, client_id, user_id, scopes, created_at, updated_at
)
SELECT
  c.id,
  c.client_id,
  c.user_id,
  ARRAY(SELECT s FROM unnest(string_to_array(c.scopes, ' ')) AS s WHERE s <> ''),
  c.created_at,
  c.updated_at
FROM ba_oauth_consents_v16 c
WHERE c.consent_given = TRUE
  AND EXISTS (SELECT 1 FROM ba_oauth_clients cl WHERE cl.client_id = c.client_id)
ON CONFLICT DO NOTHING;

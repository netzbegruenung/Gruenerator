-- push_devices: Geräte, die App-Push bekommen (direkt über APNs/FCM, ohne Expo).
--
-- Eine Zeile entsteht nur nach ausdrücklichem Opt-in in der App. `key` ist der
-- 32-Byte-Schlüssel, den das Gerät selbst erzeugt hat: jeder Push wird damit
-- AES-256-GCM-verschlüsselt, Apple und Google sehen nur Chiffretext.
--
-- Ein Gerät bekommt Push nur, solange die Sitzung lebt, die es registriert hat:
-- `session_id` hängt per ON DELETE CASCADE an `ba_sessions` (Abmelden, Widerruf,
-- Kontolöschung räumen die Zeile mit ab), der Versand prüft zusätzlich
-- `expires_at`. NULL nur bei Registrierungen über den Dev-Auth-Bypass, der keine
-- Sitzungszeile hat — in Produktion ist der Bypass gesperrt.
--
-- Bewusst NICHT in schema.sql: `ba_sessions` entsteht erst in einer Migration
-- (add_better_auth_tables.sql, läuft lexikographisch vor dieser Datei).
-- Kein Papierkorb: die Zeile ist kein Inhalt.
CREATE TABLE IF NOT EXISTS push_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    session_id TEXT REFERENCES ba_sessions(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    token TEXT NOT NULL UNIQUE,
    key BYTEA NOT NULL CHECK (octet_length(key) = 32),
    apns_environment TEXT CHECK (apns_environment IN ('production', 'sandbox')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((platform = 'ios') = (apns_environment IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_push_devices_user ON push_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_push_devices_session ON push_devices(session_id) WHERE session_id IS NOT NULL;

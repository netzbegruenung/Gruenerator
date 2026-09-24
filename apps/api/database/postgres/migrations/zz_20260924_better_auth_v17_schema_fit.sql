-- better-auth 1.7.3+ prüft beim Start, ob jede Spalte seiner Modelle in der
-- Datenbank steht, und weist Auth-Anfragen ab, solange eine fehlt. 1.6 hat beide
-- Account-Felder still verworfen; sie fehlten hier seit jeher.
--
-- `password` bleibt bei uns leer — es gibt keine Anmeldung per Passwort —, ist
-- aber Teil des Kernmodells. Beide Spalten nullable, also unter 1.6 folgenlos.
ALTER TABLE ba_accounts ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMPTZ;
ALTER TABLE ba_accounts ADD COLUMN IF NOT EXISTS password TEXT;

-- Mit `database.generateId: false` vergibt die Datenbank die IDs. Jede andere
-- ba_-Tabelle hat dafür einen Default; ba_jwks nicht, und der erste
-- Schlüssel, den `jwt()` anlegt, scheiterte an `id` NOT NULL — /jwks antwortete
-- mit 500, jedes Access-Token wäre unprüfbar gewesen.
ALTER TABLE ba_jwks ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

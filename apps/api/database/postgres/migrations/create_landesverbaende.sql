-- Landesverband as a runtime-editable tenant: one row per deutsches
-- Bundesland (DE) bzw. österreichische Landesorganisation (AT). `id` is the
-- slugified name (see slugifyName in packages/shared/src/utils/slug.ts) —
-- the same function LandesverbandDerivationService uses to translate
-- profiles.user_defaults.profile.roles[].bundesland labels into this id, so
-- both sides must stay in sync.
--
-- email_domains is only a verification SIGNAL surfaced in the admin UI
-- ("E-Mail nicht verifiziert") — it never determines the landesverband_id
-- assignment itself, which is derived from the user's self-reported role.
-- Left empty here on purpose: guessing domains would silently mis-flag real
-- members. A Hauptgrünerator-Super-Admin fills them in via the
-- lvAdminAssignmentContract after rollout.

CREATE TABLE IF NOT EXISTS landesverbaende (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  country       TEXT NOT NULL CHECK (country IN ('DE', 'AT')),
  email_domains TEXT[] NOT NULL DEFAULT '{}',
  greeting_text TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO landesverbaende (id, name, country) VALUES
  ('baden-wuerttemberg', 'Baden-Württemberg', 'DE'),
  ('bayern', 'Bayern', 'DE'),
  ('berlin', 'Berlin', 'DE'),
  ('brandenburg', 'Brandenburg', 'DE'),
  ('bremen', 'Bremen', 'DE'),
  ('hamburg', 'Hamburg', 'DE'),
  ('hessen', 'Hessen', 'DE'),
  ('mecklenburg-vorpommern', 'Mecklenburg-Vorpommern', 'DE'),
  ('niedersachsen', 'Niedersachsen', 'DE'),
  ('nordrhein-westfalen', 'Nordrhein-Westfalen', 'DE'),
  ('rheinland-pfalz', 'Rheinland-Pfalz', 'DE'),
  ('saarland', 'Saarland', 'DE'),
  ('sachsen', 'Sachsen', 'DE'),
  ('sachsen-anhalt', 'Sachsen-Anhalt', 'DE'),
  ('schleswig-holstein', 'Schleswig-Holstein', 'DE'),
  ('thueringen', 'Thüringen', 'DE'),
  ('wien', 'Wien', 'AT'),
  ('niederoesterreich', 'Niederösterreich', 'AT'),
  ('oberoesterreich', 'Oberösterreich', 'AT'),
  ('steiermark', 'Steiermark', 'AT'),
  ('kaernten', 'Kärnten', 'AT'),
  ('salzburg', 'Salzburg', 'AT'),
  ('tirol', 'Tirol', 'AT'),
  ('vorarlberg', 'Vorarlberg', 'AT'),
  ('burgenland', 'Burgenland', 'AT')
ON CONFLICT (id) DO NOTHING;

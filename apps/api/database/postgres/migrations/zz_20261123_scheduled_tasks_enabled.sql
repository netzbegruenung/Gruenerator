-- „Geplante Aufgaben" (wiederkehrende Aufgaben) ist experimentell und pro Person
-- abschaltbar: `profiles.scheduled_tasks_enabled`, Standard aus. Wer bereits
-- Aufgaben hat, bekommt den Schalter einmalig an — sonst verschwänden deren
-- Kacheln und der Chat-Weg, obwohl die Aufgaben weiterlaufen. Bestehende Aufgaben
-- werden nie angefasst.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS scheduled_tasks_enabled BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE profiles SET scheduled_tasks_enabled = TRUE
WHERE id IN (SELECT user_id FROM recurring_tasks);

-- Wiederkehrende Aufgaben im Projekt (#5939): Anweisungen, Dateien, Notebooks und
-- Rezepte des Projekts gelten im Lauf wie in einem Projekt-Chat. Wird das Projekt
-- gelöscht, läuft die Aufgabe ohne Projekt weiter.
ALTER TABLE recurring_tasks
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recurring_tasks_group
  ON recurring_tasks (group_id) WHERE group_id IS NOT NULL;

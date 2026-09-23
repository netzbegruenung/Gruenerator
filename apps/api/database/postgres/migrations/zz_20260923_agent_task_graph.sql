-- #3549: Aufgaben-Graph für den Board-Agenten. Zerlegt ein Lauf eine Aufgabe in
-- Karten und soll sie auch selbst erledigen, bekommt jede Karte ihre eigene
-- agent_tasks-Zeile mit parent_task_id auf den zerlegenden Lauf. Eine Kante in
-- agent_task_dependencies heisst: task_id startet erst, wenn depends_on_task_id
-- fertig ist (completed oder awaiting_review); scheitert der Vorgänger
-- endgültig, scheitert der Nachfolger mit. Rein additiv.
ALTER TABLE agent_tasks
  ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES agent_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_tasks_parent
  ON agent_tasks (parent_task_id) WHERE parent_task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_task_dependencies (
  task_id UUID NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);

-- The failure cascade looks edges up from the predecessor's side.
CREATE INDEX IF NOT EXISTS idx_agent_task_dependencies_depends_on
  ON agent_task_dependencies (depends_on_task_id);

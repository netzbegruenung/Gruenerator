-- #3221: Ein Hintergrundlauf hinterlässt eine Spur, bevor er losläuft.
--
-- Bisher entstand die Zeile in `recurring_task_runs` erst, wenn der Lauf fertig
-- war. Stirbt der Prozess mittendrin (OOM, Redeploy), gibt es den Lauf nie
-- gegeben — und weil der Claim `next_run_at` schon vorgerückt hat, ist die
-- Ausführung still verloren, bis der Zeitplan das nächste Mal greift.
--
-- Der Claim schreibt die Zeile jetzt als 'running' mit `started_at`; der Runner
-- schliesst sie per UPDATE ab. Ein Wächter am Anfang jedes Ticks räumt
-- 'running'-Zeilen mit abgelaufener Frist auf. Der partielle Unique-Index ist
-- die Sperre dagegen, dass ein Handlauf einen laufenden Worker-Lauf derselben
-- Aufgabe überlappt.
--
-- Rein additiv: bestehende Zeilen behalten ihren Endstatus, `started_at` und
-- `finished_at` bleiben dort NULL.
ALTER TABLE recurring_task_runs
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

-- Der CHECK zählt die Endzustände auf; 'running' muss dazu.
ALTER TABLE recurring_task_runs DROP CONSTRAINT IF EXISTS recurring_task_runs_status_check;
ALTER TABLE recurring_task_runs ADD CONSTRAINT recurring_task_runs_status_check
  CHECK (status IN ('running', 'completed', 'empty', 'failed'));

-- Höchstens ein laufender Lauf je Aufgabe. Partiell, damit die abgeschlossenen
-- Läufe (beliebig viele je Aufgabe) davon unberührt bleiben.
CREATE UNIQUE INDEX IF NOT EXISTS uq_recurring_task_runs_one_running
  ON recurring_task_runs (task_id) WHERE status = 'running';

-- Der Wächter sucht genau danach.
CREATE INDEX IF NOT EXISTS idx_recurring_task_runs_running
  ON recurring_task_runs (status, started_at);

-- #3221: Verdikt der Ergebnis-Prüfung je Board-Agent-Lauf, wie
-- recurring_task_runs.verdict. {ok, hint?, repaired?} aus der
-- background_verify-Lane. Ein nach der Reparatur noch beanstandetes Ergebnis
-- wird einem Menschen zur Prüfung vorgelegt; der Hinweis steht hier.
-- Rein additiv, NULL bei alten und ungeprüften Läufen.
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS verdict JSONB;

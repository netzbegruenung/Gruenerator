-- #3221 Face 2: Verdikt der Ergebnis-Prüfung je Hintergrundlauf.
-- {ok, hint?, repaired?} aus der background_verify-Lane — Messwert, kein Gate:
-- geliefert wird unabhängig davon, die Spalte macht False-Negative-Raten
-- messbar, bevor je jemand gated. Rein additiv, NULL bei alten Läufen.
ALTER TABLE recurring_task_runs ADD COLUMN IF NOT EXISTS verdict JSONB;

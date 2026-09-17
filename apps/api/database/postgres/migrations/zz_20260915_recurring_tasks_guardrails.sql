-- #3221: Eine kaputte Aufgabe hört irgendwann von selbst auf.
--
-- `consecutive_empty_count` gab es schon, wurde aber nie ausgewertet. Dazu
-- kommt der Zähler für Fehlschläge in Folge: nach dreien pausiert die Aufgabe
-- sich selbst, statt bis in alle Ewigkeit im selben Fehler zu laufen und
-- jedesmal Modellzeit zu kosten.
--
-- `paused_reason` unterscheidet „von Hand pausiert" (NULL) von „automatisch
-- abgeschaltet" — nur so kann die Oberfläche erklären, warum eine Aufgabe
-- stillsteht. Rein additiv.
ALTER TABLE recurring_tasks
  ADD COLUMN IF NOT EXISTS consecutive_failure_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paused_reason TEXT;

-- Werkzeug-Stufen: "Aus" neben "Immer erlauben".
--
-- chat_tool_approvals kannte nur die dauerhafte Freigabe. Eine Person, die ein
-- Werkzeug eines verbundenen Servers gar nicht will, konnte es nicht
-- abschalten — es stand bei jedem Zug im Prompt. `decision` traegt jetzt beide
-- bewussten Entscheidungen; die Tabelle bleibt sparse: KEINE Zeile heisst
-- weiterhin "fragen". Bestehende Zeilen sind Freigaben, daher der Default.
--
-- 'deny' haelt das Werkzeug aus dem Katalog (mcpCatalog), nicht nur vom
-- Aufruf fern: eine Werkzeug-Beschreibung ist eine Anweisung ans Modell.

ALTER TABLE chat_tool_approvals
  ADD COLUMN IF NOT EXISTS decision TEXT NOT NULL DEFAULT 'allow';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_tool_approvals_decision_check'
  ) THEN
    ALTER TABLE chat_tool_approvals
      ADD CONSTRAINT chat_tool_approvals_decision_check CHECK (decision IN ('allow', 'deny'));
  END IF;
END $$;

-- Dauerhafte Werkzeug-Freigaben im Chat ("immer erlauben").
-- Sparse: eine fehlende Zeile bedeutet "fragen". scope_key ist freies TEXT
-- (mcp:<serverId>/<tool> | managed:<key>/<tool> | internal/<tool>), damit ein
-- getrennter Server eine tote Zeile hinterlaesst statt eines Fehlers.
-- Runtime verbindet als `gruenerator`, deshalb gehoert die Tabelle dieser Rolle.

CREATE TABLE IF NOT EXISTS chat_tool_approvals (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scope_key TEXT NOT NULL,
  tool_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, scope_key)
);

ALTER TABLE chat_tool_approvals OWNER TO gruenerator;

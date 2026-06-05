-- State election results for the Grünerator Monitor "Bundesländer" tab.
-- Latest Landtagswahl per Bundesland, vote-weighted to state level from GERDA.
-- 16 static rows, refreshed by scripts/seed-gerda-state-elections.ts.

CREATE TABLE IF NOT EXISTS monitor_state_elections (
  state_code TEXT PRIMARY KEY,
  state_name TEXT NOT NULL,
  polit_pro_id TEXT NOT NULL,
  short TEXT NOT NULL,
  election_year INT NOT NULL,
  election_date TEXT,
  turnout DOUBLE PRECISION,
  results JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Monthly corpus-derived "current insights" snapshots per Öffentlichkeitsarbeit (PR) agent.
-- Refreshed by a scheduled job on the 1st of each month (cron → internal endpoint).
-- The hand-tuned `systemRole` in code stays untouched; at chat time the ChatGraph
-- respond node injects the latest `status='active'` row as an additive, subordinate
-- block (like the LÄNDERKONTEXT seam) — so the PR agents track current themes,
-- active speakers and style without a code change/PR.
--
-- Fully automatic: there is no human review gate, so server-side validation is the
-- quality gate. A snapshot that fails validation (hallucinated speakers, no evidence,
-- too small a sample) is stored as `status='rejected'`; the reader then falls back to
-- the most recent `active` month — or to no overlay at all (pristine systemRole).

CREATE TABLE IF NOT EXISTS pr_agent_insight_snapshots (
  agent_identifier TEXT NOT NULL,             -- e.g. 'gruenerator-oeffentlichkeitsarbeit-berlin'
  month TEXT NOT NULL,                        -- 'YYYY-MM'
  insights_block TEXT NOT NULL DEFAULT '',    -- assembled DE markdown (themes/speakers/style), capped
  few_shot_examples JSONB NOT NULL DEFAULT '[]', -- [{input, output, reasoning}] from real recent posts
  themes JSONB NOT NULL DEFAULT '[]',         -- [{theme, gloss, evidence_quote}] (validated)
  speakers JSONB NOT NULL DEFAULT '[]',       -- [{name, role}] (validated against corpus)
  status TEXT NOT NULL DEFAULT 'active',      -- 'active' | 'rejected' (validation / kill-switch)
  source_collection TEXT,                     -- which Qdrant collection(s) were sampled
  sample_size INT NOT NULL DEFAULT 0,
  model TEXT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_identifier, month)
);

CREATE INDEX IF NOT EXISTS idx_pr_agent_insights_agent_month
  ON pr_agent_insight_snapshots(agent_identifier, month DESC);

-- Chat-edit version history for canvas documents (sharepic editing in chat).
-- One row per applied chat edit (plus the mint snapshot); `state` is the full
-- flat config-prop state so the chat card can render any version directly.
-- Retention (keep newest 20 per canvas) is enforced by the version repository
-- on insert. Yjs remains the live authority; these are renderable snapshots.

CREATE TABLE IF NOT EXISTS canvas_state_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID NOT NULL REFERENCES collaborative_documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  state JSONB NOT NULL,
  summary TEXT,
  origin TEXT NOT NULL DEFAULT 'chat-edit' CHECK (origin IN ('mint', 'chat-edit', 'restore')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT canvas_state_versions_unique UNIQUE (canvas_id, version)
);

CREATE INDEX IF NOT EXISTS idx_canvas_state_versions_canvas
  ON canvas_state_versions (canvas_id, version DESC);

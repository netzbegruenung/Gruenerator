-- Multi-format canvas editor: persist the chosen output format on each canvas
-- document. Existing rows default to 'post-portrait' (the legacy sharepic 1080×1350).
-- See packages/canvas-editor/src/formats/index.ts for the canonical format registry.

ALTER TABLE canvas_documents
    ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'post-portrait';

CREATE INDEX IF NOT EXISTS idx_canvas_documents_format
    ON canvas_documents(format);

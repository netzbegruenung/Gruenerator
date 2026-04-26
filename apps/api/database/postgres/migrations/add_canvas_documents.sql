-- Add canvas documents as a new subtype of collaborative_documents.
-- ACL/Yjs/sharing all reuse the existing collaborative_documents pipeline
-- (document_subtype='canvas'); only canvas-specific columns live in the
-- 1:1 sidecar canvas_documents table.

CREATE TABLE IF NOT EXISTS canvas_documents (
    document_id UUID PRIMARY KEY REFERENCES collaborative_documents(id) ON DELETE CASCADE,
    template_type TEXT NOT NULL,
    base_template_id TEXT,
    thumbnail_url TEXT,
    page_count INTEGER NOT NULL DEFAULT 1,
    initial_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_canvas_documents_template_type
    ON canvas_documents(template_type);

CREATE TRIGGER update_canvas_documents_updated_at
    BEFORE UPDATE ON canvas_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

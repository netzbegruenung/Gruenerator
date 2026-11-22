-- Bookkeeping for the Qdrant index of collaborative documents (project search).
-- A side table, not columns on collaborative_documents: that table has an
-- updated_at trigger, so writing the index state there would look like an edit
-- and re-queue the document forever.
CREATE TABLE IF NOT EXISTS collab_search_index (
    document_id UUID PRIMARY KEY REFERENCES collaborative_documents(id) ON DELETE CASCADE,
    content_hash TEXT NOT NULL,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    -- When the text was last read and compared. A document is due again once
    -- collaborative_documents.updated_at is newer than this.
    checked_at TIMESTAMPTZ NOT NULL,
    indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

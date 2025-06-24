-- Migration: Create document_daily_versions table for simple daily version history
-- This table stores one version snapshot per day per document

CREATE TABLE IF NOT EXISTS document_daily_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES collaborative_documents(id) ON DELETE CASCADE,
  version_date DATE NOT NULL,
  snapshot_data BYTEA NOT NULL, -- Compressed Y.js document state
  created_by TEXT, -- User ID who triggered the version creation
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure only one version per document per day
  UNIQUE(document_id, version_date)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_document_daily_versions_document_date 
ON document_daily_versions(document_id, version_date DESC);

CREATE INDEX IF NOT EXISTS idx_document_daily_versions_created_at 
ON document_daily_versions(created_at DESC);

-- Add comment for documentation
COMMENT ON TABLE document_daily_versions IS 'Daily version snapshots for collaborative documents - one version per document per day';
COMMENT ON COLUMN document_daily_versions.snapshot_data IS 'Compressed Y.js document state using pako deflate';
COMMENT ON COLUMN document_daily_versions.version_date IS 'Date (not timestamp) for the version - only one version per day allowed';
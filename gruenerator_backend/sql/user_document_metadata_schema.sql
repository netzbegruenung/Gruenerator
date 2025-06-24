-- User Document Metadata Schema
-- This table stores metadata for Y.js collaborative documents created by users

CREATE TABLE IF NOT EXISTS user_document_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  document_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Unbenanntes Dokument',
  document_type TEXT DEFAULT 'text' CHECK (document_type IN ('text', 'antrag', 'social', 'universal', 'press', 'gruene_jugend')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique combination of user_id and document_id
  UNIQUE(user_id, document_id)
);

-- Create index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS idx_user_document_metadata_user_id ON user_document_metadata(user_id);

-- Create index for faster lookups by document_id
CREATE INDEX IF NOT EXISTS idx_user_document_metadata_document_id ON user_document_metadata(document_id);

-- Create index for faster lookups by document_type
CREATE INDEX IF NOT EXISTS idx_user_document_metadata_type ON user_document_metadata(document_type);

-- Create index for sorting by creation date
CREATE INDEX IF NOT EXISTS idx_user_document_metadata_created_at ON user_document_metadata(created_at DESC);

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_document_metadata_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function before UPDATE
DROP TRIGGER IF EXISTS update_user_document_metadata_updated_at_trigger ON user_document_metadata;
CREATE TRIGGER update_user_document_metadata_updated_at_trigger
  BEFORE UPDATE ON user_document_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_user_document_metadata_updated_at();

-- RLS (Row Level Security) policies
ALTER TABLE user_document_metadata ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own document metadata
CREATE POLICY user_document_metadata_user_access ON user_document_metadata
  FOR ALL
  USING (user_id = auth.uid());

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON user_document_metadata TO authenticated;
GRANT USAGE ON SEQUENCE user_document_metadata_id_seq TO authenticated;

-- Add comment for documentation
COMMENT ON TABLE user_document_metadata IS 'Stores metadata for Y.js collaborative documents created by users, including titles and document types';
COMMENT ON COLUMN user_document_metadata.document_id IS 'Reference to the Y.js document ID in yjs_document_snapshots';
COMMENT ON COLUMN user_document_metadata.document_type IS 'Type of document: text, antrag, social, universal, press, gruene_jugend';
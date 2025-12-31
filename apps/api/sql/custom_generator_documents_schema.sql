-- Custom Generator Documents Junction Table
-- This creates the many-to-many relationship between custom generators and documents
-- Execute this in your Supabase database

-- Create junction table for custom generator documents
CREATE TABLE IF NOT EXISTS custom_generator_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  custom_generator_id UUID NOT NULL REFERENCES custom_generators(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique combination of generator + document
  UNIQUE(custom_generator_id, document_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_custom_generator_documents_generator_id ON custom_generator_documents(custom_generator_id);
CREATE INDEX IF NOT EXISTS idx_custom_generator_documents_document_id ON custom_generator_documents(document_id);
CREATE INDEX IF NOT EXISTS idx_custom_generator_documents_created_at ON custom_generator_documents(created_at DESC);

-- Row Level Security (RLS) policies
ALTER TABLE custom_generator_documents ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only manage documents for their own generators
CREATE POLICY "Users can view own generator documents" ON custom_generator_documents
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM custom_generators 
            WHERE id = custom_generator_documents.custom_generator_id 
            AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own generator documents" ON custom_generator_documents
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM custom_generators 
            WHERE id = custom_generator_documents.custom_generator_id 
            AND user_id = auth.uid()
        )
        AND
        EXISTS (
            SELECT 1 FROM documents 
            WHERE id = custom_generator_documents.document_id 
            AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own generator documents" ON custom_generator_documents
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM custom_generators 
            WHERE id = custom_generator_documents.custom_generator_id 
            AND user_id = auth.uid()
        )
    );

-- Comments for documentation
COMMENT ON TABLE custom_generator_documents IS 'Junction table linking custom generators to their associated documents';
COMMENT ON COLUMN custom_generator_documents.custom_generator_id IS 'Reference to the custom generator';
COMMENT ON COLUMN custom_generator_documents.document_id IS 'Reference to the document that provides knowledge for the generator';
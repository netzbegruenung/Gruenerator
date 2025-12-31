-- Q&A Collections schema for document-based Q&A feature
-- This should be executed in your Supabase database

-- Create Q&A collections table
CREATE TABLE IF NOT EXISTS qa_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  custom_prompt TEXT, -- User-defined prompt for this Q&A collection
  is_public BOOLEAN DEFAULT FALSE,
  public_url_token TEXT UNIQUE, -- Unique token for public access
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Q&A collection documents junction table
CREATE TABLE IF NOT EXISTS qa_collection_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES qa_collections(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(collection_id, document_id)
);

-- Create Q&A public access table for tracking public access
CREATE TABLE IF NOT EXISTS qa_public_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES qa_collections(id) ON DELETE CASCADE,
  access_token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  view_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ
);

-- Create Q&A usage logs table
CREATE TABLE IF NOT EXISTS qa_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES qa_collections(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- NULL for public access
  question TEXT NOT NULL,
  answer TEXT,
  sources JSONB, -- Store source documents and relevance scores
  response_time_ms INTEGER,
  token_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_qa_collections_user_id ON qa_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_qa_collections_public_url_token ON qa_collections(public_url_token) WHERE public_url_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qa_collections_created_at ON qa_collections(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_qa_collection_documents_collection_id ON qa_collection_documents(collection_id);
CREATE INDEX IF NOT EXISTS idx_qa_collection_documents_document_id ON qa_collection_documents(document_id);

CREATE INDEX IF NOT EXISTS idx_qa_public_access_access_token ON qa_public_access(access_token);
CREATE INDEX IF NOT EXISTS idx_qa_public_access_collection_id ON qa_public_access(collection_id);

CREATE INDEX IF NOT EXISTS idx_qa_usage_logs_collection_id ON qa_usage_logs(collection_id);
CREATE INDEX IF NOT EXISTS idx_qa_usage_logs_created_at ON qa_usage_logs(created_at DESC);

-- Create updated_at trigger for qa_collections
CREATE TRIGGER update_qa_collections_updated_at BEFORE UPDATE ON qa_collections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE qa_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_collection_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_public_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_usage_logs ENABLE ROW LEVEL SECURITY;

-- Q&A Collections policies
-- Policy: Users can view their own Q&A collections
CREATE POLICY "Users can view own qa_collections" ON qa_collections
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own Q&A collections
CREATE POLICY "Users can insert own qa_collections" ON qa_collections
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own Q&A collections
CREATE POLICY "Users can update own qa_collections" ON qa_collections
    FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own Q&A collections
CREATE POLICY "Users can delete own qa_collections" ON qa_collections
    FOR DELETE USING (auth.uid() = user_id);

-- Q&A Collection Documents policies
-- Policy: Users can manage documents in their own Q&A collections
CREATE POLICY "Users can manage own qa_collection_documents" ON qa_collection_documents
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM qa_collections qc 
            WHERE qc.id = collection_id AND qc.user_id = auth.uid()
        )
    );

-- Q&A Public Access policies
-- Policy: Users can manage public access for their own Q&A collections
CREATE POLICY "Users can manage own qa_public_access" ON qa_public_access
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM qa_collections qc 
            WHERE qc.id = collection_id AND qc.user_id = auth.uid()
        )
    );

-- Q&A Usage Logs policies
-- Policy: Users can view usage logs for their own Q&A collections
CREATE POLICY "Users can view own qa_usage_logs" ON qa_usage_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM qa_collections qc 
            WHERE qc.id = collection_id AND qc.user_id = auth.uid()
        )
    );

-- Policy: Anyone can insert usage logs (for public access tracking)
CREATE POLICY "Anyone can insert qa_usage_logs" ON qa_usage_logs
    FOR INSERT WITH CHECK (true);

-- Functions for Q&A management

-- Function to generate unique public URL token
CREATE OR REPLACE FUNCTION generate_qa_public_token()
RETURNS TEXT AS $$
BEGIN
    RETURN encode(gen_random_bytes(32), 'base64url');
END;
$$ LANGUAGE plpgsql;

-- Function to create public access for a Q&A collection
CREATE OR REPLACE FUNCTION create_qa_public_access(collection_uuid UUID)
RETURNS TEXT AS $$
DECLARE
    new_token TEXT;
    collection_owner UUID;
BEGIN
    -- Check if user owns the collection
    SELECT user_id INTO collection_owner FROM qa_collections WHERE id = collection_uuid;
    
    IF collection_owner != auth.uid() THEN
        RAISE EXCEPTION 'Access denied: You do not own this collection';
    END IF;
    
    -- Generate unique token
    new_token := generate_qa_public_token();
    
    -- Insert public access record
    INSERT INTO qa_public_access (collection_id, access_token)
    VALUES (collection_uuid, new_token);
    
    -- Update collection as public
    UPDATE qa_collections 
    SET is_public = TRUE, public_url_token = new_token 
    WHERE id = collection_uuid;
    
    RETURN new_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to revoke public access
CREATE OR REPLACE FUNCTION revoke_qa_public_access(collection_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    collection_owner UUID;
BEGIN
    -- Check if user owns the collection
    SELECT user_id INTO collection_owner FROM qa_collections WHERE id = collection_uuid;
    
    IF collection_owner != auth.uid() THEN
        RAISE EXCEPTION 'Access denied: You do not own this collection';
    END IF;
    
    -- Delete public access records
    DELETE FROM qa_public_access WHERE collection_id = collection_uuid;
    
    -- Update collection as private
    UPDATE qa_collections 
    SET is_public = FALSE, public_url_token = NULL 
    WHERE id = collection_uuid;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments for documentation
COMMENT ON TABLE qa_collections IS 'User-created Q&A collections based on their documents';
COMMENT ON TABLE qa_collection_documents IS 'Junction table linking Q&A collections to documents';
COMMENT ON TABLE qa_public_access IS 'Public access tokens for shared Q&A collections';
COMMENT ON TABLE qa_usage_logs IS 'Logs of Q&A interactions for analytics';

COMMENT ON COLUMN qa_collections.custom_prompt IS 'User-defined prompt/instructions for this Q&A collection';
COMMENT ON COLUMN qa_collections.public_url_token IS 'Unique token for public access to this collection';
COMMENT ON COLUMN qa_usage_logs.sources IS 'JSON array of source documents and relevance scores';
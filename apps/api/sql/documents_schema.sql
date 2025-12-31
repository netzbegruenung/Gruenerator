-- Documents table schema for knowledge documents feature
-- This should be executed in your Supabase database

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL, -- Optional group association
  title TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL, -- Supabase Storage path
  file_size INTEGER NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  ocr_text TEXT, -- Full extracted text from OCR
  embedding VECTOR(1536), -- OpenAI embedding for search (optional for future use)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_group_id ON documents(group_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);

-- Create vector index (uncomment when using embeddings)
-- CREATE INDEX IF NOT EXISTS idx_documents_embedding ON documents USING ivfflat (embedding vector_cosine_ops);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own documents
CREATE POLICY "Users can view own documents" ON documents
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own documents
CREATE POLICY "Users can insert own documents" ON documents
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own documents
CREATE POLICY "Users can update own documents" ON documents
    FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own documents
CREATE POLICY "Users can delete own documents" ON documents
    FOR DELETE USING (auth.uid() = user_id);

-- Create storage bucket for documents (this should be done in Supabase dashboard or via SQL)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

-- Storage policies for the documents bucket
-- Policy: Users can upload their own documents
-- CREATE POLICY "Users can upload own documents" ON storage.objects
--     FOR INSERT WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Users can view their own documents
-- CREATE POLICY "Users can view own documents" ON storage.objects
--     FOR SELECT USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policy: Users can delete their own documents
-- CREATE POLICY "Users can delete own documents" ON storage.objects
--     FOR DELETE USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Comments for documentation
COMMENT ON TABLE documents IS 'Stores user-uploaded PDF documents for knowledge extraction';
COMMENT ON COLUMN documents.user_id IS 'Owner of the document';
COMMENT ON COLUMN documents.group_id IS 'Optional group association for shared documents';
COMMENT ON COLUMN documents.title IS 'User-provided title for the document';
COMMENT ON COLUMN documents.filename IS 'Original filename of the uploaded document';
COMMENT ON COLUMN documents.file_path IS 'Path to file in Supabase Storage';
COMMENT ON COLUMN documents.status IS 'Processing status: pending, processing, completed, failed';
COMMENT ON COLUMN documents.ocr_text IS 'Extracted text content via Tesseract OCR';
COMMENT ON COLUMN documents.embedding IS 'Vector embedding for semantic search (optional)';
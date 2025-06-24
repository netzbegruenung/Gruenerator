-- Grundsatz vector search functions for Bündnis 90/Die Grünen political documents
-- Run this in your Supabase SQL editor

-- Drop existing functions if they exist (with all possible signatures)
DROP FUNCTION IF EXISTS similarity_search_grundsatz(vector(1024), float, int);
DROP FUNCTION IF EXISTS get_grundsatz_embedding_stats();
DROP FUNCTION IF EXISTS search_grundsatz_by_keywords(text, int);
DROP FUNCTION IF EXISTS get_grundsatz_document(uuid);

-- Create Grundsatz similarity search function
CREATE OR REPLACE FUNCTION similarity_search_grundsatz(
  query_embedding vector(1024),
  similarity_threshold float DEFAULT 0.3,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_text text,
  similarity float,
  chunk_index int,
  document_title text,
  document_filename text,
  document_created_at timestamptz
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    gdc.id,
    gdc.document_id,
    gdc.chunk_text,
    1 - (gdc.embedding <=> query_embedding) as similarity,
    gdc.chunk_index,
    gd.title as document_title,
    gd.filename as document_filename,
    gd.created_at as document_created_at
  FROM grundsatz_document_chunks gdc
  INNER JOIN grundsatz_documents gd ON (gdc.document_id = gd.id)
  WHERE 
    gdc.embedding IS NOT NULL
    AND (1 - (gdc.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY gdc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create basic indexes that don't require high memory
-- Index for Grundsatz chunks with non-null embeddings (memory efficient)
CREATE INDEX IF NOT EXISTS idx_grundsatz_document_chunks_embedding_not_null 
ON grundsatz_document_chunks (document_id) 
WHERE embedding IS NOT NULL;

-- Index for Grundsatz documents (memory efficient)
CREATE INDEX IF NOT EXISTS idx_grundsatz_documents_title 
ON grundsatz_documents (title);

-- Index for document_id foreign key (memory efficient)
CREATE INDEX IF NOT EXISTS idx_grundsatz_document_chunks_document_id
ON grundsatz_document_chunks (document_id);

-- Optional: Create vector index ONLY if you have sufficient memory
-- Uncomment and run separately if your database has more maintenance_work_mem:
-- 
-- CREATE INDEX IF NOT EXISTS idx_grundsatz_document_chunks_embedding_cosine 
-- ON grundsatz_document_chunks 
-- USING ivfflat (embedding vector_cosine_ops)
-- WITH (lists = 5);

-- Create function for Grundsatz embedding statistics
CREATE OR REPLACE FUNCTION get_grundsatz_embedding_stats()
RETURNS TABLE (
  total_documents bigint,
  total_chunks bigint,
  avg_chunks_per_document float,
  total_pages bigint
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT gd.id) as total_documents,
    COUNT(gdc.id) as total_chunks,
    CASE 
      WHEN COUNT(DISTINCT gd.id) > 0 
      THEN COUNT(gdc.id)::float / COUNT(DISTINCT gd.id)::float 
      ELSE 0 
    END as avg_chunks_per_document,
    SUM(gd.pages)::bigint as total_pages
  FROM grundsatz_documents gd
  LEFT JOIN grundsatz_document_chunks gdc ON (gd.id = gdc.document_id AND gdc.embedding IS NOT NULL);
END;
$$;

-- Create function for Grundsatz document search by keywords (fallback)
CREATE OR REPLACE FUNCTION search_grundsatz_by_keywords(
  search_query text,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  title text,
  filename text,
  pages int,
  relevant_content text,
  created_at timestamptz
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    gd.id,
    gd.title,
    gd.filename,
    gd.pages,
    SUBSTRING(gd.full_text, 1, 500) as relevant_content,
    gd.created_at
  FROM grundsatz_documents gd
  WHERE 
    gd.full_text ILIKE '%' || search_query || '%'
    OR gd.title ILIKE '%' || search_query || '%'
  ORDER BY 
    CASE 
      WHEN gd.title ILIKE '%' || search_query || '%' THEN 1
      ELSE 2
    END,
    gd.created_at DESC
  LIMIT match_count;
END;
$$;

-- Create function to get specific Grundsatz document by ID
CREATE OR REPLACE FUNCTION get_grundsatz_document(document_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  filename text,
  pages int,
  full_text text,
  created_at timestamptz,
  chunk_count bigint
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    gd.id,
    gd.title,
    gd.filename,
    gd.pages,
    gd.full_text,
    gd.created_at,
    COUNT(gdc.id) as chunk_count
  FROM grundsatz_documents gd
  LEFT JOIN grundsatz_document_chunks gdc ON (gd.id = gdc.document_id)
  WHERE gd.id = document_id
  GROUP BY gd.id, gd.title, gd.filename, gd.pages, gd.full_text, gd.created_at;
END;
$$;

-- Add comments for documentation
COMMENT ON FUNCTION similarity_search_grundsatz IS 'Vector similarity search for Grundsatz documents (Bündnis 90/Die Grünen political documents)';
COMMENT ON FUNCTION get_grundsatz_embedding_stats IS 'Get statistics about Grundsatz document embeddings';
COMMENT ON FUNCTION search_grundsatz_by_keywords IS 'Keyword-based fallback search for Grundsatz documents';
COMMENT ON FUNCTION get_grundsatz_document IS 'Get specific Grundsatz document by ID with chunk count';

-- Grant execute permissions (adjust as needed for your RLS setup)
-- GRANT EXECUTE ON FUNCTION similarity_search_grundsatz TO authenticated;
-- GRANT EXECUTE ON FUNCTION get_grundsatz_embedding_stats TO authenticated;
-- GRANT EXECUTE ON FUNCTION search_grundsatz_by_keywords TO authenticated;
-- GRANT EXECUTE ON FUNCTION get_grundsatz_document TO authenticated;
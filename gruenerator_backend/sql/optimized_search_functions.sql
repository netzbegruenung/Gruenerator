-- Optimized vector search functions for better performance
-- Run this in your Supabase SQL editor

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS similarity_search_optimized(vector(1024), uuid, float, int);

-- Create optimized similarity search function
CREATE OR REPLACE FUNCTION similarity_search_optimized(
  query_embedding vector(1024),
  user_id_filter uuid,
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
    dc.id,
    dc.document_id,
    dc.chunk_text,
    1 - (dc.embedding <=> query_embedding) as similarity,
    dc.chunk_index,
    d.title as document_title,
    d.filename as document_filename,
    d.created_at as document_created_at
  FROM document_chunks dc
  INNER JOIN documents d ON (dc.document_id = d.id)
  WHERE 
    d.user_id = user_id_filter 
    AND d.status = 'completed'
    AND dc.embedding IS NOT NULL
    AND (1 - (dc.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Add index hints and optimizations
-- Ensure we have the right indexes
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_cosine 
ON document_chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Composite index for faster filtering
CREATE INDEX IF NOT EXISTS idx_documents_user_status 
ON documents (user_id, status) 
WHERE status = 'completed';

-- Index for document chunks with non-null embeddings
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_not_null 
ON document_chunks (document_id) 
WHERE embedding IS NOT NULL;

-- Create function for batch similarity search (for future use)
CREATE OR REPLACE FUNCTION batch_similarity_search(
  query_embeddings vector(1024)[],
  user_id_filter uuid,
  similarity_threshold float DEFAULT 0.3,
  match_count_per_query int DEFAULT 10
)
RETURNS TABLE (
  query_index int,
  id uuid,
  document_id uuid,
  chunk_text text,
  similarity float,
  chunk_index int,
  document_title text,
  document_filename text
) 
LANGUAGE plpgsql
AS $$
DECLARE
  embedding_item vector(1024);
  query_idx int;
BEGIN
  query_idx := 1;
  
  FOREACH embedding_item IN ARRAY query_embeddings
  LOOP
    RETURN QUERY
    SELECT 
      query_idx as query_index,
      dc.id,
      dc.document_id,
      dc.chunk_text,
      1 - (dc.embedding <=> embedding_item) as similarity,
      dc.chunk_index,
      d.title as document_title,
      d.filename as document_filename
    FROM document_chunks dc
    INNER JOIN documents d ON (dc.document_id = d.id)
    WHERE 
      d.user_id = user_id_filter 
      AND d.status = 'completed'
      AND dc.embedding IS NOT NULL
      AND (1 - (dc.embedding <=> embedding_item)) >= similarity_threshold
    ORDER BY dc.embedding <=> embedding_item
    LIMIT match_count_per_query;
    
    query_idx := query_idx + 1;
  END LOOP;
END;
$$;

-- Add function for getting document embedding statistics
CREATE OR REPLACE FUNCTION get_embedding_stats(user_id_filter uuid)
RETURNS TABLE (
  total_documents bigint,
  documents_with_embeddings bigint,
  total_chunks bigint,
  avg_chunks_per_document float
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT d.id) as total_documents,
    COUNT(DISTINCT dc.document_id) as documents_with_embeddings,
    COUNT(dc.id) as total_chunks,
    CASE 
      WHEN COUNT(DISTINCT dc.document_id) > 0 
      THEN COUNT(dc.id)::float / COUNT(DISTINCT dc.document_id)::float 
      ELSE 0 
    END as avg_chunks_per_document
  FROM documents d
  LEFT JOIN document_chunks dc ON (d.id = dc.document_id AND dc.embedding IS NOT NULL)
  WHERE d.user_id = user_id_filter AND d.status = 'completed';
END;
$$;

-- Performance monitoring function
CREATE OR REPLACE FUNCTION analyze_search_performance()
RETURNS TABLE (
  index_name text,
  index_size text,
  table_size text,
  unused_indexes text[]
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    schemaname||'.'||indexname as index_name,
    pg_size_pretty(pg_relation_size(schemaname||'.'||indexname)) as index_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    ARRAY[]::text[] as unused_indexes
  FROM pg_indexes 
  WHERE tablename IN ('documents', 'document_chunks')
  ORDER BY pg_relation_size(schemaname||'.'||indexname) DESC;
END;
$$;

-- Add comments for documentation
COMMENT ON FUNCTION similarity_search_optimized IS 'Optimized vector similarity search with better JOIN strategy and index utilization';
COMMENT ON FUNCTION batch_similarity_search IS 'Batch processing for multiple query embeddings in a single call';
COMMENT ON FUNCTION get_embedding_stats IS 'Get statistics about document embeddings for a user';
COMMENT ON FUNCTION analyze_search_performance IS 'Analyze search performance and index usage';

-- Create optimized similarity search function with document filtering
CREATE OR REPLACE FUNCTION similarity_search_with_documents(
  query_embedding vector(1024),
  user_id_filter uuid,
  document_ids_filter uuid[],
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
    dc.id,
    dc.document_id,
    dc.chunk_text,
    1 - (dc.embedding <=> query_embedding) as similarity,
    dc.chunk_index,
    d.title as document_title,
    d.filename as document_filename,
    d.created_at as document_created_at
  FROM document_chunks dc
  INNER JOIN documents d ON (dc.document_id = d.id)
  WHERE 
    d.user_id = user_id_filter 
    AND d.status = 'completed'
    AND dc.embedding IS NOT NULL
    AND dc.document_id = ANY(document_ids_filter)
    AND (1 - (dc.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Add comment for the new function
COMMENT ON FUNCTION similarity_search_with_documents IS 'Optimized vector similarity search with document ID filtering for QA collections';

-- Grant execute permissions (adjust as needed for your RLS setup)
-- GRANT EXECUTE ON FUNCTION similarity_search_optimized TO authenticated;
-- GRANT EXECUTE ON FUNCTION batch_similarity_search TO authenticated;
-- GRANT EXECUTE ON FUNCTION get_embedding_stats TO authenticated;
-- GRANT EXECUTE ON FUNCTION similarity_search_with_documents TO authenticated;
-- QA Collection Document Search Function (Minimal Version)
-- This function enables searching within specific documents for Q&A collections
-- Run this in your Supabase SQL editor

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS similarity_search_with_documents(vector(1024), uuid, uuid[], float, int);
DROP FUNCTION IF EXISTS similarity_search_with_documents(vector(1536), uuid, uuid[], float, int);

-- Create QA collection document-filtered search function
CREATE OR REPLACE FUNCTION similarity_search_with_documents(
    query_embedding vector(1024),
    user_id_filter uuid,
    document_ids_filter uuid[],
    similarity_threshold float,
    match_count int
)
RETURNS TABLE (
    id uuid,
    document_id uuid,
    chunk_index int,
    chunk_text text,
    embedding vector(1024),
    token_count int,
    created_at timestamp with time zone,
    similarity float,
    document_title text,
    document_filename text,
    document_created_at timestamp with time zone
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Add logging for debugging
    RAISE NOTICE 'QA Search: user_id=%, doc_count=%, threshold=%', user_id_filter, array_length(document_ids_filter, 1), similarity_threshold;
    
    RETURN QUERY
    SELECT
        dc.id,
        dc.document_id,
        dc.chunk_index,
        dc.chunk_text,
        dc.embedding,
        dc.token_count,
        dc.created_at,
        1 - (dc.embedding <=> query_embedding) as similarity,
        d.title as document_title,
        d.filename as document_filename,
        d.created_at as document_created_at
    FROM document_chunks dc
    INNER JOIN documents d ON (dc.document_id = d.id)
    WHERE
        d.user_id = user_id_filter
        AND d.status = 'completed'
        AND dc.embedding IS NOT NULL
        AND d.id = ANY(document_ids_filter)
        AND (1 - (dc.embedding <=> query_embedding)) >= similarity_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION similarity_search_with_documents IS 'Vector similarity search filtered by specific document IDs for Q&A collections. Uses 1024-dimensional embeddings.';
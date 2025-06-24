-- Smart Query Expansion SQL Functions
-- Functions to support semantic neighbor discovery and intelligent query expansion

-- Function to find semantic neighbors from document chunks
-- This discovers terms that are semantically close to the query in vector space
CREATE OR REPLACE FUNCTION find_semantic_neighbors(
  query_embedding vector(1024),
  user_id_filter uuid DEFAULT NULL,
  similarity_threshold float DEFAULT 0.75,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_index int,
  chunk_text text,
  similarity float,
  document_title text,
  document_filename text
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.chunk_text,
    (1 - (dc.embedding <=> query_embedding)) as similarity,
    d.title as document_title,
    d.filename as document_filename
  FROM document_chunks dc
  JOIN documents d ON dc.document_id = d.id
  WHERE 
    dc.embedding IS NOT NULL
    AND d.status = 'completed'
    AND (user_id_filter IS NULL OR d.user_id = user_id_filter)
    AND (1 - (dc.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to get document statistics for smart expansion
CREATE OR REPLACE FUNCTION get_expansion_stats(
  user_id_filter uuid DEFAULT NULL
)
RETURNS TABLE (
  total_documents bigint,
  total_chunks bigint,
  avg_chunks_per_document numeric,
  documents_with_embeddings bigint
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT d.id)::bigint as total_documents,
    COUNT(dc.id)::bigint as total_chunks,
    CASE 
      WHEN COUNT(DISTINCT d.id) > 0 
      THEN ROUND(COUNT(dc.id)::numeric / COUNT(DISTINCT d.id)::numeric, 1)
      ELSE 0::numeric
    END as avg_chunks_per_document,
    COUNT(DISTINCT CASE WHEN dc.id IS NOT NULL THEN d.id END)::bigint as documents_with_embeddings
  FROM documents d
  LEFT JOIN document_chunks dc ON d.id = dc.document_id AND dc.embedding IS NOT NULL
  WHERE 
    d.status = 'completed'
    AND (user_id_filter IS NULL OR d.user_id = user_id_filter);
END;
$$;

-- Function to find documents that contain multiple expansion terms
-- Useful for validating semantic relationships
CREATE OR REPLACE FUNCTION find_documents_with_terms(
  search_terms text[],
  user_id_filter uuid DEFAULT NULL,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  document_id uuid,
  document_title text,
  document_filename text,
  matched_terms text[],
  match_count_result int,
  relevance_score float
) LANGUAGE plpgsql AS $$
DECLARE
  term text;
  term_pattern text;
BEGIN
  -- Build search pattern for all terms
  term_pattern := '';
  FOREACH term IN ARRAY search_terms
  LOOP
    IF term_pattern != '' THEN
      term_pattern := term_pattern || '|';
    END IF;
    term_pattern := term_pattern || '(' || regexp_replace(term, '\W', '', 'g') || ')';
  END LOOP;

  RETURN QUERY
  SELECT 
    d.id as document_id,
    d.title as document_title,
    d.filename as document_filename,
    search_terms as matched_terms,
    -- Count how many terms match in the document
    (
      SELECT COUNT(*)::int 
      FROM unnest(search_terms) as search_term
      WHERE d.ocr_text ILIKE '%' || search_term || '%'
    ) as match_count_result,
    -- Simple relevance score based on term frequency
    (
      SELECT 
        CASE 
          WHEN LENGTH(d.ocr_text) > 0 
          THEN (
            SELECT SUM(
              (LENGTH(d.ocr_text) - LENGTH(REPLACE(LOWER(d.ocr_text), LOWER(search_term), '')))::float 
              / LENGTH(search_term)::float
            )
            FROM unnest(search_terms) as search_term
          ) / LENGTH(d.ocr_text)::float
          ELSE 0::float
        END
    ) as relevance_score
  FROM documents d
  WHERE 
    d.status = 'completed'
    AND (user_id_filter IS NULL OR d.user_id = user_id_filter)
    AND (
      SELECT COUNT(*)
      FROM unnest(search_terms) as search_term
      WHERE d.ocr_text ILIKE '%' || search_term || '%'
    ) > 0
  ORDER BY match_count_result DESC, relevance_score DESC
  LIMIT match_count;
END;
$$;

-- Function to analyze query expansion effectiveness
-- Compares results before and after expansion
CREATE OR REPLACE FUNCTION analyze_expansion_effectiveness(
  original_query text,
  expanded_query text,
  user_id_filter uuid,
  similarity_threshold float DEFAULT 0.3
)
RETURNS TABLE (
  original_results_count int,
  expanded_results_count int,
  improvement_ratio float,
  overlap_count int,
  new_results_count int
) LANGUAGE plpgsql AS $$
DECLARE
  original_embedding vector(1024);
  expanded_embedding vector(1024);
BEGIN
  -- Note: This function would need to be called from application code
  -- since we can't generate embeddings directly in PostgreSQL
  -- This is a template for future implementation
  
  RETURN QUERY
  SELECT 
    0 as original_results_count,
    0 as expanded_results_count,
    0.0 as improvement_ratio,
    0 as overlap_count,
    0 as new_results_count;
END;
$$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_user 
ON document_chunks(document_id) 
WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_status_user 
ON documents(user_id, status) 
WHERE status = 'completed';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION find_semantic_neighbors TO authenticated;
GRANT EXECUTE ON FUNCTION get_expansion_stats TO authenticated;
GRANT EXECUTE ON FUNCTION find_documents_with_terms TO authenticated;
GRANT EXECUTE ON FUNCTION analyze_expansion_effectiveness TO authenticated;
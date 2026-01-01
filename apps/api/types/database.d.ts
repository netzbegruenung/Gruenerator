export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
}

export interface QdrantConfig {
  url: string;
  apiKey?: string;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
  vector?: number[];
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  chunk_text: string;
  vector?: number[];
  metadata?: Record<string, unknown>;
}

export interface Document {
  id: string;
  user_id: string;
  title: string;
  filename?: string;
  file_type?: string;
  content?: string;
  created_at: Date;
  updated_at: Date;
}

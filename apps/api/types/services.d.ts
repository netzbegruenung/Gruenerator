import type { VectorSearchResult, DocumentChunk } from './database';

export interface SearchOptions {
  query: string;
  user_id?: string;
  group_id?: string;
  limit?: number;
  mode?: 'hybrid' | 'vector' | 'keyword';
  filters?: Record<string, unknown>;
}

export interface SearchResult {
  results: Array<{
    document_id: string;
    title: string;
    content: string;
    similarity_score: number;
    chunk_index?: number;
    filename?: string;
    relevance_info?: string;
  }>;
  searchType: string;
  totalCount?: number;
}

export interface EmbeddingService {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface DocumentService {
  getDocument(id: string, userId: string): Promise<DocumentChunk | null>;
  searchDocuments(options: SearchOptions): Promise<SearchResult>;
  uploadDocument(file: Express.Multer.File, userId: string): Promise<DocumentChunk>;
  deleteDocument(id: string, userId: string): Promise<boolean>;
}

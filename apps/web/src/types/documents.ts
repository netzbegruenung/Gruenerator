export interface Document {
  id: string;
  title: string;
  filename?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at?: string;
  updated_at?: string;
  user_id?: string;
  group_id?: string | null;
  content?: string;
  metadata?: Record<string, unknown>;
  page_count?: number;
  ocr_text?: string;
  [key: string]: unknown;
}

export interface SavedText {
  id: string;
  title?: string;
  content: string;
  created_at?: string;
  updated_at?: string;
  user_id?: string;
  document_type?: string;
  word_count?: number;
  [key: string]: unknown;
}

export interface SearchResult {
  id: string;
  content: string;
  score?: number;
  search_type?: string;
  document_id?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DocumentsState {
  documents: Document[];
  texts: SavedText[];
  isLoading: boolean;
  isUploading: boolean;
  uploadProgress: number;
  error: string | null;
  searchResults: SearchResult[];
  isSearching: boolean;
}

export interface SearchOptions {
  limit?: number;
  mode?: 'intelligent' | 'fulltext';
  documentIds?: string[];
}

export interface WolkeFile {
  path: string;
  name: string;
  size?: number;
  type?: string;
  [key: string]: unknown;
}

export interface WolkeBrowseResult {
  success: boolean;
  files: WolkeFile[];
  message?: string;
}

export interface WolkeImportResult {
  success: boolean;
  summary?: {
    total: number;
    successful: number;
    failed: number;
  };
  message?: string;
}

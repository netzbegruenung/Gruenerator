/**
 * Notebook/Q&A Collection Types
 */

import type { Document } from './documents';

/**
 * Wolke share link representation in notebook context
 */
export interface WolkeShareLink {
  id: string;
  name?: string;
  url?: string;
  display_name?: string;
  base_url?: string;
  [key: string]: unknown;
}

/**
 * Base notebook collection type representing a Q&A collection
 */
export interface NotebookCollection {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  custom_prompt?: string;
  is_public: boolean;
  public_url_token?: string | null;
  view_count: number;
  last_accessed?: string;
  auto_sync?: boolean;
  remove_missing_on_sync?: boolean;
  created_at: string;
  updated_at: string;
  document_count?: number;
  documents?: Document[];
  wolke_share_links?: WolkeShareLink[];
  selection_mode?: 'documents' | 'wolke' | 'mixed';
}

/**
 * Props for the NotebookList component
 */
export interface NotebookListProps {
  qaCollections: NotebookCollection[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onShare: (id: string) => void;
  onView: (id: string) => void;
  loading?: boolean;
  processingCollectionIds?: Set<string>;
}

/**
 * Notebook collection creation/update request payload
 */
export interface NotebookCollectionInput {
  name: string;
  description?: string;
  custom_prompt?: string;
  selectionMode?: 'documents' | 'wolke' | 'mixed';
  documents?: string[];
  wolkeShareLinks?: string[];
}

/**
 * API response for notebook collections
 */
export interface NotebookCollectionsResponse {
  success: boolean;
  message?: string;
  collections: NotebookCollection[];
}

/**
 * API response for single notebook collection
 */
export interface NotebookCollectionResponse {
  success: boolean;
  message?: string;
  collection: NotebookCollection;
}

/**
 * Enhanced collection with computed properties
 */
export interface EnhancedNotebookCollection extends NotebookCollection {
  has_wolke_sources: boolean;
  has_document_sources: boolean;
  total_sources: number;
  is_mixed_sources: boolean;
}

/**
 * Notebook collection statistics
 */
export interface NotebookCollectionStats {
  total: number;
  documentsOnly: number;
  wolkeOnly: number;
  mixed: number;
  empty: number;
}

/**
 * Filter values structure for notebook collections
 */
export interface NotebookFilterValues {
  [fieldName: string]: {
    label: string;
    values: string[];
  };
}

/**
 * Active filters for a collection
 */
export interface NotebookActiveFilters {
  [fieldName: string]: string[] | { date_from?: string | null; date_to?: string | null };
}

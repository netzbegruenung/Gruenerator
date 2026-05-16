/**
 * Notebook/Q&A Collection Types
 */

import { type WolkeFolderRef } from '@gruenerator/contracts';

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
 * Discloses why a notebook was published. Captured alongside the is_public flag.
 */
export type NotebookPublicOwnership = 'owner' | 'public_data';

export type NotebookShareMode = 'private' | 'groups' | 'authenticated';
export type NotebookEditPolicy = 'owner_only' | 'group_admins' | 'all_members';
export type NotebookAccessSource = 'owned' | 'shared' | 'authenticated';

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
  public_ownership?: NotebookPublicOwnership | null;
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
  labels?: string[];
  wolke_folders?: WolkeFolderRef[];
  likes_count?: number;
  share_mode?: NotebookShareMode | null;
  edit_policy?: NotebookEditPolicy | null;
  access_source?: NotebookAccessSource | null;
  /**
   * Stable 6-char tail used to build pretty URLs (`/notebooks/<name>-Ab3xK9`).
   * Null only for legacy rows before the boot-time backfill has run; once
   * present, never changes — renames rewrite the name prefix only.
   */
  slug_suffix?: string | null;
}

/**
 * Props for the NotebookList component
 */
export interface NotebookListProps {
  qaCollections: NotebookCollection[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onShare: (id: string) => void;
  onShareToGroup?: (id: string, name: string) => void;
  onView: (id: string) => void;
  loading?: boolean;
  processingCollectionIds?: Set<string>;
  compact?: boolean;
}

/**
 * Notebook collection creation/update request payload
 */
export interface NotebookCollectionInput {
  name: string;
  description?: string;
  custom_prompt?: string;
  selectionMode?: 'documents' | 'wolke' | 'mixed';
  documents?: (string | number)[];
  wolkeShareLinks?: string[];
  labels?: string[];
  auto_sync?: boolean;
  remove_missing_on_sync?: boolean;
  is_public?: boolean;
  public_ownership?: NotebookPublicOwnership | null;
  wolkeFolders?: WolkeFolderRef[];
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

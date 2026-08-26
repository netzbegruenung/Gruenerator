/**
 * Notebook/Q&A Collection Types
 */

import {
  type LinkedDocRef,
  type TransformedCollection,
  type WolkeFolderRef,
  type WordpressSiteRef,
} from '@gruenerator/contracts';

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
 * A notebook collection as the API returns it.
 *
 * Aliased to the contract schema rather than re-declared: the hand-written twin
 * that used to live here had drifted — it required `view_count` and
 * `public_url_token`, which the backend never sends, and offered a
 * `selection_mode: 'mixed'` that exists nowhere else. Every call site had to be
 * bridged with `as unknown as`, which is precisely how the two shapes managed
 * to disagree unnoticed.
 */
export type NotebookCollection = TransformedCollection;

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
  compact?: boolean;
}

/**
 * Notebook collection creation/update request payload
 */
export interface NotebookCollectionInput {
  name: string;
  // Nullable like the contract body they are sent as: these fields are routinely
  // filled straight from a loaded collection (inline rename, hero edit), where a
  // cleared description legitimately reads `null`.
  description?: string | null;
  custom_prompt?: string | null;
  /**
   * Tolerated as a plain string because it is usually copied off a collection,
   * where the wire type is an open string. `profileApiService` narrows it to the
   * two values the API accepts before sending.
   */
  selectionMode?: string | null;
  documents?: (string | number)[];
  wolkeShareLinks?: string[];
  labels?: string[] | null;
  auto_sync?: boolean | null;
  remove_missing_on_sync?: boolean | null;
  is_public?: boolean | null;
  public_ownership?: NotebookPublicOwnership | null;
  wolkeFolders?: WolkeFolderRef[];
  linkedDocs?: LinkedDocRef[];
  wordpressSites?: WordpressSiteRef[];
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

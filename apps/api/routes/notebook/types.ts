/**
 * Type definitions for Notebook Routes
 */

/**
 * Wolke share link information
 */
export interface WolkeShareLink {
  id: string;
}

/**
 * Document from database
 */
export interface DocumentRecord {
  id: string;
  title: string;
  page_count?: number | undefined;
  created_at: string;
  source_type?: string | undefined;
  wolke_share_link_id?: string | undefined;
  status?: string | undefined;
}

/**
 * Public access record
 */
export interface PublicAccessRecord {
  collection_id: string;
  access_token: string;
  expires_at: string | null;
  is_active: boolean;
  created_by: string | null;
}

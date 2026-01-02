/**
 * Type definitions for Notebook Routes
 */

import { AuthenticatedRequest } from '../../middleware/types.js';

// =============================================================================
// Request Body Types
// =============================================================================

/**
 * Request body for creating a notebook collection
 */
export interface CreateCollectionBody {
    name: string;
    description?: string;
    custom_prompt?: string;
    selection_mode?: 'documents' | 'wolke';
    document_ids?: string[];
    wolke_share_link_ids?: string[];
    auto_sync?: boolean;
    remove_missing_on_sync?: boolean;
}

/**
 * Request body for updating a notebook collection
 */
export interface UpdateCollectionBody {
    name: string;
    description?: string;
    custom_prompt?: string;
    selection_mode?: 'documents' | 'wolke';
    document_ids?: string[];
    wolke_share_link_ids?: string[];
    auto_sync?: boolean;
    remove_missing_on_sync?: boolean;
}

/**
 * Request body for bulk delete
 */
export interface BulkDeleteBody {
    ids: string[];
}

/**
 * Request body for QA questions
 */
export interface AskQuestionBody {
    question: string;
    filters?: Record<string, any>;
    collectionIds?: string[];
}

// =============================================================================
// Response Types
// =============================================================================

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
    page_count?: number;
    created_at: string;
    source_type?: string;
    wolke_share_link_id?: string;
}

/**
 * Transformed collection for API response
 */
export interface TransformedCollection {
    id: string;
    user_id: string;
    name: string;
    description: string | null;
    custom_prompt: string | null;
    selection_mode: string;
    wolke_share_link_ids?: string[] | null;
    auto_sync: boolean;
    remove_missing_on_sync: boolean;
    created_at: string;
    updated_at: string;
    documents: DocumentRecord[];
    document_count: number;
    wolke_share_links: WolkeShareLink[];
    has_wolke_sources: boolean;
    documents_from_wolke: number;
    notebook_collection_documents?: Array<{ document_id: string }>;
}

/**
 * Collection list response
 */
export interface CollectionListResponse {
    success: boolean;
    collections: TransformedCollection[];
}

/**
 * Collection create response
 */
export interface CollectionCreateResponse {
    success: boolean;
    collection: {
        id: string;
        user_id: string;
        name: string;
        description: string | null;
        custom_prompt: string | null;
        selection_mode: string;
        document_count: number;
        documents_from_wolke: number;
        wolke_share_links: string[];
        created_at: string;
    };
    message: string;
}

/**
 * Collection update response
 */
export interface CollectionUpdateResponse {
    success: boolean;
    message: string;
    documents_from_wolke: number;
    wolke_share_links: string[];
}

/**
 * Sync response
 */
export interface SyncResponse {
    success: boolean;
    message: string;
    added_count: number;
    removed_count: number;
    total_count: number;
    wolke_share_links: string[];
}

/**
 * Share response
 */
export interface ShareResponse {
    success: boolean;
    public_url: string;
    access_token: string;
    message: string;
}

/**
 * Bulk delete response
 */
export interface BulkDeleteResponse {
    success: boolean;
    message: string;
    deleted_count: number;
    failed_ids: string[];
    total_requested: number;
    deleted_ids: string[];
}

/**
 * Filter values response
 */
export interface FilterValuesResponse {
    collectionId: string;
    collectionName: string;
    filters: Record<string, {
        label: string;
        type: string;
        values?: Array<{ value: string; count: number }>;
        min?: string;
        max?: string;
    }>;
}

/**
 * Public collection info response
 */
export interface PublicCollectionResponse {
    collection: {
        id: string;
        name: string;
        description: string | null;
    };
    message: string;
}

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Notebook collection from Qdrant
 */
export interface NotebookCollectionFromQdrant {
    id: string;
    user_id: string;
    name: string;
    description: string | null;
    custom_prompt: string | null;
    selection_mode?: string;
    wolke_share_link_ids?: string[] | null;
    auto_sync?: boolean;
    remove_missing_on_sync?: boolean;
    created_at: string;
    updated_at: string;
    notebook_collection_documents?: Array<{ document_id: string }>;
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

/**
 * Express request with app locals for AI worker pool
 */
export interface NotebookRequest extends AuthenticatedRequest {
    app: {
        locals: {
            aiWorkerPool: any;
        };
    } & AuthenticatedRequest['app'];
}

/**
 * Media Library types
 * Platform-agnostic types for unified media gallery
 */

import {
  type MediaImageMetadata,
  type MediaItem,
  type MediaType,
  type UploadSource,
} from '@gruenerator/contracts';

// Moved to @gruenerator/contracts so the canvas editor can read them without this package.
export type { MediaImageMetadata, MediaItem, MediaType, UploadSource };

export type MediaStatus = 'processing' | 'ready' | 'failed';

export type SortOrder = 'newest' | 'oldest';

/**
 * Filters for media library queries
 */
export interface MediaFilters {
  type?: MediaType | 'all';
  search?: string;
  limit?: number;
  offset?: number;
  sort?: SortOrder;
}

/**
 * Pagination info
 */
export interface MediaPagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Upload parameters
 */
export interface MediaUploadParams {
  file: File | Blob;
  title?: string;
  altText?: string;
  uploadSource?: UploadSource;
  onProgress?: (progress: number) => void;
}

/**
 * Upload result
 */
export interface MediaUploadResult {
  id: string;
  shareToken: string;
  shareUrl: string;
  mediaType: MediaType;
  createdAt: string;
}

/**
 * Update metadata params
 */
export interface MediaUpdateParams {
  title?: string;
  altText?: string;
}

/**
 * Media picker store state (for modal/sheet)
 */
export interface MediaPickerState {
  isOpen: boolean;
  selectedItems: MediaItem[];
  allowMultiple: boolean;
  mediaTypeFilter: MediaType | 'all';
  onSelect: ((items: MediaItem[]) => void) | null;
}

/**
 * Media picker store actions
 */
export interface MediaPickerActions {
  openPicker: (options: OpenPickerOptions) => void;
  closePicker: () => void;
  selectItem: (item: MediaItem) => void;
  deselectItem: (item: MediaItem) => void;
  confirmSelection: () => void;
  clearSelection: () => void;
}

export interface OpenPickerOptions {
  allowMultiple?: boolean;
  mediaTypeFilter?: MediaType | 'all';
  onSelect: (items: MediaItem[]) => void;
}

/**
 * API Response types
 */
export interface MediaListResponse {
  success: boolean;
  data: MediaItem[];
  pagination: MediaPagination;
  error?: string;
}

export interface MediaItemResponse {
  success: boolean;
  data: MediaItem;
  error?: string;
}

export interface MediaUploadResponse {
  success: boolean;
  /** Absent when the upload was refused (validation). */
  data?: MediaUploadResult;
  error?: string;
  /** Machine-readable reason for a refusal, when the server sends one. */
  code?: string;
}

export interface MediaUpdateResponse {
  success: boolean;
  data: {
    id: string;
    shareToken: string;
    title: string | null;
    altText: string | null;
  };
  error?: string;
}

export interface MediaDeleteResponse {
  success: boolean;
  message?: string;
  error?: string;
}

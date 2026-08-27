/**
 * Media Library types
 * Platform-agnostic types for unified media gallery
 */

import { type UPLOAD_SOURCES } from './constants.js';

export type MediaType = 'image' | 'video';

export type MediaStatus = 'processing' | 'ready' | 'failed';

export type UploadSource = (typeof UPLOAD_SOURCES)[number];

export type SortOrder = 'newest' | 'oldest';

/**
 * Media item from the library
 */
export interface MediaItem {
  id: string;
  shareToken: string;
  mediaType: MediaType;
  title: string | null;
  /**
   * Full-resolution source URL, despite the name: `/api/share/<token>/preview`
   * with no `w`, which the API answers with the original bytes. Use it where
   * the real upload is wanted (placing an image on a canvas); for anything
   * rendered in an `<img>`, build a sized URL from {@link shareToken} with
   * `buildSharedMediaSrcSet` instead.
   */
  thumbnailUrl: string | null;
  mediaUrl?: string;
  fileSize: number;
  mimeType: string;
  duration?: number;
  imageType?: string;
  imageMetadata?: MediaImageMetadata;
  altText: string | null;
  uploadSource: UploadSource;
  originalFilename: string | null;
  downloadCount: number;
  viewCount: number;
  createdAt: string;
}

export interface MediaImageMetadata {
  width?: number;
  height?: number;
  hasOriginalImage?: boolean;
  originalImageFilename?: string;
  generatedAt?: string;
  /** Compact BlurHash for an instant placeholder; set once variants are generated. */
  blurhash?: string;
  /** Widths (px) of the pre-generated responsive WebP/AVIF variants. */
  variants?: number[];
}

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
 * Media library store state
 */
export interface MediaLibraryState {
  items: MediaItem[];
  selectedItem: MediaItem | null;
  filters: MediaFilters;
  pagination: MediaPagination;
  isLoading: boolean;
  error: string | null;
}

/**
 * Media library store actions
 */
export interface MediaLibraryActions {
  setFilters: (filters: Partial<MediaFilters>) => void;
  setSelectedItem: (item: MediaItem | null) => void;
  clearError: () => void;
  reset: () => void;
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
/**
 * How full the account's Mediathek is. Counts every library item the user owns
 * — not the currently filtered page — so a type filter or a search doesn't make
 * the account look emptier than it is.
 */
export interface MediaLibraryQuota {
  /** Library items the user currently holds. */
  count: number;
  /** Cap from `MEDIA_LIBRARY_ITEM_LIMIT`. */
  limit: number;
  /** `count >= limit`: further uploads are refused. */
  isFull: boolean;
  /** Past `MEDIA_LIBRARY_WARN_RATIO` of the cap — warn before it bites. */
  isNearlyFull: boolean;
}

export interface MediaListResponse {
  success: boolean;
  data: MediaItem[];
  pagination: MediaPagination;
  /** Absent on responses from a backend older than the quota notice. */
  quota?: MediaLibraryQuota;
  error?: string;
}

export interface MediaItemResponse {
  success: boolean;
  data: MediaItem;
  error?: string;
}

export interface MediaUploadResponse {
  success: boolean;
  /** Absent when the upload was refused (quota, validation). */
  data?: MediaUploadResult;
  error?: string;
  /** `'media_quota_exceeded'` when the library is full; the upload wrote nothing. */
  code?: string;
  quota?: MediaLibraryQuota;
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

/**
 * Media Library types
 * Platform-agnostic types for unified media gallery
 */

export type MediaType = 'image' | 'video';

export type MediaStatus = 'processing' | 'ready' | 'failed';

export type UploadSource = 'upload' | 'ai_generated' | 'stock' | 'camera';

export type SortOrder = 'newest' | 'oldest';

/**
 * Media item from the library
 */
export interface MediaItem {
  id: string;
  shareToken: string;
  mediaType: MediaType;
  title: string | null;
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
  data: MediaUploadResult;
  error?: string;
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

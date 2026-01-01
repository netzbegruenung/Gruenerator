/**
 * Media Library module
 * Platform-agnostic unified media gallery for Grünerator apps
 */

// Types
export type {
  MediaType,
  MediaStatus,
  UploadSource,
  SortOrder,
  MediaItem,
  MediaImageMetadata,
  MediaFilters,
  MediaPagination,
  MediaUploadParams,
  MediaUploadResult,
  MediaUpdateParams,
  MediaLibraryState,
  MediaLibraryActions,
  MediaPickerState,
  MediaPickerActions,
  OpenPickerOptions,
  MediaListResponse,
  MediaItemResponse,
  MediaUploadResponse,
  MediaUpdateResponse,
  MediaDeleteResponse,
} from './types';

// Constants
export {
  MEDIA_ENDPOINTS,
  SUPPORTED_IMAGE_TYPES,
  SUPPORTED_VIDEO_TYPES,
  SUPPORTED_MIME_TYPES,
  MAX_FILE_SIZE,
  DEFAULT_PAGINATION,
  MEDIA_LIMITS,
  UPLOAD_SOURCE_LABELS,
  MEDIA_TYPE_LABELS,
} from './constants';

// API
export {
  getMediaLibrary,
  getMediaById,
  uploadMedia,
  updateMedia,
  deleteMedia,
  searchMedia,
  mediaApi,
} from './api';

// Hooks
export { useMediaLibrary } from './hooks/useMediaLibrary';
export { useMediaUpload } from './hooks/useMediaUpload';

// Stores
export { useMediaPickerStore, useMediaPicker } from './stores/mediaPickerStore';

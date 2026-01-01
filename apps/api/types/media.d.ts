/**
 * Media Library backend types
 * Backend-specific types for shared media service and controller
 */

// Re-export shared types for convenience
export type { MediaType, MediaStatus, UploadSource, SortOrder } from '@gruenerator/shared';
export type {
  MediaItem,
  MediaFilters,
  MediaPagination,
  MediaImageMetadata,
  MediaListResponse,
  MediaItemResponse,
  MediaUploadResponse,
  MediaUpdateResponse,
  MediaDeleteResponse
} from '@gruenerator/shared';

/**
 * Database row type for shared_media table
 * Uses snake_case to match PostgreSQL column names
 */
export interface SharedMediaRow {
  id: string;
  user_id: string;
  share_token: string;
  media_type: 'image' | 'video';
  title: string | null;
  file_path: string | null;
  file_name: string | null;
  thumbnail_path: string | null;
  file_size: number | null;
  mime_type: string;
  duration: number | null;
  project_id: string | null;
  image_type: string | null;
  image_metadata: Record<string, unknown> | null;
  status: 'processing' | 'ready' | 'failed';
  download_count: number;
  view_count: number;
  is_library_item: boolean;
  alt_text: string | null;
  upload_source: 'upload' | 'ai_generated' | 'stock' | 'camera';
  original_filename: string | null;
  created_at: Date;
  updated_at: Date;
  sharer_name?: string;
}

/**
 * Database row type for shared_media_downloads table
 */
export interface SharedMediaDownloadRow {
  id: string;
  shared_media_id: string;
  downloader_email: string | null;
  ip_address: string | null;
  downloaded_at: Date;
}

/**
 * Parameters for creating a video share
 */
export interface CreateVideoShareParams {
  videoPath: string;
  title?: string;
  thumbnailPath?: string;
  duration?: number;
  projectId?: string;
}

/**
 * Parameters for creating a pending video share (processing)
 */
export interface CreatePendingVideoShareParams {
  title?: string;
  thumbnailPath?: string;
  duration?: number;
  projectId?: string;
}

/**
 * Parameters for creating an image share
 */
export interface CreateImageShareParams {
  imageBase64: string;
  title?: string;
  imageType?: string;
  metadata?: Record<string, unknown>;
  originalImage?: string | null;
}

/**
 * Parameters for updating an existing image share
 */
export interface UpdateImageShareParams {
  imageBase64: string;
  title?: string;
  metadata?: Record<string, unknown>;
  originalImage?: string | null;
}

/**
 * Parameters for uploading a media file
 */
export interface UploadMediaFileParams {
  fileBuffer: Buffer;
  originalFilename: string;
  mimeType: string;
  title?: string | null;
  altText?: string | null;
  uploadSource?: 'upload' | 'ai_generated' | 'stock' | 'camera';
}

/**
 * Parameters for updating media metadata
 */
export interface UpdateMediaMetadataParams {
  title?: string;
  altText?: string;
}

/**
 * Internal filters for media library queries
 */
export interface MediaLibraryFiltersInternal {
  type: 'image' | 'video' | 'all';
  search: string | null;
  limit: number;
  offset: number;
  sort: 'newest' | 'oldest';
}

/**
 * Result from share creation operations
 */
export interface ShareResult {
  id: string;
  shareToken: string;
  shareUrl: string;
  createdAt: Date | string;
  mediaType: 'image' | 'video';
  hasOriginalImage?: boolean;
  status?: 'processing' | 'ready' | 'failed';
}

/**
 * Result from media library queries
 */
export interface MediaLibraryResult {
  items: SharedMediaRow[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Result from metadata update operations
 */
export interface MetadataUpdateResult {
  id: string;
  share_token: string;
  title: string | null;
  alt_text: string | null;
}

/**
 * Image info extracted from loaded images
 */
export interface ImageInfo {
  width: number;
  height: number;
}

/**
 * Enriched metadata stored in image_metadata column
 */
export interface EnrichedImageMetadata {
  width: number;
  height: number;
  hasOriginalImage: boolean;
  originalImageFilename: string | null;
  generatedAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

/**
 * MIME type to file extension mapping
 */
export type MimeToExtensionMap = {
  [key: string]: string;
};

/**
 * Allowed MIME types for uploads
 */
export type AllowedMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif'
  | 'video/mp4'
  | 'video/webm'
  | 'video/quicktime';

/**
 * Express Request with authenticated user
 */
export interface AuthenticatedRequest {
  user?: {
    id: string;
    email?: string;
    name?: string;
  };
  file?: Express.Multer.File;
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
}

/**
 * Constants for media library
 */
export interface MediaConstants {
  readonly MAX_ITEMS_PER_USER: 50;
  readonly THUMBNAIL_SIZE: 400;
  readonly MAX_FILE_SIZE: number;
}

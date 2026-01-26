/**
 * Share module types
 * Platform-agnostic types for sharing functionality
 */

// Social media platforms for sharing (subset of generators.SocialPlatform)
export type SharePlatform = 'instagram' | 'facebook' | 'twitter' | 'linkedin' | 'pressemitteilung';

// Media types that can be shared
export type ShareMediaType = 'video' | 'image';

// Share status
export type ShareStatus = 'processing' | 'ready' | 'failed';

/**
 * Share record from backend
 */
export interface Share {
  shareToken: string;
  mediaType: ShareMediaType;
  title: string;
  status: ShareStatus;
  createdAt: string;
  thumbnailUrl?: string;
  viewCount?: number;
  downloadCount?: number;
  duration?: number;
  fileName?: string;
  mimeType?: string;
  imageType?: string;
  imageMetadata?: ShareImageMetadata;
}

export interface ShareImageMetadata {
  width?: number;
  height?: number;
  hasOriginalImage?: boolean;
  originalImageFilename?: string;
  generatedAt?: string;
  updatedAt?: string;
}

/**
 * Parameters for creating a video share
 */
export interface CreateVideoShareParams {
  projectId?: string;
  exportToken?: string;
  title?: string;
}

/**
 * Parameters for creating an image share
 */
export interface CreateImageShareParams {
  imageData: string; // base64
  title?: string;
  imageType?: string;
  metadata?: Record<string, unknown>;
  originalImage?: string;
}

/**
 * Parameters for updating an image share
 */
export interface UpdateImageShareParams {
  shareToken: string;
  imageBase64: string;
  title?: string;
  metadata?: Record<string, unknown>;
  originalImage?: string;
}

/**
 * Platform configuration
 */
export interface PlatformConfig {
  id: SharePlatform;
  displayName: string;
  color: string;
  hasShareUrl: boolean;
  getShareUrl?: (text: string, url?: string) => string;
}

/**
 * Share store state
 */
export interface ShareStoreState {
  shares: Share[];
  currentShare: Share | null;
  isLoading: boolean;
  isCreating: boolean;
  error: string | null;
  errorCode: string | null;
  count: number;
  limit: number;
}

/**
 * Share store actions
 */
export interface ShareStoreActions {
  createVideoShare: (params: CreateVideoShareParams) => Promise<Share>;
  createVideoShareFromToken: (
    exportToken: string,
    title?: string,
    projectId?: string
  ) => Promise<Share>;
  createImageShare: (params: CreateImageShareParams) => Promise<Share>;
  updateImageShare: (params: UpdateImageShareParams) => Promise<Share>;
  fetchUserShares: (mediaType?: ShareMediaType) => Promise<Share[]>;
  fetchImageShares: () => Promise<Share[]>;
  fetchVideoShares: () => Promise<Share[]>;
  deleteShare: (shareToken: string) => Promise<boolean>;
  saveAsTemplate: (
    shareToken: string,
    title: string,
    visibility: 'private' | 'unlisted' | 'public'
  ) => Promise<SaveAsTemplateResponse>;
  clearCurrentShare: () => void;
  clearError: () => void;
  reset: () => void;
}

/**
 * API response types
 */
export interface ShareResponse {
  success: boolean;
  share: Share;
  error?: string;
  code?: string;
}

export interface ShareListResponse {
  success: boolean;
  shares: Share[];
  count?: number;
  limit?: number;
  error?: string;
}

export interface DeleteShareResponse {
  success: boolean;
  error?: string;
}

export interface SaveAsTemplateResponse {
  success: boolean;
  templateUrl: string;
  shareToken: string;
  visibility: string;
  error?: string;
}

/**
 * Parsed platform sections from markdown content
 */
export type PlatformSections = Partial<Record<SharePlatform, string>>;

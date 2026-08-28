/**
 * Share module types
 * Platform-agnostic types for sharing functionality
 */

import type { ShareMediaType, ShareStatus } from '@gruenerator/contracts';

// Social media platforms for sharing (subset of generators.SocialPlatform)
export type SharePlatform = 'instagram' | 'facebook' | 'twitter' | 'linkedin' | 'pressemitteilung';

/**
 * Media type and status both cross the wire — as `?type=`/`?status=` on the
 * share list endpoints and back on every share row — so the unions live in
 * `@gruenerator/contracts` (`shareMediaTypeSchema`, `shareStatusSchema`) and
 * are re-exported here for the callers that already import from this module.
 * Restating them would put the closed set in two places with nothing keeping
 * them in step.
 */
export type { ShareMediaType, ShareStatus };

/**
 * Which product made an image — the Studio gallery's Sharepic/KI split.
 * The classification helpers live in `../media-library/contentOrigin.js`; the
 * union is restated here so the share types keep no dependency on that module.
 */
export type ShareContentOrigin = 'ki' | 'sharepic' | 'upload' | 'unknown';

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
  /**
   * Absent against a backend older than the column — callers must fall back to
   * `classifyLegacyImageType(imageType)` rather than assuming a value.
   */
  contentOrigin?: ShareContentOrigin;
  imageMetadata?: ShareImageMetadata;
}

export interface ShareImageMetadata {
  width?: number;
  height?: number;
  hasOriginalImage?: boolean;
  originalImageFilename?: string;
  generatedAt?: string;
  updatedAt?: string;
  /** Compact BlurHash for an instant placeholder (set once variants exist). */
  blurhash?: string;
  /** Widths (px) of the pre-generated responsive WebP/AVIF variants. */
  variants?: number[];
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
  /**
   * Declare which product produced this image. Callers that know their own
   * context should always pass it — the server's fallback derivation exists only
   * for clients too old to send it.
   */
  contentOrigin?: 'ki' | 'sharepic';
  metadata?: Record<string, unknown>;
  originalImage?: string;
  status?: ShareStatus;
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
  publishShare: (shareToken: string) => Promise<Share>;
  fetchUserShares: (mediaType?: ShareMediaType, status?: ShareStatus) => Promise<Share[]>;
  fetchImageShares: () => Promise<Share[]>;
  fetchVideoShares: () => Promise<Share[]>;
  deleteShare: (shareToken: string) => Promise<boolean>;
  clearCurrentShare: () => void;
  setCurrentShare: (share: Share | null) => void;
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

/**
 * Parsed platform sections from markdown content
 */
export type PlatformSections = Partial<Record<SharePlatform, string>>;

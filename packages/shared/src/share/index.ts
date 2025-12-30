/**
 * Share module
 * Platform-agnostic sharing functionality for Grünerator web and mobile apps
 */

// Types
export type {
  SharePlatform,
  ShareMediaType,
  ShareStatus,
  Share,
  ShareImageMetadata,
  CreateVideoShareParams,
  CreateImageShareParams,
  UpdateImageShareParams,
  PlatformConfig,
  ShareStoreState,
  ShareStoreActions,
  ShareResponse,
  ShareListResponse,
  DeleteShareResponse,
  PlatformSections,
} from './types';

// Constants
export {
  PLATFORM_CONFIGS,
  PLATFORM_MAPPINGS,
  DEFAULT_SHARE_PLATFORMS,
  SHARE_LIMITS,
  SHARE_STATUS_LABELS,
} from './constants';

// Utils
export {
  normalizePlatformId,
  parsePlatformSections,
  getPlatformDisplayName,
  hasPlatformShareUrl,
  getShareUrl,
  getSubtitlerShareUrl,
  getBaseUrl,
  getPlatformShareUrl,
} from './utils';

// API
export {
  SHARE_ENDPOINTS,
  createVideoShare,
  createVideoShareFromToken,
  createImageShare,
  updateImageShare,
  getUserShares,
  getShareInfo,
  deleteShare,
  shareApi,
} from './api';

// Hooks / Store
export { useShareStore } from './hooks';

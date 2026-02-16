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
} from './types.js';

// Constants
export {
  PLATFORM_CONFIGS,
  PLATFORM_MAPPINGS,
  DEFAULT_SHARE_PLATFORMS,
  SHARE_LIMITS,
  SHARE_STATUS_LABELS,
} from './constants.js';

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
} from './utils/index.js';

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
  getUserDevices,
  pushToPhone,
} from './api/index.js';

export type { UserDevice, PushToPhoneResponse, DevicesResponse } from './api/index.js';

// Hooks / Store
export { useShareStore } from './hooks/index.js';

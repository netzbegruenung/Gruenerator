/**
 * Share utils barrel export
 */

export {
  normalizePlatformId,
  parsePlatformSections,
  getPlatformDisplayName,
  hasPlatformShareUrl,
} from './platformTextParser.js';

export {
  getShareUrl,
  getSubtitlerShareUrl,
  getBaseUrl,
  getPlatformShareUrl,
} from './urlGenerator.js';

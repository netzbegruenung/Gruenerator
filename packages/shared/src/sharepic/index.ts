/**
 * Sharepic Module
 * Shared sharepic generation functionality for web and mobile.
 */

// Types
export type {
  SharepicType,
  SharepicTypeOption,
  SharepicAttachment,
  SharepicRequest,
  SharepicGenerationOptions,
  SharepicResult,
  DefaultSharepicsResponse,
  SharepicResponse,
} from './types.js';

// Constants
export {
  SHAREPIC_TYPES,
  SHAREPIC_ENDPOINT,
  DEFAULT_SHAREPICS_ENDPOINT,
  SHAREPIC_TYPE_MAP,
  getSharepicTypeOption,
  sharepicTypeSupportsImage,
  sharepicTypeRequiresAuthor,
} from './constants.js';

// Hooks
export { useSharepicGeneration } from './hooks/index.js';
export type { UseSharepicGenerationOptions, UseSharepicGenerationReturn } from './hooks/index.js';

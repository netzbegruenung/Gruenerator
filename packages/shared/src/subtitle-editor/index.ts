/**
 * Subtitle Editor Module
 * Shared types, constants, and utilities for subtitle editing
 */

export type {
  SubtitleSegment,
  SubtitleStylePreference,
  SubtitleHeightPreference,
  SubtitleModificationParams,
  SubtitleEditorState,
  SubtitleEditorActions,
  SubtitleStyleOption,
  SubtitleHeightOption,
} from './subtitle-types.js';

export {
  SUBTITLE_STYLE_OPTIONS,
  SUBTITLE_HEIGHT_OPTIONS,
  DEFAULT_SUBTITLE_PARAMS,
  SUBTITLE_STYLE_CONFIGS,
  TANNE_COLORS,
  HEIGHT_BOTTOM_PERCENT,
  SUBTITLE_EDITOR_LABELS,
  getStyleOption,
  getHeightOption,
  getStyleConfig,
} from './subtitle-constants.js';

export {
  parseSubtitlesText,
  formatSubtitlesToText,
  formatTime,
  formatTimeWithFraction,
  findActiveSegment,
  findActiveSegmentIndex,
  getNextSegment,
  getPreviousSegment,
  validateSegment,
  cloneSegments,
  segmentsEqual,
} from './subtitle-utils.js';

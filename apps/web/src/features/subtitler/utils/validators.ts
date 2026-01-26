/**
 * Type guard validators for runtime type checking
 *
 * Replaces unsafe type assertions (e.g., `as CorrectionResponse`) with
 * proper runtime validation. Critical for SubtitleEditor.tsx line 663.
 */

import type {
  CorrectionResponse,
  CorrectionItem,
  VideoMetadata,
  SubtitleSegment,
  LoadedProject,
} from '../types';

/**
 * Type guard for CorrectionResponse
 *
 * Validates API response structure before type assertion.
 * Replaces unsafe `as CorrectionResponse` in SubtitleEditor.tsx line 663.
 *
 * @param data - Unknown data from API
 * @returns true if data matches CorrectionResponse interface
 */
export function isCorrectionResponse(data: unknown): data is CorrectionResponse {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const response = data as Record<string, unknown>;

  // Check required boolean field
  if (typeof response.hasCorrections !== 'boolean') {
    return false;
  }

  // Check corrections array
  if (!Array.isArray(response.corrections)) {
    return false;
  }

  // Validate each correction item
  return response.corrections.every((item: unknown) => isCorrectionItem(item));
}

/**
 * Type guard for CorrectionItem
 *
 * @param data - Unknown data
 * @returns true if data matches CorrectionItem interface
 */
export function isCorrectionItem(data: unknown): data is CorrectionItem {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const item = data as Record<string, unknown>;

  return typeof item.id === 'number' && typeof item.corrected === 'string';
}

/**
 * Type guard for VideoMetadata
 *
 * @param data - Unknown data
 * @returns true if data matches VideoMetadata interface
 */
export function isVideoMetadata(data: unknown): data is VideoMetadata {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const metadata = data as Record<string, unknown>;

  // Required fields
  if (typeof metadata.width !== 'number' || typeof metadata.height !== 'number') {
    return false;
  }

  // Optional fields validation
  if (metadata.duration !== undefined && typeof metadata.duration !== 'number') {
    return false;
  }

  if (metadata.size !== undefined && typeof metadata.size !== 'number') {
    return false;
  }

  if (metadata.filename !== undefined && typeof metadata.filename !== 'string') {
    return false;
  }

  return true;
}

/**
 * Type guard for SubtitleSegment
 *
 * @param data - Unknown data
 * @returns true if data matches SubtitleSegment interface
 */
export function isSubtitleSegment(data: unknown): data is SubtitleSegment {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const segment = data as Record<string, unknown>;

  return (
    typeof segment.id === 'number' &&
    typeof segment.startTime === 'number' &&
    typeof segment.endTime === 'number' &&
    typeof segment.text === 'string'
  );
}

/**
 * Type guard for SubtitleSegment array
 *
 * @param data - Unknown data
 * @returns true if data is array of SubtitleSegment
 */
export function isSubtitleSegmentArray(data: unknown): data is SubtitleSegment[] {
  if (!Array.isArray(data)) {
    return false;
  }

  return data.every((item) => isSubtitleSegment(item));
}

/**
 * Type guard for LoadedProject
 *
 * @param data - Unknown data
 * @returns true if data matches LoadedProject interface
 */
export function isLoadedProject(data: unknown): data is LoadedProject {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const project = data as Record<string, unknown>;

  // Required field
  if (typeof project.id !== 'string') {
    return false;
  }

  // Optional fields validation
  const optionalStringFields = [
    'uploadId',
    'subtitles',
    'title',
    'stylePreference',
    'heightPreference',
    'modePreference',
    'videoFilename',
    'createdAt',
    'updatedAt',
  ];

  for (const field of optionalStringFields) {
    if (project[field] !== undefined && typeof project[field] !== 'string') {
      return false;
    }
  }

  const optionalNumberFields = ['videoSize'];
  for (const field of optionalNumberFields) {
    if (project[field] !== undefined && typeof project[field] !== 'number') {
      return false;
    }
  }

  // Validate nested videoMetadata if present
  if (project.videoMetadata !== undefined && project.videoMetadata !== null) {
    if (!isVideoMetadata(project.videoMetadata)) {
      return false;
    }
  }

  return true;
}

/**
 * Assert correction response or throw
 *
 * Helper function for cleaner error handling.
 * Use this instead of unsafe type assertions.
 *
 * @param data - Unknown data from API
 * @param context - Context string for error message
 * @returns Validated CorrectionResponse
 * @throws Error if validation fails
 */
export function assertCorrectionResponse(
  data: unknown,
  context = 'API response'
): CorrectionResponse {
  if (!isCorrectionResponse(data)) {
    throw new Error(`Invalid correction response format in ${context}`);
  }
  return data;
}

/**
 * Assert video metadata or throw
 *
 * @param data - Unknown data
 * @param context - Context string for error message
 * @returns Validated VideoMetadata
 * @throws Error if validation fails
 */
export function assertVideoMetadata(data: unknown, context = 'video metadata'): VideoMetadata {
  if (!isVideoMetadata(data)) {
    throw new Error(`Invalid video metadata format in ${context}`);
  }
  return data;
}

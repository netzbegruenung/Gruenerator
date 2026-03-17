/**
 * Type guard validators for runtime type checking
 */

import type { VideoMetadata, SubtitleSegment, LoadedProject } from '../types';

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

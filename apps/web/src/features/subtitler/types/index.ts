/**
 * Central type definitions for the Subtitler feature
 *
 * This file provides a single source of truth for all TypeScript types
 * used throughout the subtitler feature, eliminating broad index signatures
 * and implicit any types.
 */

import type { HeightPreference, StylePreference, SubtitlePreference } from '@gruenerator/contracts';

/**
 * Represents a single subtitle segment with timing information
 */
export interface SubtitleSegment {
  id: number;
  startTime: number; // Time in seconds
  endTime: number; // Time in seconds
  text: string;
}

/**
 * Video metadata information
 */
export interface VideoMetadata {
  width: number;
  height: number;
  duration?: number;
  size?: number;
  filename?: string;
}

/**
 * Subtitle preferences — re-exported from the contract, never re-declared.
 *
 * These used to be hand-written here and had drifted: `SubtitlePreference` read
 * `'manual' | 'auto'`, while the server has always accepted `'manual' | 'word'`.
 * `'auto'` was never a value the backend understood.
 */
export type { StylePreference, HeightPreference, SubtitlePreference };

/**
 * Export process status
 */
export type ExportStatus = 'idle' | 'starting' | 'exporting' | 'complete' | 'error';

/**
 * Loaded project data structure with explicit properties
 * Replaces broad [key: string]: unknown index signature
 */
export interface LoadedProject {
  id: string;
  uploadId?: string;
  subtitles?: string;
  title?: string;
  stylePreference?: StylePreference;
  heightPreference?: HeightPreference;
  modePreference?: SubtitlePreference;
  videoMetadata?: VideoMetadata;
  videoFilename?: string;
  videoSize?: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Style calculation result from styling service
 */
export interface StyleCalculationResult {
  fontSize: number;
  marginL: number;
  marginR: number;
  outline: number;
  width: number;
  height: number;
  isVertical: boolean;
}

/**
 * Video segment for export
 */
export interface VideoSegment {
  start: number;
  end: number;
}

/**
 * Subtitle configuration for export
 */
export interface SubtitleConfig {
  segments: SubtitleSegment[];
  stylePreference: StylePreference;
  heightPreference: HeightPreference;
  locale: string;
}

/**
 * Export options
 */
export interface ExportOptions {
  projectId?: string;
  includeSubtitles?: boolean;
  subtitleConfig?: SubtitleConfig;
}

/**
 * Upload video metadata from backend
 */
export interface UploadVideoMetadata {
  duration?: number;
  width?: number;
  height?: number;
  size?: number;
  filename?: string;
}

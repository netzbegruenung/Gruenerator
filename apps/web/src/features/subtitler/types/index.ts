/**
 * Central type definitions for the Subtitler feature
 *
 * This file provides a single source of truth for all TypeScript types
 * used throughout the subtitler feature, eliminating broad index signatures
 * and implicit any types.
 */

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
 * Available subtitle style preferences
 */
export type StylePreference =
  | 'standard'
  | 'clean'
  | 'shadow'
  | 'tanne'
  | 'gj_clean'
  | 'gj_shadow'
  | 'gj_lavendel'
  | 'gj_hellgruen';

/**
 * Subtitle vertical position preferences
 */
export type HeightPreference = 'tief' | 'standard';

/**
 * Subtitle generation mode preferences
 */
export type SubtitlePreference = 'manual' | 'auto';

/**
 * Export process status
 */
export type ExportStatus = 'idle' | 'starting' | 'exporting' | 'complete' | 'error';

/**
 * Single correction item from AI correction response
 */
export interface CorrectionItem {
  id: number;
  corrected: string;
}

/**
 * AI correction response structure
 */
export interface CorrectionResponse {
  hasCorrections: boolean;
  corrections: CorrectionItem[];
}

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
  modePreference?: string;
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

/**
 * Type definitions for Subtitler Routes
 */

import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { AIWorkerPool } from '../../workers/types.js';

// ============================================================================
// Request Types
// ============================================================================

export interface ProcessRequestBody {
  uploadId: string;
  subtitlePreference?: 'manual' | 'word' | undefined;
  stylePreference?: string | undefined;
  heightPreference?: 'standard' | 'tief' | undefined;
}

export interface ExportRequestBody {
  uploadId?: string | undefined;
  subtitles?: SubtitleSegment[] | string | undefined;
  subtitlePreference?: 'manual' | 'word' | undefined;
  stylePreference?: string | undefined;
  heightPreference?: 'standard' | 'tief' | undefined;
  locale?: string | undefined;
  maxResolution?: number | null | undefined;
  projectId?: string | null | undefined;
  userId?: string | null | undefined;
  textOverlays?: TextOverlay[] | undefined;
  fontSizeOverride?: number | undefined;
  bottomOffsetOverride?: number | undefined;
}

export interface ExportSegmentsRequestBody {
  uploadId?: string | undefined;
  projectId?: string | undefined;
  segments: VideoSegment[];
  includeSubtitles?: boolean | undefined;
  subtitleConfig?: SubtitleConfig | undefined;
}

export interface AutoProcessRequestBody {
  uploadId: string;
  locale?: string | undefined;
  maxResolution?: number | null | undefined;
  userId?: string | null | undefined;
}

export interface CorrectSubtitlesRequestBody {
  segments: SubtitleSegment[];
}

export interface ExportTokenRequestBody {
  uploadId: string;
  subtitles?: SubtitleSegment[] | undefined;
  subtitlePreference?: string | undefined;
  stylePreference?: string | undefined;
  heightPreference?: string | undefined;
  locale?: string | undefined;
  maxResolution?: number | null | undefined;
}

// ============================================================================
// Query Types
// ============================================================================

export interface ResultQueryParams {
  subtitlePreference?: string | undefined;
  stylePreference?: string | undefined;
  heightPreference?: string | undefined;
}

// ============================================================================
// Data Types
// ============================================================================

export interface SubtitleSegment {
  text: string;
  start: number;
  end: number;
  words?: SubtitleWord[] | undefined;
}

export interface SubtitleWord {
  word: string;
  start: number;
  end: number;
}

export interface TextOverlay {
  id: string;
  text: string;
  type: 'header' | 'subheader' | 'custom';
  startTime: number;
  endTime: number;
  style?: Record<string, unknown> | undefined;
}

export interface VideoSegment {
  start: number;
  end: number;
  label?: string | undefined;
}

export interface SubtitleConfig {
  stylePreference?: string | undefined;
  heightPreference?: string | undefined;
  locale?: string | undefined;
  segments?: SubtitleSegment[] | undefined;
}

export interface VideoOriginalFormat {
  codec?: string | undefined;
  audioCodec?: string | null | undefined;
  audioBitrate?: number | null | undefined;
  videoBitrate?: number | null | undefined;
  pixelFormat?: string | undefined;
  profile?: string | undefined;
  level?: number | undefined;
}

export interface VideoMetadata {
  width: number;
  height: number;
  duration?: string | number | undefined;
  fps?: number | undefined;
  /** @deprecated use originalFormat.codec instead */
  codec?: string | undefined;
  /** @deprecated use originalFormat.audioBitrate instead */
  bitrate?: number | undefined;
  rotation?: string | undefined;
  displayAspectRatio?: string | undefined;
  sampleAspectRatio?: string | undefined;
  originalFormat?: VideoOriginalFormat | undefined;
}

// ============================================================================
// Response Types
// ============================================================================

export interface ProcessingStatus {
  status: 'processing' | 'complete' | 'error' | 'not_found' | 'unknown';
  subtitles?: SubtitleSegment[] | undefined;
  error?: string | undefined;
  compression?: CompressionStatus | undefined;
}

export interface CompressionStatus {
  status: string;
  progress?: number | undefined;
  compressedPath?: string | undefined;
}

export interface ExportProgress {
  status: 'exporting' | 'complete' | 'error';
  progress: number;
  timeRemaining?: string | undefined;
  message?: string | undefined;
  outputPath?: string | undefined;
  originalFilename?: string | undefined;
  projectId?: string | null | undefined;
  error?: string | undefined;
}

// ============================================================================
// Background Processing Types
// ============================================================================

export interface BackgroundExportParams {
  inputPath: string;
  outputPath: string;
  segments: SubtitleSegment[];
  metadata: VideoMetadata;
  fileStats: { size: number };
  exportToken: string;
  subtitlePreference: string;
  stylePreference: string;
  heightPreference: string;
  locale?: string | undefined;
  maxResolution?: number | null | undefined;
  finalFontSize: number;
  uploadId: string;
  originalFilename: string;
  assFilePath?: string | null | undefined;
  tempFontPath?: string | null | undefined;
  projectId?: string | null | undefined;
  userId?: string | null | undefined;
  textOverlays?: TextOverlay[] | undefined;
}

// ============================================================================
// Project Types
// ============================================================================

export interface CreateProjectRequestBody {
  uploadId: string;
  subtitles?: string | undefined;
  title?: string | undefined;
  stylePreference?: string | undefined;
  heightPreference?: string | undefined;
  modePreference?: string | undefined;
  videoMetadata?: Record<string, unknown> | undefined;
  videoFilename?: string | undefined;
  videoSize?: number | undefined;
}

export interface UpdateProjectRequestBody {
  title?: string | undefined;
  subtitles?: string | undefined;
  stylePreference?: string | undefined;
  heightPreference?: string | undefined;
  status?: string | undefined;
}

// ============================================================================
// Share Types
// ============================================================================

export interface CreateShareRequestBody {
  exportToken: string;
  title?: string | undefined;
  projectId?: string | undefined;
  expiresInDays?: number | undefined;
}

export interface CreateShareFromProjectRequestBody {
  projectId: string;
  title?: string | undefined;
  expiresInDays?: number | undefined;
}

export interface ShareInfo {
  shareToken: string;
  shareUrl: string;
  expiresAt: Date | string;
  status?: 'ready' | 'rendering' | 'failed' | undefined;
}

export interface ShareDetails {
  title: string;
  duration: number | null;
  thumbnailUrl: string | null;
  expiresAt: Date | string;
  downloadCount: number;
  sharerName?: string | undefined;
  status: string;
}

// ============================================================================
// Social Media Types
// ============================================================================

export interface GenerateSocialRequestBody {
  subtitles: string;
}

export interface SocialMediaResult {
  content: string;
  metadata?: Record<string, unknown> | undefined;
}

// ============================================================================
// Redis Job Types
// ============================================================================

export interface RedisJobData {
  status: 'processing' | 'complete' | 'error';
  data?: Record<string, unknown> | undefined;
}

// ============================================================================
// Express Extended Types
// ============================================================================

export interface SubtitlerRequest extends AuthenticatedRequest {
  app: {
    locals: {
      aiWorkerPool?: AIWorkerPool | undefined;
    };
  } & AuthenticatedRequest['app'];
}

export type { AIWorkerPool };

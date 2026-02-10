/**
 * Type definitions for Subtitler Routes
 */

import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { Response } from 'express';

// ============================================================================
// Request Types
// ============================================================================

export interface ProcessRequestBody {
  uploadId: string;
  subtitlePreference?: 'manual' | 'word';
  stylePreference?: string;
  heightPreference?: 'standard' | 'tief';
}

export interface ExportRequestBody {
  uploadId?: string;
  subtitles?: SubtitleSegment[] | string;
  subtitlePreference?: 'manual' | 'word';
  stylePreference?: string;
  heightPreference?: 'standard' | 'tief';
  locale?: string;
  maxResolution?: number | null;
  projectId?: string | null;
  userId?: string | null;
  textOverlays?: TextOverlay[];
}

export interface ExportSegmentsRequestBody {
  uploadId?: string;
  projectId?: string;
  segments: VideoSegment[];
  includeSubtitles?: boolean;
  subtitleConfig?: SubtitleConfig;
}

export interface AutoProcessRequestBody {
  uploadId: string;
  locale?: string;
  maxResolution?: number | null;
  userId?: string | null;
}

export interface CorrectSubtitlesRequestBody {
  segments: SubtitleSegment[];
}

export interface ExportTokenRequestBody {
  uploadId: string;
  subtitles?: SubtitleSegment[];
  subtitlePreference?: string;
  stylePreference?: string;
  heightPreference?: string;
  locale?: string;
  maxResolution?: number | null;
}

// ============================================================================
// Query Types
// ============================================================================

export interface ResultQueryParams {
  subtitlePreference?: string;
  stylePreference?: string;
  heightPreference?: string;
}

// ============================================================================
// Data Types
// ============================================================================

export interface SubtitleSegment {
  text: string;
  start: number;
  end: number;
  words?: SubtitleWord[];
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
  style?: Record<string, any>;
}

export interface VideoSegment {
  start: number;
  end: number;
  label?: string;
}

export interface SubtitleConfig {
  stylePreference?: string;
  heightPreference?: string;
  locale?: string;
  segments?: SubtitleSegment[];
}

export interface VideoMetadata {
  width: number;
  height: number;
  duration: string | number;
  fps?: number;
  codec?: string;
  bitrate?: number;
}

// ============================================================================
// Response Types
// ============================================================================

export interface ProcessingStatus {
  status: 'processing' | 'complete' | 'error' | 'not_found' | 'unknown';
  subtitles?: SubtitleSegment[];
  error?: string;
  compression?: CompressionStatus;
}

export interface CompressionStatus {
  status: string;
  progress?: number;
  compressedPath?: string;
}

export interface ExportProgress {
  status: 'exporting' | 'complete' | 'error';
  progress: number;
  timeRemaining?: string;
  message?: string;
  outputPath?: string;
  originalFilename?: string;
  projectId?: string | null;
  error?: string;
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
  locale?: string;
  maxResolution?: number | null;
  finalFontSize: number;
  uploadId: string;
  originalFilename: string;
  assFilePath?: string | null;
  tempFontPath?: string | null;
  projectId?: string | null;
  userId?: string | null;
  textOverlays?: TextOverlay[];
}

// ============================================================================
// Project Types
// ============================================================================

export interface CreateProjectRequestBody {
  uploadId: string;
  subtitles?: string;
  title?: string;
  stylePreference?: string;
  heightPreference?: string;
  modePreference?: string;
  videoMetadata?: Record<string, any>;
  videoFilename?: string;
  videoSize?: number;
}

export interface UpdateProjectRequestBody {
  title?: string;
  subtitles?: string;
  stylePreference?: string;
  heightPreference?: string;
  status?: string;
}

// ============================================================================
// Share Types
// ============================================================================

export interface CreateShareRequestBody {
  exportToken: string;
  title?: string;
  projectId?: string;
  expiresInDays?: number;
}

export interface CreateShareFromProjectRequestBody {
  projectId: string;
  title?: string;
  expiresInDays?: number;
}

export interface ShareInfo {
  shareToken: string;
  shareUrl: string;
  expiresAt: Date | string;
  status?: 'ready' | 'rendering' | 'failed';
}

export interface ShareDetails {
  title: string;
  duration: number | null;
  thumbnailUrl: string | null;
  expiresAt: Date | string;
  downloadCount: number;
  sharerName?: string;
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
  metadata?: Record<string, any>;
}

// ============================================================================
// Redis Job Types
// ============================================================================

export interface RedisJobData {
  status: 'processing' | 'complete' | 'error';
  data?: any;
}

// ============================================================================
// Express Extended Types
// ============================================================================

export interface SubtitlerRequest extends AuthenticatedRequest {
  app: {
    locals: {
      aiWorkerPool?: AIWorkerPool;
    };
  } & AuthenticatedRequest['app'];
}

export interface AIWorkerPool {
  processRequest(params: {
    type: string;
    systemPrompt: string;
    messages: Array<{ role: string; content: string }>;
    options?: {
      max_tokens?: number;
      temperature?: number;
    };
  }): Promise<{
    success: boolean;
    content?: string;
    error?: string;
    metadata?: Record<string, any>;
  }>;
}

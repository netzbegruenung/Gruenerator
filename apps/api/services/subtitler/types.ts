/**
 * Subtitler Service Types
 *
 * Type definitions for video subtitler project management
 */

/**
 * Subtitler project data stored in database
 */
export interface SubtitlerProject {
  id: string;
  user_id: string;
  title: string;
  status: 'saved' | 'exported' | 'processing';
  video_path: string;
  video_filename: string;
  video_size: number;
  video_metadata: Record<string, unknown>;
  thumbnail_path: string | null;
  subtitled_video_path: string | null;
  subtitles: string;
  style_preference: string;
  height_preference: string;
  mode_preference: string;
  style_settings: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
  last_edited_at: Date | string;
  export_count: number;
}

/**
 * Project list item (subset of full project data)
 */
export interface SubtitlerProjectListItem {
  id: string;
  title: string;
  status: string;
  video_filename: string;
  video_size: number;
  video_metadata: Record<string, unknown>;
  thumbnail_path: string | null;
  subtitled_video_path: string | null;
  style_preference: string;
  height_preference: string;
  mode_preference: string;
  created_at: Date | string;
  updated_at: Date | string;
  last_edited_at: Date | string;
  export_count: number;
}

/**
 * Data for creating a new project
 */
export interface CreateProjectData {
  uploadId: string;
  subtitles?: string | undefined;
  title?: string | undefined;
  stylePreference?: string | undefined;
  heightPreference?: string | undefined;
  modePreference?: string | undefined;
  videoMetadata?: Record<string, unknown> | undefined;
  videoFilename?: string | undefined;
  videoSize?: number | undefined;
  videoSourcePath?: string | undefined;
}

/**
 * Data for updating an existing project
 */
export interface UpdateProjectData {
  title?: string | undefined;
  subtitles?: string | undefined;
  style_preference?: string | undefined;
  stylePreference?: string | undefined;
  height_preference?: string | undefined;
  heightPreference?: string | undefined;
  style_settings?: Record<string, unknown> | undefined;
  styleSettings?: Record<string, unknown> | undefined;
  status?: string | undefined;
}

/**
 * Project deletion result
 */
export interface DeleteProjectResult {
  success: boolean;
}

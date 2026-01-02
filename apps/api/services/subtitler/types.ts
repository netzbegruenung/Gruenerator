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
  video_metadata: Record<string, any>;
  thumbnail_path: string | null;
  subtitled_video_path: string | null;
  subtitles: string;
  style_preference: string;
  height_preference: string;
  mode_preference: string;
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
  video_metadata: Record<string, any>;
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
  subtitles?: string;
  title?: string;
  stylePreference?: string;
  heightPreference?: string;
  modePreference?: string;
  videoMetadata?: Record<string, any>;
  videoFilename?: string;
  videoSize?: number;
  videoSourcePath?: string;
}

/**
 * Data for updating an existing project
 */
export interface UpdateProjectData {
  title?: string;
  subtitles?: string;
  style_preference?: string;
  stylePreference?: string;
  height_preference?: string;
  heightPreference?: string;
  status?: string;
}

/**
 * Project deletion result
 */
export interface DeleteProjectResult {
  success: boolean;
}

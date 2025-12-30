/**
 * Project types for Reel Studio
 * Shared between web frontend and mobile app
 */

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
}

export interface Project {
  id: string;
  user_id: string;
  title: string;
  upload_id: string;
  thumbnail_path: string | null;
  video_path: string | null;
  video_metadata: VideoMetadata | null;
  video_size: number;
  video_filename: string | null;
  style_preference: string;
  height_preference: string;
  mode_preference: string | null;
  subtitles: string | null;
  export_count: number;
  last_edited_at: string;
  created_at: string;
}

export interface ProjectsState {
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  saveSuccess: boolean;
  initialFetchComplete: boolean;
}

export interface ProjectsActions {
  fetchProjects: () => Promise<void>;
  loadProject: (projectId: string) => Promise<Project>;
  saveProject: (projectData: SaveProjectData) => Promise<Project>;
  updateProject: (projectId: string, updates: UpdateProjectData) => Promise<Project>;
  deleteProject: (projectId: string) => Promise<void>;
  setCurrentProject: (project: Project | null) => void;
  clearCurrentProject: () => void;
  clearError: () => void;
  reset: () => void;
}

export interface ProjectsApiResponse {
  success: boolean;
  projects?: Project[];
  project?: Project;
  isNew?: boolean;
  error?: string;
}

export interface SaveProjectData {
  uploadId: string;
  subtitles?: string;
  title?: string;
  stylePreference?: string;
  heightPreference?: string;
  modePreference?: string;
  videoMetadata?: VideoMetadata;
  videoFilename?: string;
  videoSize?: number;
}

export interface UpdateProjectData {
  subtitles?: string;
  title?: string;
  stylePreference?: string;
  heightPreference?: string;
}

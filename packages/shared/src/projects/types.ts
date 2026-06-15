/**
 * Project types for Reel Studio
 * Shared between web frontend and mobile app
 */

import type { SubtitleSegment } from '@gruenerator/contracts';

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
}

export interface Project {
  id: string;
  user_id: string;
  title: string;
  // Only present on client-constructed temp projects (`temp-<uploadId>`).
  // The server consumes uploadId at create time (copies the video out of
  // tus-temp) and never stores it — server-returned rows have no upload_id.
  upload_id: string | null;
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
  // Canonical segment array from @gruenerator/contracts. The backend
  // `projectDataBodySchema.subtitles` is `z.array(subtitleSegmentSchema)`,
  // so the on-wire shape is `SubtitleSegment[]`, not an SRT string. The
  // pre-2026-04-13 type had this as `string`, which silently let the
  // frontend send an unparseable SRT blob and silently 400'd the save.
  // See `packages/contracts/src/schemas/subtitler.ts` for the unification
  // history — this is the final missing piece of that migration.
  subtitles?: SubtitleSegment[];
  title?: string;
  stylePreference?: string;
  heightPreference?: string;
  modePreference?: string;
  videoMetadata?: VideoMetadata;
  // Required by `projectDataBodySchema` (`z.string()`): the server keys
  // find-or-update on it and 500s on `undefined`. Was `?:` here, which let
  // mobile callers omit it and break the save at runtime.
  videoFilename: string;
  videoSize?: number;
}

export interface UpdateProjectData {
  // Transitional union mirroring `updateProjectBodySchema`: the canonical
  // wire shape is `SubtitleSegment[]`; the text-format string remains
  // accepted (and is normalized server-side) so clients deployed against
  // an older server keep working. Switch senders to segments once the
  // server-side normalization (ProjectService.updateProject) is deployed.
  subtitles?: string | SubtitleSegment[];
  title?: string;
  stylePreference?: string;
  heightPreference?: string;
}

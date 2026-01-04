/**
 * Subtitle Editor Types
 * Shared TypeScript interfaces for subtitle editing across web and mobile
 */

/**
 * Individual subtitle segment with timing and text
 */
export interface SubtitleSegment {
  id: number;
  startTime: number;
  endTime: number;
  text: string;
}

/**
 * Available subtitle style presets
 * - shadow: Text with drop shadow (recommended)
 * - standard: Black background with outline
 * - clean: Transparent, no shadow
 * - tanne: Green background (#005538)
 */
export type SubtitleStylePreference =
  | 'shadow'
  | 'standard'
  | 'clean'
  | 'tanne';

/**
 * Subtitle vertical position on screen
 * - tief: 20% from bottom (default)
 * - standard: 33% from bottom (mid-height)
 */
export type SubtitleHeightPreference = 'tief' | 'standard';

/**
 * Combined modification parameters for subtitle styling
 */
export interface SubtitleModificationParams {
  stylePreference: SubtitleStylePreference;
  heightPreference: SubtitleHeightPreference;
}

/**
 * Complete state interface for subtitle editor
 */
export interface SubtitleEditorState {
  projectId: string | null;
  uploadId: string | null;
  segments: SubtitleSegment[];
  originalSegments: SubtitleSegment[];
  stylePreference: SubtitleStylePreference;
  heightPreference: SubtitleHeightPreference;
  currentTime: number;
  duration: number;
  editingSegmentId: number | null;
  selectedSegmentId: number | null;
  hasUnsavedChanges: boolean;
}

/**
 * Actions for subtitle editor store
 */
export interface SubtitleEditorActions {
  loadProject: (
    projectId: string,
    uploadId: string,
    subtitles: string | null,
    stylePreference: SubtitleStylePreference,
    heightPreference: SubtitleHeightPreference,
    duration: number
  ) => void;
  setSegments: (segments: SubtitleSegment[]) => void;
  updateSegmentText: (segmentId: number, text: string) => void;
  setStylePreference: (style: SubtitleStylePreference) => void;
  setHeightPreference: (height: SubtitleHeightPreference) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  selectSegment: (segmentId: number | null) => void;
  startEditing: (segmentId: number) => void;
  stopEditing: () => void;
  reset: () => void;
  markAsSaved: () => void;
  setProjectId: (newProjectId: string) => void;
}

/**
 * Style option configuration for UI
 */
export interface SubtitleStyleOption {
  value: SubtitleStylePreference;
  label: string;
  description: string;
}

/**
 * Height option configuration for UI
 */
export interface SubtitleHeightOption {
  value: SubtitleHeightPreference;
  label: string;
  bottomPercent: number;
}

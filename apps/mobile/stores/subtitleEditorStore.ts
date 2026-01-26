/**
 * Subtitle Editor Store
 * Mobile Zustand store for subtitle editing state management
 */

import { create } from 'zustand';
import type {
  SubtitleSegment,
  SubtitleStylePreference,
  SubtitleHeightPreference,
  SubtitleEditorState,
  SubtitleEditorActions,
} from '@gruenerator/shared/subtitle-editor';
import {
  parseSubtitlesText,
  cloneSegments,
  segmentsEqual,
  DEFAULT_SUBTITLE_PARAMS,
} from '@gruenerator/shared/subtitle-editor';

type SubtitleEditorStore = SubtitleEditorState &
  SubtitleEditorActions & {
    isSaving: boolean;
    error: string | null;
  };

const initialState: SubtitleEditorState & { isSaving: boolean; error: string | null } = {
  projectId: null,
  uploadId: null,
  segments: [],
  originalSegments: [],
  stylePreference: DEFAULT_SUBTITLE_PARAMS.stylePreference,
  heightPreference: DEFAULT_SUBTITLE_PARAMS.heightPreference,
  currentTime: 0,
  duration: 0,
  editingSegmentId: null,
  selectedSegmentId: null,
  hasUnsavedChanges: false,
  isSaving: false,
  error: null,
};

export const useSubtitleEditorStore = create<SubtitleEditorStore>()((set, get) => ({
  ...initialState,

  loadProject: (
    projectId: string,
    uploadId: string,
    subtitles: string | null,
    stylePreference: SubtitleStylePreference,
    heightPreference: SubtitleHeightPreference,
    duration: number
  ) => {
    const segments = parseSubtitlesText(subtitles);
    set({
      projectId,
      uploadId,
      segments,
      originalSegments: cloneSegments(segments),
      stylePreference,
      heightPreference,
      duration,
      currentTime: 0,
      editingSegmentId: null,
      selectedSegmentId: null,
      hasUnsavedChanges: false,
      error: null,
    });
  },

  setSegments: (segments: SubtitleSegment[]) => {
    const { originalSegments } = get();
    set({
      segments,
      hasUnsavedChanges: !segmentsEqual(segments, originalSegments),
    });
  },

  updateSegmentText: (segmentId: number, text: string) => {
    const { segments, originalSegments } = get();
    const updatedSegments = segments.map((segment) =>
      segment.id === segmentId ? { ...segment, text } : segment
    );
    set({
      segments: updatedSegments,
      hasUnsavedChanges: !segmentsEqual(updatedSegments, originalSegments),
    });
  },

  setStylePreference: (style: SubtitleStylePreference) => {
    set({
      stylePreference: style,
      hasUnsavedChanges: true,
    });
  },

  setHeightPreference: (height: SubtitleHeightPreference) => {
    set({
      heightPreference: height,
      hasUnsavedChanges: true,
    });
  },

  setCurrentTime: (time: number) => {
    set({ currentTime: time });
  },

  setDuration: (duration: number) => {
    set({ duration });
  },

  selectSegment: (segmentId: number | null) => {
    set({
      selectedSegmentId: segmentId,
      editingSegmentId: null,
    });
  },

  startEditing: (segmentId: number) => {
    set({
      editingSegmentId: segmentId,
      selectedSegmentId: segmentId,
    });
  },

  stopEditing: () => {
    set({ editingSegmentId: null });
  },

  reset: () => {
    set(initialState);
  },

  markAsSaved: () => {
    const { segments } = get();
    set({
      originalSegments: cloneSegments(segments),
      hasUnsavedChanges: false,
      isSaving: false,
    });
  },

  setProjectId: (newProjectId: string) => {
    set({ projectId: newProjectId });
  },
}));

/**
 * Selector for the active segment at current time
 */
export const selectActiveSegment = (state: SubtitleEditorStore): SubtitleSegment | null => {
  return (
    state.segments.find(
      (segment) => state.currentTime >= segment.startTime && state.currentTime <= segment.endTime
    ) || null
  );
};

/**
 * Selector for the active segment ID at current time
 */
export const selectActiveSegmentId = (state: SubtitleEditorStore): number | null => {
  const segment = state.segments.find(
    (s) => state.currentTime >= s.startTime && state.currentTime <= s.endTime
  );
  return segment?.id ?? null;
};

/**
 * Selector for whether any segment is being edited
 */
export const selectIsEditing = (state: SubtitleEditorStore): boolean => {
  return state.editingSegmentId !== null;
};

/**
 * Selector for formatted current time
 */
export const selectFormattedCurrentTime = (state: SubtitleEditorStore): string => {
  const mins = Math.floor(state.currentTime / 60);
  const secs = Math.floor(state.currentTime % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Selector for formatted duration
 */
export const selectFormattedDuration = (state: SubtitleEditorStore): string => {
  const mins = Math.floor(state.duration / 60);
  const secs = Math.floor(state.duration % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Selector for checking if there are segments to display
 */
export const selectHasSegments = (state: SubtitleEditorStore): boolean => {
  return state.segments.length > 0;
};

/**
 * Selector for checking if project is loaded
 */
export const selectIsProjectLoaded = (state: SubtitleEditorStore): boolean => {
  return state.projectId !== null;
};

/**
 * Selector for getting segment by ID
 */
export const selectSegmentById = (
  state: SubtitleEditorStore,
  segmentId: number
): SubtitleSegment | undefined => {
  return state.segments.find((s) => s.id === segmentId);
};

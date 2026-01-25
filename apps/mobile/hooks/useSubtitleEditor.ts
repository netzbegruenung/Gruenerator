/**
 * useSubtitleEditor Hook
 * Handles video player integration and subtitle editing logic
 */

import { useCallback, useRef, useEffect } from 'react';
import { VideoPlayer } from 'expo-video';
import { FlatList, Alert } from 'react-native';
import { useSubtitleEditorStore, selectActiveSegmentId } from '../stores/subtitleEditorStore';
import { updateProject, saveProject, useProjectsStore } from '@gruenerator/shared';
import {
  formatSubtitlesToText,
  getNextSegment,
  getPreviousSegment,
  SUBTITLE_EDITOR_LABELS,
} from '@gruenerator/shared/subtitle-editor';
import type { SubtitleSegment } from '@gruenerator/shared/subtitle-editor';

const AUTO_SAVE_DELAY_MS = 30000; // 30 seconds

interface UseSubtitleEditorOptions {
  player: VideoPlayer | null;
  timelineRef?: React.RefObject<FlatList<SubtitleSegment> | null>;
}

export function useSubtitleEditor({ player, timelineRef }: UseSubtitleEditorOptions) {
  const lastSeekRef = useRef<number | null>(null);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    projectId,
    segments,
    stylePreference,
    heightPreference,
    currentTime,
    duration,
    selectedSegmentId,
    editingSegmentId,
    hasUnsavedChanges,
    isSaving,
    error,
    setCurrentTime,
    setDuration,
    selectSegment,
    startEditing,
    stopEditing,
    updateSegmentText,
    setStylePreference,
    setHeightPreference,
    markAsSaved,
    reset,
  } = useSubtitleEditorStore();

  const activeSegmentId = useSubtitleEditorStore(selectActiveSegmentId);

  // Track playing state manually to handle null player
  const isPlayingRef = useRef(false);

  useEffect(() => {
    if (!player) return;

    const handleTimeUpdate = () => {
      const time = player.currentTime;
      if (lastSeekRef.current !== null && Math.abs(time - lastSeekRef.current) > 0.5) {
        return;
      }
      lastSeekRef.current = null;
      setCurrentTime(time);
    };

    const handlePlayingChange = () => {
      isPlayingRef.current = player.playing;
    };

    // Set up polling for time updates (expo-video doesn't have event subscriptions in all cases)
    const interval = setInterval(handleTimeUpdate, 100);
    handlePlayingChange();

    return () => {
      clearInterval(interval);
    };
  }, [player, setCurrentTime]);

  const isPlaying = player?.playing ?? false;

  useEffect(() => {
    if (player && duration === 0 && player.duration > 0) {
      setDuration(player.duration);
    }
  }, [player?.duration, duration, setDuration]);

  useEffect(() => {
    if (timelineRef?.current && activeSegmentId !== null) {
      const index = segments.findIndex((s) => s.id === activeSegmentId);
      if (index !== -1) {
        timelineRef.current.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.5,
        });
      }
    }
  }, [activeSegmentId, segments, timelineRef]);

  // Debounced auto-save effect
  useEffect(() => {
    // Skip if no unsaved changes, no project, or already saving
    if (!hasUnsavedChanges || !projectId || isSaving) {
      return;
    }

    // Skip temp projects (they should be rare now with immediate save on process complete)
    if (projectId.startsWith('temp-')) {
      return;
    }

    // Clear any existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Set new timeout for auto-save
    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        const state = useSubtitleEditorStore.getState();
        if (!state.hasUnsavedChanges || state.isSaving) {
          return;
        }

        useSubtitleEditorStore.setState({ isSaving: true, error: null });

        const subtitlesText = formatSubtitlesToText(state.segments);
        await updateProject(state.projectId!, {
          subtitles: subtitlesText,
          stylePreference: state.stylePreference,
          heightPreference: state.heightPreference,
        });

        useSubtitleEditorStore.getState().markAsSaved();
      } catch (err) {
        console.error('[useSubtitleEditor] Auto-save failed:', err);
        useSubtitleEditorStore.setState({ isSaving: false });
      }
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [segments, stylePreference, heightPreference, hasUnsavedChanges, projectId, isSaving]);

  const seekToTime = useCallback(
    (time: number) => {
      if (player) {
        lastSeekRef.current = time;
        player.currentTime = time;
        setCurrentTime(time);
      }
    },
    [player, setCurrentTime]
  );

  const handleSegmentSelect = useCallback(
    (segmentId: number) => {
      const segment = segments.find((s) => s.id === segmentId);
      if (segment) {
        selectSegment(segmentId);
        seekToTime(segment.startTime);
      }
    },
    [segments, selectSegment, seekToTime]
  );

  const handleSegmentTap = useCallback(
    (segmentId: number) => {
      if (selectedSegmentId === segmentId) {
        startEditing(segmentId);
      } else {
        handleSegmentSelect(segmentId);
      }
    },
    [selectedSegmentId, startEditing, handleSegmentSelect]
  );

  const handleTextChange = useCallback(
    (segmentId: number, text: string) => {
      updateSegmentText(segmentId, text);
    },
    [updateSegmentText]
  );

  const handleEditComplete = useCallback(() => {
    stopEditing();
  }, [stopEditing]);

  const goToNextSegment = useCallback(() => {
    if (selectedSegmentId === null && segments.length > 0) {
      handleSegmentSelect(segments[0].id);
      return;
    }

    if (selectedSegmentId !== null) {
      const next = getNextSegment(segments, selectedSegmentId);
      if (next) {
        handleSegmentSelect(next.id);
      }
    }
  }, [selectedSegmentId, segments, handleSegmentSelect]);

  const goToPreviousSegment = useCallback(() => {
    if (selectedSegmentId === null && segments.length > 0) {
      handleSegmentSelect(segments[segments.length - 1].id);
      return;
    }

    if (selectedSegmentId !== null) {
      const prev = getPreviousSegment(segments, selectedSegmentId);
      if (prev) {
        handleSegmentSelect(prev.id);
      }
    }
  }, [selectedSegmentId, segments, handleSegmentSelect]);

  const togglePlayback = useCallback(() => {
    if (!player) return;

    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  }, [player, isPlaying]);

  const saveChanges = useCallback(async (): Promise<boolean> => {
    if (!projectId) {
      return false;
    }

    useSubtitleEditorStore.setState({ isSaving: true, error: null });

    try {
      const subtitlesText = formatSubtitlesToText(segments);
      const isTempProject = projectId.startsWith('temp-');

      if (isTempProject) {
        const uploadId = projectId.replace('temp-', '');

        const { project: newProject } = await saveProject({
          uploadId,
          subtitles: subtitlesText,
          stylePreference,
          heightPreference,
          title: 'Neues Reel',
        });

        useSubtitleEditorStore.getState().setProjectId(newProject.id);

        useProjectsStore.getState().fetchProjects();
      } else {
        await updateProject(projectId, {
          subtitles: subtitlesText,
          stylePreference,
          heightPreference,
        });
      }

      markAsSaved();
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : SUBTITLE_EDITOR_LABELS.errorSaving;
      useSubtitleEditorStore.setState({ error: errorMessage, isSaving: false });
      return false;
    }
  }, [projectId, segments, stylePreference, heightPreference, markAsSaved]);

  const confirmDiscardChanges = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!hasUnsavedChanges) {
        resolve(true);
        return;
      }

      Alert.alert(
        SUBTITLE_EDITOR_LABELS.unsavedChangesTitle,
        SUBTITLE_EDITOR_LABELS.unsavedChangesMessage,
        [
          {
            text: SUBTITLE_EDITOR_LABELS.keepEditingButton,
            style: 'cancel',
            onPress: () => resolve(false),
          },
          {
            text: SUBTITLE_EDITOR_LABELS.discardButton,
            style: 'destructive',
            onPress: () => {
              reset();
              resolve(true);
            },
          },
        ]
      );
    });
  }, [hasUnsavedChanges, reset]);

  return {
    currentTime,
    duration,
    segments,
    selectedSegmentId,
    editingSegmentId,
    activeSegmentId,
    stylePreference,
    heightPreference,
    hasUnsavedChanges,
    isSaving,
    error,
    isPlaying,

    seekToTime,
    handleSegmentSelect,
    handleSegmentTap,
    handleTextChange,
    handleEditComplete,
    goToNextSegment,
    goToPreviousSegment,
    togglePlayback,

    setStylePreference,
    setHeightPreference,

    saveChanges,
    confirmDiscardChanges,
    reset,
  };
}

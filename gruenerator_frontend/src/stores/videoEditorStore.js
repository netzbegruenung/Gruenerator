import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

const CLIP_COLORS = [
  '#46962b', '#0088cc', '#f5a623', '#9b59b6',
  '#e74c3c', '#1abc9c', '#f39c12', '#3498db'
];

const generateClipId = () => `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/**
 * Video Editor Store
 * Manages clips, segments, playback state, and composition for the timeline editor
 * Supports multiple video clips with color-coded segments
 */
const useVideoEditorStore = create(
  immer((set, get) => ({
    // Clips registry - all loaded video clips
    clips: {},

    // Active clip for editing operations
    activeClipId: null,

    // Composition dimensions (from first clip or largest)
    compositionWidth: 0,
    compositionHeight: 0,
    compositionFps: 30,

    // Segments - array of { id, clipId, start, end } representing kept portions
    segments: [],

    // UI state
    currentTime: 0,
    isPlaying: false,
    selectedSegmentId: null,

    // Editor mode
    isEditorActive: false,

    // Text overlays
    textOverlays: [],
    selectedOverlayId: null,

    // Undo/Redo history (saves both clips and segments)
    history: [],
    historyIndex: -1,
    maxHistorySize: 50,

    // Legacy compatibility (kept for existing code)
    videoUrl: null,
    videoFile: null,
    duration: 0,
    fps: 30,
    width: 0,
    height: 0,

    /**
     * Add a new clip to the registry
     */
    addClip: (url, file, metadata, uploadId = null) => {
      const { clips } = get();
      const clipCount = Object.keys(clips).length;
      const clipId = generateClipId();
      const color = CLIP_COLORS[clipCount % CLIP_COLORS.length];

      set((state) => {
        state.clips[clipId] = {
          id: clipId,
          url,
          file,
          uploadId,
          duration: metadata.duration || 0,
          fps: metadata.fps || 30,
          width: metadata.width || 0,
          height: metadata.height || 0,
          name: file?.name || `Clip ${clipCount + 1}`,
          color,
          thumbnail: null,
          order: clipCount
        };

        // Set composition dimensions from first clip
        if (clipCount === 0) {
          state.compositionWidth = metadata.width || 0;
          state.compositionHeight = metadata.height || 0;
          state.compositionFps = metadata.fps || 30;
          state.activeClipId = clipId;

          // Legacy compatibility
          state.videoUrl = url;
          state.videoFile = file;
          state.duration = metadata.duration || 0;
          state.fps = metadata.fps || 30;
          state.width = metadata.width || 0;
          state.height = metadata.height || 0;
        }

        // Create initial segment spanning entire clip
        const maxId = state.segments.length > 0
          ? Math.max(...state.segments.map(s => s.id), 0)
          : 0;

        state.segments.push({
          id: maxId + 1,
          clipId,
          start: 0,
          end: metadata.duration || 0
        });

        state.isEditorActive = true;
      });

      return clipId;
    },

    /**
     * Remove a clip from the registry
     */
    removeClip: (clipId) => {
      const { clips, activeClipId, saveToHistory } = get();

      // Don't remove if it's the last clip
      if (Object.keys(clips).length <= 1) return false;

      saveToHistory();

      set((state) => {
        // Remove the clip
        delete state.clips[clipId];

        // Remove all segments referencing this clip
        state.segments = state.segments.filter(seg => seg.clipId !== clipId);

        // Update active clip if needed
        if (activeClipId === clipId) {
          const remainingClips = Object.keys(state.clips);
          state.activeClipId = remainingClips.length > 0 ? remainingClips[0] : null;
        }

        // Clear selection
        state.selectedSegmentId = null;
      });

      return true;
    },

    /**
     * Set the active clip for editing operations
     */
    setActiveClip: (clipId) => {
      set((state) => {
        if (state.clips[clipId]) {
          state.activeClipId = clipId;
        }
      });
    },

    /**
     * Get a clip by ID
     */
    getClipById: (clipId) => {
      const { clips } = get();
      return clips[clipId] || null;
    },

    /**
     * Get all clips as a sorted array
     */
    getClipsArray: () => {
      const { clips } = get();
      return Object.values(clips).sort((a, b) => a.order - b.order);
    },

    /**
     * Get the total number of clips
     */
    getClipCount: () => {
      const { clips } = get();
      return Object.keys(clips).length;
    },

    /**
     * Check if there are multiple clips
     */
    hasMultipleClips: () => {
      const { clips } = get();
      return Object.keys(clips).length > 1;
    },

    /**
     * Add a new segment from a specific clip
     */
    addSegmentFromClip: (clipId, start = null, end = null) => {
      const { clips, saveToHistory } = get();
      const clip = clips[clipId];
      if (!clip) return null;

      saveToHistory();

      let newSegmentId;
      set((state) => {
        const maxId = state.segments.length > 0
          ? Math.max(...state.segments.map(s => s.id), 0)
          : 0;

        newSegmentId = maxId + 1;
        state.segments.push({
          id: newSegmentId,
          clipId,
          start: start !== null ? start : 0,
          end: end !== null ? end : clip.duration
        });
      });

      return newSegmentId;
    },

    /**
     * Update clip thumbnail
     */
    setClipThumbnail: (clipId, thumbnail) => {
      set((state) => {
        if (state.clips[clipId]) {
          state.clips[clipId].thumbnail = thumbnail;
        }
      });
    },

    /**
     * Update clip upload ID (after TUS upload)
     */
    setClipUploadId: (clipId, uploadId) => {
      set((state) => {
        if (state.clips[clipId]) {
          state.clips[clipId].uploadId = uploadId;
        }
      });
    },

    /**
     * Initialize editor with video metadata (backward compatible)
     * Now internally uses addClip for single video initialization
     */
    initializeVideo: (videoUrl, videoFile, metadata, uploadId = null) => {
      // Reset first
      get().resetEditor();

      // Add as first clip
      get().addClip(videoUrl, videoFile, metadata, uploadId);
    },

    /**
     * Reset editor state
     */
    resetEditor: () => {
      set((state) => {
        // Clear clips
        state.clips = {};
        state.activeClipId = null;
        state.compositionWidth = 0;
        state.compositionHeight = 0;
        state.compositionFps = 30;

        // Clear segments
        state.segments = [];

        // Reset UI state
        state.currentTime = 0;
        state.isPlaying = false;
        state.selectedSegmentId = null;
        state.isEditorActive = false;

        // Reset text overlays
        state.textOverlays = [];
        state.selectedOverlayId = null;

        // Reset history
        state.history = [];
        state.historyIndex = -1;

        // Legacy compatibility
        state.videoUrl = null;
        state.videoFile = null;
        state.duration = 0;
        state.fps = 30;
        state.width = 0;
        state.height = 0;
      });
    },

    /**
     * Split segment at current playhead position
     * Creates two segments from one, preserving clipId
     */
    splitAtPlayhead: () => {
      const { currentTime, segments, composedTimeToOriginal, saveToHistory } = get();

      // Find which segment contains the current time in composed timeline
      let accumulatedTime = 0;
      let segmentIndex = -1;
      let timeInSegment = 0;

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const segDuration = seg.end - seg.start;

        if (currentTime >= accumulatedTime && currentTime < accumulatedTime + segDuration) {
          segmentIndex = i;
          timeInSegment = currentTime - accumulatedTime;
          break;
        }
        accumulatedTime += segDuration;
      }

      if (segmentIndex === -1) return;

      const segment = segments[segmentIndex];
      const splitPoint = segment.start + timeInSegment;

      // Don't split if too close to edges (< 0.5 seconds from start/end)
      if (splitPoint - segment.start < 0.5 || segment.end - splitPoint < 0.5) {
        return;
      }

      // Save to history before making changes
      saveToHistory();

      set((state) => {
        const maxId = Math.max(...state.segments.map(s => s.id), 0);

        // Create two new segments from the split, preserving clipId
        const firstHalf = {
          id: segment.id,
          clipId: segment.clipId,
          start: segment.start,
          end: splitPoint
        };

        const secondHalf = {
          id: maxId + 1,
          clipId: segment.clipId,
          start: splitPoint,
          end: segment.end
        };

        // Replace the original segment with the two halves
        state.segments.splice(segmentIndex, 1, firstHalf, secondHalf);
      });
    },

    /**
     * Delete a segment by ID
     */
    deleteSegment: (segmentId) => {
      const { segments, saveToHistory } = get();

      // Don't delete if only one segment remains
      if (segments.length <= 1) return;

      // Save to history before making changes
      saveToHistory();

      set((state) => {
        state.segments = state.segments.filter(seg => seg.id !== segmentId);
        if (state.selectedSegmentId === segmentId) {
          state.selectedSegmentId = null;
        }
      });
    },

    /**
     * Reorder segments via drag and drop
     */
    reorderSegments: (fromIndex, toIndex) => {
      if (fromIndex === toIndex) return;

      const { saveToHistory } = get();
      saveToHistory();

      set((state) => {
        const [removed] = state.segments.splice(fromIndex, 1);
        state.segments.splice(toIndex, 0, removed);
      });
    },

    /**
     * Select a segment
     */
    selectSegment: (segmentId) => {
      set((state) => {
        state.selectedSegmentId = segmentId;
      });
    },

    /**
     * Update current playback time
     */
    setCurrentTime: (time) => {
      set((state) => {
        state.currentTime = time;
      });
    },

    /**
     * Set playing state
     */
    setIsPlaying: (playing) => {
      set((state) => {
        state.isPlaying = playing;
      });
    },

    /**
     * Trim segment start (adjust in-point)
     * Validates against clip duration
     */
    trimSegmentStart: (segmentId, newStart) => {
      const { clips, segments, saveToHistory } = get();
      const segment = segments.find(s => s.id === segmentId);
      if (!segment) return;

      const clip = clips[segment.clipId];
      const maxStart = clip ? clip.duration : Infinity;

      if (newStart >= 0 && newStart < segment.end - 0.5 && newStart <= maxStart) {
        saveToHistory();
        set((state) => {
          const seg = state.segments.find(s => s.id === segmentId);
          if (seg) seg.start = newStart;
        });
      }
    },

    /**
     * Trim segment end (adjust out-point)
     * Validates against clip duration
     */
    trimSegmentEnd: (segmentId, newEnd) => {
      const { clips, segments, saveToHistory } = get();
      const segment = segments.find(s => s.id === segmentId);
      if (!segment) return;

      const clip = clips[segment.clipId];
      const maxEnd = clip ? clip.duration : Infinity;

      if (newEnd <= maxEnd && newEnd > segment.start + 0.5) {
        saveToHistory();
        set((state) => {
          const seg = state.segments.find(s => s.id === segmentId);
          if (seg) seg.end = newEnd;
        });
      }
    },

    /**
     * Calculate total composed duration (sum of all segment durations)
     */
    getComposedDuration: () => {
      const { segments } = get();
      return segments.reduce((total, seg) => total + (seg.end - seg.start), 0);
    },

    /**
     * Get total duration of all clips (used as fixed timeline reference)
     */
    getTotalClipsDuration: () => {
      const { clips } = get();
      return Object.values(clips).reduce((total, clip) => total + (clip.duration || 0), 0);
    },

    /**
     * Convert composed time to original video time
     * Used for seeking in the composition
     */
    composedTimeToOriginal: (composedTime) => {
      const { segments } = get();
      let accumulated = 0;

      for (const segment of segments) {
        const segmentDuration = segment.end - segment.start;
        if (composedTime < accumulated + segmentDuration) {
          return segment.start + (composedTime - accumulated);
        }
        accumulated += segmentDuration;
      }

      // If past the end, return the last segment's end
      if (segments.length > 0) {
        return segments[segments.length - 1].end;
      }
      return 0;
    },

    /**
     * Convert original video time to composed time
     */
    originalTimeToComposed: (originalTime) => {
      const { segments } = get();
      let composed = 0;

      for (const segment of segments) {
        if (originalTime >= segment.start && originalTime <= segment.end) {
          return composed + (originalTime - segment.start);
        }
        if (originalTime > segment.end) {
          composed += segment.end - segment.start;
        }
      }

      return composed;
    },

    /**
     * Save current state to history (call before making changes)
     * Saves both clips and segments for full undo/redo support
     */
    saveToHistory: () => {
      const { clips, segments, textOverlays, history, historyIndex, maxHistorySize } = get();

      set((state) => {
        // Remove any future states if we're not at the end of history
        const newHistory = state.history.slice(0, state.historyIndex + 1);

        // Add current state to history (deep copy clips, segments, and textOverlays)
        newHistory.push({
          clips: JSON.parse(JSON.stringify(clips)),
          segments: JSON.parse(JSON.stringify(segments)),
          textOverlays: JSON.parse(JSON.stringify(textOverlays))
        });

        // Limit history size
        if (newHistory.length > maxHistorySize) {
          newHistory.shift();
        } else {
          state.historyIndex = newHistory.length - 1;
        }

        state.history = newHistory;
        state.historyIndex = newHistory.length - 1;
      });
    },

    /**
     * Undo last action
     * Restores both clips and segments
     */
    undo: () => {
      const { historyIndex, history, clips, segments, textOverlays } = get();

      if (historyIndex < 0 || history.length === 0) return;

      set((state) => {
        // If at the end of history, save current state first for redo
        if (state.historyIndex === state.history.length - 1) {
          state.history.push({
            clips: JSON.parse(JSON.stringify(clips)),
            segments: JSON.parse(JSON.stringify(segments)),
            textOverlays: JSON.parse(JSON.stringify(textOverlays))
          });
          state.historyIndex = state.history.length - 1;
        }

        // Move back in history
        if (state.historyIndex > 0) {
          state.historyIndex -= 1;
          const snapshot = state.history[state.historyIndex];
          state.clips = JSON.parse(JSON.stringify(snapshot.clips));
          state.segments = JSON.parse(JSON.stringify(snapshot.segments));
          state.textOverlays = JSON.parse(JSON.stringify(snapshot.textOverlays || []));
          state.selectedSegmentId = null;
          state.selectedOverlayId = null;
        } else if (state.historyIndex === 0) {
          // Restore to the first state
          const snapshot = state.history[0];
          state.clips = JSON.parse(JSON.stringify(snapshot.clips));
          state.segments = JSON.parse(JSON.stringify(snapshot.segments));
          state.textOverlays = JSON.parse(JSON.stringify(snapshot.textOverlays || []));
          state.historyIndex = -1;
          state.selectedSegmentId = null;
          state.selectedOverlayId = null;
        }
      });
    },

    /**
     * Redo previously undone action
     * Restores both clips and segments
     */
    redo: () => {
      const { historyIndex, history } = get();

      if (historyIndex >= history.length - 1) return;

      set((state) => {
        state.historyIndex += 1;
        const snapshot = state.history[state.historyIndex];
        state.clips = JSON.parse(JSON.stringify(snapshot.clips));
        state.segments = JSON.parse(JSON.stringify(snapshot.segments));
        state.textOverlays = JSON.parse(JSON.stringify(snapshot.textOverlays || []));
        state.selectedSegmentId = null;
        state.selectedOverlayId = null;
      });
    },

    /**
     * Check if undo is available
     */
    canUndo: () => {
      const { historyIndex, history } = get();
      return historyIndex >= 0 || history.length > 0;
    },

    /**
     * Check if redo is available
     */
    canRedo: () => {
      const { historyIndex, history } = get();
      return historyIndex < history.length - 1;
    },

    /**
     * Get segments data for export
     * Includes clipId for multi-clip support
     */
    getSegmentsForExport: () => {
      const { clips, segments } = get();
      return segments.map(seg => {
        const clip = clips[seg.clipId];
        return {
          clipId: seg.clipId,
          uploadId: clip?.uploadId || null,
          start: seg.start,
          end: seg.end
        };
      });
    },

    /**
     * Get unique clips used in segments for export
     */
    getClipsForExport: () => {
      const { clips, segments } = get();
      const usedClipIds = [...new Set(segments.map(s => s.clipId))];

      return usedClipIds.map(clipId => {
        const clip = clips[clipId];
        return {
          clipId,
          uploadId: clip?.uploadId || null
        };
      });
    },

    /**
     * Get segments grouped by clip
     */
    getSegmentsByClip: (clipId) => {
      const { segments } = get();
      return segments.filter(seg => seg.clipId === clipId);
    },

    /**
     * Add a new text overlay
     * @param {string} type - 'header' or 'subheader'
     */
    addTextOverlay: (type) => {
      const { currentTime, getComposedDuration, saveToHistory } = get();
      const composedDuration = getComposedDuration();

      saveToHistory();

      set((state) => {
        const maxId = state.textOverlays.length > 0
          ? Math.max(...state.textOverlays.map(o => o.id), 0)
          : 0;

        const defaultYPosition = type === 'header' ? 20 : 35;
        const defaultText = type === 'header' ? 'Header' : 'Subheader';

        const proposedStart = currentTime;
        const proposedEnd = Math.min(currentTime + 5, composedDuration);

        const overlappingOverlays = state.textOverlays.filter(overlay =>
          overlay.startTime < proposedEnd && overlay.endTime > proposedStart
        );

        let actualStart = proposedStart;
        if (overlappingOverlays.length > 0) {
          const latestEnd = Math.max(...overlappingOverlays.map(o => o.endTime));
          actualStart = latestEnd;
        }

        const endTime = Math.min(actualStart + 5, composedDuration);

        state.textOverlays.push({
          id: maxId + 1,
          type,
          text: defaultText,
          xPosition: 50,
          yPosition: defaultYPosition,
          width: 60,
          startTime: actualStart,
          endTime: endTime > actualStart ? endTime : composedDuration
        });

        state.selectedOverlayId = maxId + 1;
      });
    },

    /**
     * Update a text overlay
     */
    updateTextOverlay: (id, updates) => {
      const { saveToHistory } = get();

      set((state) => {
        const overlay = state.textOverlays.find(o => o.id === id);
        if (overlay) {
          // Only save to history for significant changes (not drag updates)
          if (updates.text !== undefined || updates.startTime !== undefined || updates.endTime !== undefined) {
            saveToHistory();
          }
          Object.assign(overlay, updates);
        }
      });
    },

    /**
     * Update overlay position (without saving to history for smooth dragging)
     */
    updateOverlayPosition: (id, xPosition, yPosition) => {
      set((state) => {
        const overlay = state.textOverlays.find(o => o.id === id);
        if (overlay) {
          if (xPosition !== undefined) {
            overlay.xPosition = Math.max(0, Math.min(100, xPosition));
          }
          if (yPosition !== undefined) {
            overlay.yPosition = Math.max(0, Math.min(100, yPosition));
          }
        }
      });
    },

    /**
     * Update overlay width (without saving to history for smooth resizing)
     */
    updateOverlayWidth: (id, width) => {
      set((state) => {
        const overlay = state.textOverlays.find(o => o.id === id);
        if (overlay) {
          overlay.width = Math.max(10, Math.min(90, width));
        }
      });
    },

    /**
     * Update overlay timing (for timeline drag)
     */
    updateOverlayTiming: (id, startTime, endTime) => {
      set((state) => {
        const overlay = state.textOverlays.find(o => o.id === id);
        if (overlay) {
          const duration = overlay.endTime - overlay.startTime;
          overlay.startTime = Math.max(0, startTime);
          overlay.endTime = endTime !== undefined ? endTime : overlay.startTime + duration;
        }
      });
    },

    /**
     * Save overlay position to history (call after drag ends)
     */
    commitOverlayPosition: () => {
      const { saveToHistory } = get();
      saveToHistory();
    },

    /**
     * Remove a text overlay
     */
    removeTextOverlay: (id) => {
      const { saveToHistory } = get();
      saveToHistory();

      set((state) => {
        state.textOverlays = state.textOverlays.filter(o => o.id !== id);
        if (state.selectedOverlayId === id) {
          state.selectedOverlayId = null;
        }
      });
    },

    /**
     * Select a text overlay
     */
    selectOverlay: (id) => {
      set((state) => {
        state.selectedOverlayId = id;
        if (id !== null) {
          state.selectedSegmentId = null;
        }
      });
    },

    /**
     * Get currently selected overlay
     */
    getSelectedOverlay: () => {
      const { textOverlays, selectedOverlayId } = get();
      return textOverlays.find(o => o.id === selectedOverlayId) || null;
    }
  }))
);

export default useVideoEditorStore;

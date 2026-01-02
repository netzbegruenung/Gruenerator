import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

const CLIP_COLORS = [
  '#46962b', '#0088cc', '#f5a623', '#9b59b6',
  '#e74c3c', '#1abc9c', '#f39c12', '#3498db'
];

const generateClipId = () => `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

interface VideoClip {
  id: string;
  url: string;
  file: File | null;
  uploadId: string | null;
  duration: number;
  fps: number;
  width: number;
  height: number;
  name: string;
  color: string;
  thumbnail: string | null;
  order: number;
}

interface VideoSegment {
  id: number;
  clipId: string;
  start: number;
  end: number;
}

interface TextOverlay {
  id: number;
  type: 'header' | 'subheader';
  text: string;
  xPosition: number;
  yPosition: number;
  width: number;
  startTime: number;
  endTime: number;
}

interface HistorySnapshot {
  clips: Record<string, VideoClip>;
  segments: VideoSegment[];
  textOverlays: TextOverlay[];
}

interface VideoMetadata {
  duration?: number;
  fps?: number;
  width?: number;
  height?: number;
}

interface SegmentExport {
  clipId: string;
  uploadId: string | null;
  start: number;
  end: number;
}

interface ClipExport {
  clipId: string;
  uploadId: string | null;
}

interface VideoEditorStore {
  clips: Record<string, VideoClip>;
  activeClipId: string | null;
  compositionWidth: number;
  compositionHeight: number;
  compositionFps: number;
  segments: VideoSegment[];
  currentTime: number;
  isPlaying: boolean;
  selectedSegmentId: number | null;
  isEditorActive: boolean;
  textOverlays: TextOverlay[];
  selectedOverlayId: number | null;
  history: HistorySnapshot[];
  historyIndex: number;
  maxHistorySize: number;
  videoUrl: string | null;
  videoFile: File | null;
  duration: number;
  fps: number;
  width: number;
  height: number;

  addClip: (url: string, file: File | null, metadata: VideoMetadata, uploadId?: string | null) => string;
  removeClip: (clipId: string) => boolean;
  setActiveClip: (clipId: string) => void;
  getClipById: (clipId: string) => VideoClip | null;
  getClipsArray: () => VideoClip[];
  getClipCount: () => number;
  hasMultipleClips: () => boolean;
  addSegmentFromClip: (clipId: string, start?: number | null, end?: number | null) => number | null;
  setClipThumbnail: (clipId: string, thumbnail: string) => void;
  setClipUploadId: (clipId: string, uploadId: string) => void;
  initializeVideo: (videoUrl: string, videoFile: File | null, metadata: VideoMetadata, uploadId?: string | null) => void;
  resetEditor: () => void;
  splitAtPlayhead: () => void;
  deleteSegment: (segmentId: number) => void;
  reorderSegments: (fromIndex: number, toIndex: number) => void;
  selectSegment: (segmentId: number | null) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  trimSegmentStart: (segmentId: number, newStart: number) => void;
  trimSegmentEnd: (segmentId: number, newEnd: number) => void;
  getComposedDuration: () => number;
  getTotalClipsDuration: () => number;
  composedTimeToOriginal: (composedTime: number) => number;
  originalTimeToComposed: (originalTime: number) => number;
  saveToHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  getSegmentsForExport: () => SegmentExport[];
  getClipsForExport: () => ClipExport[];
  getSegmentsByClip: (clipId: string) => VideoSegment[];
  addTextOverlay: (type: 'header' | 'subheader') => void;
  updateTextOverlay: (id: number, updates: Partial<TextOverlay>) => void;
  updateOverlayPosition: (id: number, xPosition?: number, yPosition?: number) => void;
  updateOverlayWidth: (id: number, width: number) => void;
  updateOverlayTiming: (id: number, startTime: number, endTime?: number) => void;
  commitOverlayPosition: () => void;
  removeTextOverlay: (id: number) => void;
  selectOverlay: (id: number | null) => void;
  getSelectedOverlay: () => TextOverlay | null;
  seekToTime?: (timeInSeconds: number) => void;
}

const useVideoEditorStore = create<VideoEditorStore>()(
  immer((set, get) => ({
    clips: {},
    activeClipId: null,
    compositionWidth: 0,
    compositionHeight: 0,
    compositionFps: 30,
    segments: [],
    currentTime: 0,
    isPlaying: false,
    selectedSegmentId: null,
    isEditorActive: false,
    textOverlays: [],
    selectedOverlayId: null,
    history: [],
    historyIndex: -1,
    maxHistorySize: 50,
    videoUrl: null,
    videoFile: null,
    duration: 0,
    fps: 30,
    width: 0,
    height: 0,

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

        if (clipCount === 0) {
          state.compositionWidth = metadata.width || 0;
          state.compositionHeight = metadata.height || 0;
          state.compositionFps = metadata.fps || 30;
          state.activeClipId = clipId;
          state.videoUrl = url;
          state.videoFile = file;
          state.duration = metadata.duration || 0;
          state.fps = metadata.fps || 30;
          state.width = metadata.width || 0;
          state.height = metadata.height || 0;
        }

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

    removeClip: (clipId) => {
      const { clips, activeClipId, saveToHistory } = get();
      if (Object.keys(clips).length <= 1) return false;

      saveToHistory();

      set((state) => {
        delete state.clips[clipId];
        state.segments = state.segments.filter(seg => seg.clipId !== clipId);

        if (activeClipId === clipId) {
          const remainingClips = Object.keys(state.clips);
          state.activeClipId = remainingClips.length > 0 ? remainingClips[0] : null;
        }

        state.selectedSegmentId = null;
      });

      return true;
    },

    setActiveClip: (clipId) => {
      set((state) => {
        if (state.clips[clipId]) {
          state.activeClipId = clipId;
        }
      });
    },

    getClipById: (clipId) => {
      const { clips } = get();
      return clips[clipId] || null;
    },

    getClipsArray: () => {
      const { clips } = get();
      return Object.values(clips).sort((a, b) => a.order - b.order);
    },

    getClipCount: () => {
      const { clips } = get();
      return Object.keys(clips).length;
    },

    hasMultipleClips: () => {
      const { clips } = get();
      return Object.keys(clips).length > 1;
    },

    addSegmentFromClip: (clipId, start = null, end = null) => {
      const { clips, saveToHistory } = get();
      const clip = clips[clipId];
      if (!clip) return null;

      saveToHistory();

      let newSegmentId: number | null = null;
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

    setClipThumbnail: (clipId, thumbnail) => {
      set((state) => {
        if (state.clips[clipId]) {
          state.clips[clipId].thumbnail = thumbnail;
        }
      });
    },

    setClipUploadId: (clipId, uploadId) => {
      set((state) => {
        if (state.clips[clipId]) {
          state.clips[clipId].uploadId = uploadId;
        }
      });
    },

    initializeVideo: (videoUrl, videoFile, metadata, uploadId = null) => {
      get().resetEditor();
      get().addClip(videoUrl, videoFile, metadata, uploadId);
    },

    resetEditor: () => {
      set((state) => {
        state.clips = {};
        state.activeClipId = null;
        state.compositionWidth = 0;
        state.compositionHeight = 0;
        state.compositionFps = 30;
        state.segments = [];
        state.currentTime = 0;
        state.isPlaying = false;
        state.selectedSegmentId = null;
        state.isEditorActive = false;
        state.textOverlays = [];
        state.selectedOverlayId = null;
        state.history = [];
        state.historyIndex = -1;
        state.videoUrl = null;
        state.videoFile = null;
        state.duration = 0;
        state.fps = 30;
        state.width = 0;
        state.height = 0;
      });
    },

    splitAtPlayhead: () => {
      const { currentTime, segments, saveToHistory } = get();

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

      if (splitPoint - segment.start < 0.5 || segment.end - splitPoint < 0.5) {
        return;
      }

      saveToHistory();

      set((state) => {
        const maxId = Math.max(...state.segments.map(s => s.id), 0);

        const firstHalf: VideoSegment = {
          id: segment.id,
          clipId: segment.clipId,
          start: segment.start,
          end: splitPoint
        };

        const secondHalf: VideoSegment = {
          id: maxId + 1,
          clipId: segment.clipId,
          start: splitPoint,
          end: segment.end
        };

        state.segments.splice(segmentIndex, 1, firstHalf, secondHalf);
      });
    },

    deleteSegment: (segmentId) => {
      const { segments, saveToHistory } = get();
      if (segments.length <= 1) return;

      saveToHistory();

      set((state) => {
        state.segments = state.segments.filter(seg => seg.id !== segmentId);
        if (state.selectedSegmentId === segmentId) {
          state.selectedSegmentId = null;
        }
      });
    },

    reorderSegments: (fromIndex, toIndex) => {
      if (fromIndex === toIndex) return;

      const { saveToHistory } = get();
      saveToHistory();

      set((state) => {
        const [removed] = state.segments.splice(fromIndex, 1);
        state.segments.splice(toIndex, 0, removed);
      });
    },

    selectSegment: (segmentId) => {
      set((state) => {
        state.selectedSegmentId = segmentId;
      });
    },

    setCurrentTime: (time) => {
      set((state) => {
        state.currentTime = time;
      });
    },

    setIsPlaying: (playing) => {
      set((state) => {
        state.isPlaying = playing;
      });
    },

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

    getComposedDuration: () => {
      const { segments } = get();
      return segments.reduce((total, seg) => total + (seg.end - seg.start), 0);
    },

    getTotalClipsDuration: () => {
      const { clips } = get();
      return Object.values(clips).reduce((total, clip) => total + (clip.duration || 0), 0);
    },

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

      if (segments.length > 0) {
        return segments[segments.length - 1].end;
      }
      return 0;
    },

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

    saveToHistory: () => {
      const { clips, segments, textOverlays, history, historyIndex, maxHistorySize } = get();

      set((state) => {
        const newHistory = state.history.slice(0, state.historyIndex + 1);

        newHistory.push({
          clips: JSON.parse(JSON.stringify(clips)),
          segments: JSON.parse(JSON.stringify(segments)),
          textOverlays: JSON.parse(JSON.stringify(textOverlays))
        });

        if (newHistory.length > maxHistorySize) {
          newHistory.shift();
        } else {
          state.historyIndex = newHistory.length - 1;
        }

        state.history = newHistory;
        state.historyIndex = newHistory.length - 1;
      });
    },

    undo: () => {
      const { historyIndex, history, clips, segments, textOverlays } = get();

      if (historyIndex < 0 || history.length === 0) return;

      set((state) => {
        if (state.historyIndex === state.history.length - 1) {
          state.history.push({
            clips: JSON.parse(JSON.stringify(clips)),
            segments: JSON.parse(JSON.stringify(segments)),
            textOverlays: JSON.parse(JSON.stringify(textOverlays))
          });
          state.historyIndex = state.history.length - 1;
        }

        if (state.historyIndex > 0) {
          state.historyIndex -= 1;
          const snapshot = state.history[state.historyIndex];
          state.clips = JSON.parse(JSON.stringify(snapshot.clips));
          state.segments = JSON.parse(JSON.stringify(snapshot.segments));
          state.textOverlays = JSON.parse(JSON.stringify(snapshot.textOverlays || []));
          state.selectedSegmentId = null;
          state.selectedOverlayId = null;
        } else if (state.historyIndex === 0) {
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

    canUndo: () => {
      const { historyIndex, history } = get();
      return historyIndex >= 0 || history.length > 0;
    },

    canRedo: () => {
      const { historyIndex, history } = get();
      return historyIndex < history.length - 1;
    },

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

    getSegmentsByClip: (clipId) => {
      const { segments } = get();
      return segments.filter(seg => seg.clipId === clipId);
    },

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

    updateTextOverlay: (id, updates) => {
      const { saveToHistory } = get();

      set((state) => {
        const overlay = state.textOverlays.find(o => o.id === id);
        if (overlay) {
          if (updates.text !== undefined || updates.startTime !== undefined || updates.endTime !== undefined) {
            saveToHistory();
          }
          Object.assign(overlay, updates);
        }
      });
    },

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

    updateOverlayWidth: (id, width) => {
      set((state) => {
        const overlay = state.textOverlays.find(o => o.id === id);
        if (overlay) {
          overlay.width = Math.max(10, Math.min(90, width));
        }
      });
    },

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

    commitOverlayPosition: () => {
      const { saveToHistory } = get();
      saveToHistory();
    },

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

    selectOverlay: (id) => {
      set((state) => {
        state.selectedOverlayId = id;
        if (id !== null) {
          state.selectedSegmentId = null;
        }
      });
    },

    getSelectedOverlay: () => {
      const { textOverlays, selectedOverlayId } = get();
      return textOverlays.find(o => o.id === selectedOverlayId) || null;
    }
  }))
);

export default useVideoEditorStore;

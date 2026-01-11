import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { FiTrash2, FiMove, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { Thumbnail } from '@remotion/player';
import { preloadVideo } from '@remotion/preload';
import useVideoEditorStore from '../../../../stores/videoEditorStore';
import VideoComposition from './VideoComposition';
import SubtitleSegmentList from '../../../../components/common/SubtitleSegmentList';
import './Timeline.css';

// Import centralized types and utilities
import type { SubtitleSegment } from '../../types';
import { parseSubtitleBlocks } from '../../utils/subtitleSegmentUtils';
import { formatDisplayTime } from '../../utils/subtitleTimeUtils';

// Type alias for compatibility with existing code
type ParsedSubtitle = SubtitleSegment;

interface TextOverlay {
  id: number;
  text: string;
  startTime: number;
  endTime: number;
}

interface DraggingOverlay {
  id: number;
  startX: number;
  originalStartTime: number;
  duration: number;
  trackRect: DOMRect;
}

interface ResizingOverlay {
  id: number;
  edge: 'left' | 'right';
  startX: number;
  originalStartTime: number;
  originalEndTime: number;
  trackRect: DOMRect;
}

interface TouchReorderState {
  index: number;
  segmentId: number;
  startX: number;
  startY: number;
  moved: boolean;
}

interface ContextMenuState {
  segmentId: number;
  index: number;
  x: number;
  y: number;
}

interface EditingSubtitle extends ParsedSubtitle {
  index: number;
}

interface TimelineProps {
  subtitles: string;
  onSubtitleClick?: (index: number, sub: ParsedSubtitle) => void;
  onSubtitleUpdate?: (index: number, text: string) => void;
  onOverlayDoubleClick?: (overlay: TextOverlay) => void;
}

// Removed duplicate parseSubtitleTime and parseSubtitles functions
// Now using centralized utilities: parseSubtitleBlocks from subtitleSegmentUtils
// This eliminates ~35 lines of duplicate code

/**
 * Timeline Component
 * Visual representation of video segments with playhead and drag-drop reordering
 */
const Timeline = ({ subtitles, onSubtitleClick, onSubtitleUpdate, onOverlayDoubleClick }: TimelineProps) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedSegmentIndex, setDraggedSegmentIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [editingSubtitle, setEditingSubtitle] = useState<EditingSubtitle | null>(null);
  const [editText, setEditText] = useState('');
  const [draggingOverlay, setDraggingOverlay] = useState<DraggingOverlay | null>(null);
  const [resizingOverlay, setResizingOverlay] = useState<ResizingOverlay | null>(null);
  const [isSubtitlesExpanded, setIsSubtitlesExpanded] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  // Mobile touch state
  const [isTouching, setIsTouching] = useState(false);
  const [touchReorder, setTouchReorder] = useState<TouchReorderState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mobile detection
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;

  // Preview popup state
  const [previewFrame, setPreviewFrame] = useState<number | null>(null);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
  const [showPreview, setShowPreview] = useState(false);

  const {
    clips,
    duration,
    segments,
    currentTime,
    selectedSegmentId,
    selectSegment,
    setCurrentTime,
    getComposedDuration,
    getTotalClipsDuration,
    deleteSegment,
    reorderSegments,
    addSegmentFromClip,
    trimSegmentStart,
    trimSegmentEnd,
    compositionWidth,
    compositionHeight,
    compositionFps,
    textOverlays,
    selectedOverlayId,
    selectOverlay,
    updateOverlayTiming,
    commitOverlayPosition
  } = useVideoEditorStore();

  const composedDuration = getComposedDuration();
  // Use total clips duration as the fixed timeline reference
  // This prevents the timeline from auto-scaling when trimming
  const timelineDuration = getTotalClipsDuration() || composedDuration;

  // Preload videos for faster thumbnail rendering
  useEffect(() => {
    const unpreloadFns = Object.values(clips)
      .filter(clip => clip?.url)
      .map(clip => preloadVideo(clip.url));

    return () => {
      unpreloadFns.forEach(fn => fn?.());
    };
  }, [clips]);


  const calculatePlayheadPosition = useCallback(() => {
    if (composedDuration === 0) return 0;

    let accumulatedTime = 0;
    for (const segment of segments) {
      const segmentDuration = segment.end - segment.start;
      if (currentTime >= accumulatedTime && currentTime < accumulatedTime + segmentDuration) {
        const positionInSegment = currentTime - accumulatedTime;
        const segmentStartPercent = (accumulatedTime / composedDuration) * 100;
        const positionPercent = (positionInSegment / composedDuration) * 100;
        return segmentStartPercent + positionPercent;
      }
      accumulatedTime += segmentDuration;
    }

    return 100;
  }, [currentTime, segments, composedDuration]);

  const handleTimelineClick = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = clickX / rect.width;
    const newTime = percent * composedDuration;

    setCurrentTime(Math.max(0, Math.min(newTime, composedDuration)));
  }, [composedDuration, setCurrentTime]);

  const handlePlayheadDrag = useCallback((e: MouseEvent) => {
    if (!isDragging || !timelineRef.current || draggedSegmentIndex !== null) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const dragX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, dragX / rect.width));
    const newTime = percent * composedDuration;

    setCurrentTime(newTime);

    // Update preview popup
    const fps = compositionFps || 30;
    const frame = Math.round(newTime * fps);
    setPreviewFrame(frame);
    setPreviewPosition({ x: e.clientX, y: rect.top });
    setShowPreview(true);
  }, [isDragging, composedDuration, setCurrentTime, compositionFps, draggedSegmentIndex]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't preventDefault if clicking on a draggable segment - it blocks HTML5 drag
    const isDraggableSegment = (e.target as HTMLElement).closest('[draggable="true"]');
    if (!isDraggableSegment) {
      e.preventDefault();
    }
    setIsDragging(true);
    handleTimelineClick(e);
  }, [handleTimelineClick]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setShowPreview(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handlePlayheadDrag);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handlePlayheadDrag);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handlePlayheadDrag, handleMouseUp]);

  // Touch handlers for playhead scrubbing
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('[draggable="true"]') || (e.target as HTMLElement).closest('.timeline__segment')) return;
    e.preventDefault();
    setIsTouching(true);

    const touch = e.touches[0];
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    const newTime = percent * composedDuration;
    setCurrentTime(newTime);
  }, [composedDuration, setCurrentTime]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isTouching || !timelineRef.current) return;
    e.preventDefault();

    const touch = e.touches[0];
    const rect = timelineRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    const newTime = percent * composedDuration;
    setCurrentTime(newTime);
  }, [isTouching, composedDuration, setCurrentTime]);

  const handleTouchEnd = useCallback(() => {
    setIsTouching(false);
  }, []);

  const handleSegmentClick = useCallback((e: React.MouseEvent, segmentId: number) => {
    e.stopPropagation();
    selectSegment(segmentId);
  }, [selectSegment]);

  const handleDeleteSegment = useCallback((e: React.MouseEvent, segmentId: number) => {
    e.stopPropagation();
    deleteSegment(segmentId);
  }, [deleteSegment]);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    e.stopPropagation();
    setDraggedSegmentIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    // Find parent segment and use it as drag preview
    const segment = (e.currentTarget as HTMLElement).closest('.timeline__segment');
    if (segment) {
      segment.classList.add('timeline__segment--dragging');
      // Set the whole segment as drag image
      const rect = segment.getBoundingClientRect();
      const handleRect = e.currentTarget.getBoundingClientRect();
      const offsetX = handleRect.left - rect.left + handleRect.width / 2;
      const offsetY = handleRect.top - rect.top + handleRect.height / 2;
      e.dataTransfer.setDragImage(segment, offsetX, offsetY);
    }
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    // Find parent segment and remove dragging class
    const segment = (e.currentTarget as HTMLElement).closest('.timeline__segment');
    if (segment) segment.classList.remove('timeline__segment--dragging');
    setDraggedSegmentIndex(null);
    setDropTargetIndex(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedSegmentIndex !== null && draggedSegmentIndex !== index) {
      setDropTargetIndex(index);
    }
  }, [draggedSegmentIndex]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetIndex(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if this is a clip drop from ClipPanel
    const clipId = e.dataTransfer.getData('application/clip-id');
    if (clipId && clips[clipId]) {
      // Add new segment from the dropped clip
      addSegmentFromClip(clipId);
      setDraggedSegmentIndex(null);
      setDropTargetIndex(null);
      return;
    }

    // Otherwise, handle segment reordering
    if (draggedSegmentIndex !== null && draggedSegmentIndex !== targetIndex) {
      reorderSegments(draggedSegmentIndex, targetIndex);
    }

    setDraggedSegmentIndex(null);
    setDropTargetIndex(null);
  }, [draggedSegmentIndex, reorderSegments, clips, addSegmentFromClip]);

  // Handle drop on the entire timeline track (for adding new clips)
  const handleTrackDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const clipId = e.dataTransfer.getData('application/clip-id');
    if (clipId && clips[clipId]) {
      addSegmentFromClip(clipId);
    }
  }, [clips, addSegmentFromClip]);

  const handleTrackDragOver = useCallback((e: React.DragEvent) => {
    // Allow drop if it's a clip
    if (e.dataTransfer.types.includes('application/clip-id')) {
      e.preventDefault();
    }
  }, []);

  // Touch-based segment reordering handlers
  const handleSegmentTouchStart = useCallback((e: React.TouchEvent, index: number, segmentId: number) => {
    const touch = e.touches[0];
    setTouchReorder({
      index,
      segmentId,
      startX: touch.clientX,
      startY: touch.clientY,
      moved: false
    });

    // Start long-press timer for context menu
    longPressTimer.current = setTimeout(() => {
      const rect = e.currentTarget.getBoundingClientRect();
      setContextMenu({
        segmentId,
        index,
        x: rect.left + rect.width / 2,
        y: rect.top
      });
      setTouchReorder(null);
      navigator.vibrate?.(50);
    }, 500);
  }, []);

  const handleSegmentTouchMove = useCallback((e: React.TouchEvent) => {
    // Cancel long-press if user moves
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (!touchReorder || !timelineRef.current) return;
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchReorder.startX);

    if (deltaX > 20) {
      e.preventDefault();
      setTouchReorder(prev => prev ? { ...prev, moved: true } : null);
      const rect = timelineRef.current.getBoundingClientRect();
      const percent = (touch.clientX - rect.left) / rect.width;
      const targetIndex = Math.min(segments.length - 1, Math.max(0, Math.floor(percent * segments.length)));
      if (targetIndex !== touchReorder.index) {
        setDropTargetIndex(targetIndex);
      }
    }
  }, [touchReorder, segments.length]);

  const handleSegmentTouchEnd = useCallback(() => {
    // Cancel long-press timer
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (touchReorder?.moved && dropTargetIndex !== null && dropTargetIndex !== touchReorder.index) {
      reorderSegments(touchReorder.index, dropTargetIndex);
      navigator.vibrate?.(30);
    }
    setTouchReorder(null);
    setDropTargetIndex(null);
  }, [touchReorder, dropTargetIndex, reorderSegments]);

  // Close context menu when clicking outside
  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  /* DISABLED: Edge resize feature
  // Edge resize handlers
  const handleResizeStart = useCallback((e, segment, index, edge) => {
    e.stopPropagation();
    e.preventDefault();
    setResizing({
      segmentId: segment.id,
      segmentIndex: index,
      edge,
      startX: e.clientX,
      originalStart: segment.start,
      originalEnd: segment.end,
      frozenComposedDuration: composedDuration
    });
    document.body.classList.add('resizing-segment');
  }, [composedDuration]);

  const handleResizeMove = useCallback((e) => {
    if (!resizing || !timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const deltaX = e.clientX - resizing.startX;
    const deltaPercent = deltaX / rect.width;
    const deltaTime = deltaPercent * resizing.frozenComposedDuration;
    const segment = segments[resizing.segmentIndex];
    if (!segment) return;
    const clip = clips[segment.clipId];
    if (resizing.edge === 'left') {
      const newStart = Math.max(0, Math.min(resizing.originalStart + deltaTime, resizing.originalEnd - 0.5));
      trimSegmentStart(segment.id, newStart);
    } else {
      const newEnd = Math.max(resizing.originalStart + 0.5, Math.min(resizing.originalEnd + deltaTime, clip?.duration || Infinity));
      trimSegmentEnd(segment.id, newEnd);
    }
  }, [resizing, segments, clips, trimSegmentStart, trimSegmentEnd]);

  const handleResizeEnd = useCallback(() => {
    setResizing(null);
    document.body.classList.remove('resizing-segment');
  }, []);

  useEffect(() => {
    if (resizing) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [resizing, handleResizeMove, handleResizeEnd]);
  */

  // Use centralized formatDisplayTime utility (eliminates duplicate formatting)

  const handleSubtitleEdit = useCallback((index: number, sub: ParsedSubtitle) => {
    setEditingSubtitle({ index, ...sub });
    setEditText(sub.text);
    setCurrentTime(sub.startTime);
  }, [setCurrentTime]);

  const handleOverlayClick = useCallback((e: React.MouseEvent, overlay: TextOverlay) => {
    e.preventDefault();
    e.stopPropagation();
    selectOverlay(overlay.id);
    setCurrentTime(overlay.startTime);
  }, [selectOverlay, setCurrentTime]);

  const handleOverlayDragStart = useCallback((e: React.MouseEvent, overlay: TextOverlay) => {
    e.stopPropagation();
    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    setDraggingOverlay({
      id: overlay.id,
      startX: e.clientX,
      originalStartTime: overlay.startTime,
      duration: overlay.endTime - overlay.startTime,
      trackRect: rect
    });
    selectOverlay(overlay.id);
  }, [selectOverlay]);

  const handleOverlayDragMove = useCallback((e: MouseEvent) => {
    if (!draggingOverlay || !timelineRef.current) return;

    const deltaX = e.clientX - draggingOverlay.startX;
    const deltaPercent = deltaX / draggingOverlay.trackRect.width;
    const deltaTime = deltaPercent * composedDuration;
    const newStartTime = Math.max(0, Math.min(
      composedDuration - draggingOverlay.duration,
      draggingOverlay.originalStartTime + deltaTime
    ));

    updateOverlayTiming(draggingOverlay.id, newStartTime);
    setCurrentTime(newStartTime);
  }, [draggingOverlay, composedDuration, updateOverlayTiming, setCurrentTime]);

  const handleOverlayDragEnd = useCallback(() => {
    if (draggingOverlay) {
      commitOverlayPosition();
      setDraggingOverlay(null);
    }
  }, [draggingOverlay, commitOverlayPosition]);

  useEffect(() => {
    if (draggingOverlay) {
      window.addEventListener('mousemove', handleOverlayDragMove);
      window.addEventListener('mouseup', handleOverlayDragEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleOverlayDragMove);
      window.removeEventListener('mouseup', handleOverlayDragEnd);
    };
  }, [draggingOverlay, handleOverlayDragMove, handleOverlayDragEnd]);

  const handleOverlayResizeStart = useCallback((e: React.MouseEvent, overlay: TextOverlay, edge: 'left' | 'right') => {
    e.stopPropagation();
    e.preventDefault();
    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    setResizingOverlay({
      id: overlay.id,
      edge,
      startX: e.clientX,
      originalStartTime: overlay.startTime,
      originalEndTime: overlay.endTime,
      trackRect: rect
    });
    selectOverlay(overlay.id);
    document.body.classList.add('resizing-overlay');
  }, [selectOverlay]);

  const handleOverlayResizeMove = useCallback((e: MouseEvent) => {
    if (!resizingOverlay || !timelineRef.current) return;

    const deltaX = e.clientX - resizingOverlay.startX;
    const deltaPercent = deltaX / resizingOverlay.trackRect.width;
    const deltaTime = deltaPercent * composedDuration;
    const MIN_DURATION = 0.5;

    if (resizingOverlay.edge === 'left') {
      const newStartTime = Math.max(0, Math.min(
        resizingOverlay.originalEndTime - MIN_DURATION,
        resizingOverlay.originalStartTime + deltaTime
      ));
      updateOverlayTiming(resizingOverlay.id, newStartTime, resizingOverlay.originalEndTime);
      setCurrentTime(newStartTime);
    } else {
      const newEndTime = Math.max(
        resizingOverlay.originalStartTime + MIN_DURATION,
        Math.min(composedDuration, resizingOverlay.originalEndTime + deltaTime)
      );
      updateOverlayTiming(resizingOverlay.id, resizingOverlay.originalStartTime, newEndTime);
      setCurrentTime(newEndTime);
    }
  }, [resizingOverlay, composedDuration, updateOverlayTiming, setCurrentTime]);

  const handleOverlayResizeEnd = useCallback(() => {
    if (resizingOverlay) {
      commitOverlayPosition();
      setResizingOverlay(null);
      document.body.classList.remove('resizing-overlay');
    }
  }, [resizingOverlay, commitOverlayPosition]);

  useEffect(() => {
    if (resizingOverlay) {
      window.addEventListener('mousemove', handleOverlayResizeMove);
      window.addEventListener('mouseup', handleOverlayResizeEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleOverlayResizeMove);
      window.removeEventListener('mouseup', handleOverlayResizeEnd);
    };
  }, [resizingOverlay, handleOverlayResizeMove, handleOverlayResizeEnd]);

  const handleEditSave = useCallback(() => {
    if (editingSubtitle !== null && onSubtitleUpdate) {
      onSubtitleUpdate(editingSubtitle.index, editText);
    }
    setEditingSubtitle(null);
    setEditText('');
  }, [editingSubtitle, editText, onSubtitleUpdate]);

  const handleEditCancel = useCallback(() => {
    setEditingSubtitle(null);
    setEditText('');
  }, []);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEditSave();
    } else if (e.key === 'Escape') {
      handleEditCancel();
    }
  }, [handleEditSave, handleEditCancel]);

  useEffect(() => {
    if (editingSubtitle !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingSubtitle]);

  const playheadPosition = calculatePlayheadPosition();

  // Parse subtitles string into structured data
  const parsedSubtitles = useMemo(() => parseSubtitleBlocks(subtitles), [subtitles]);

  return (
    <div className="timeline">
      <div className="timeline__header">
        <span className="timeline__label">Timeline</span>
        <span className="timeline__duration">
          {formatDisplayTime(currentTime)} / {formatDisplayTime(composedDuration)}
        </span>
      </div>

      {parsedSubtitles.length > 0 && (
        <>
          <div className="timeline__subtitle-header">
            <span className="timeline__subtitle-label">Untertitel</span>
            <button
              className="timeline__subtitle-toggle"
              onClick={() => setIsSubtitlesExpanded(!isSubtitlesExpanded)}
            >
              {isSubtitlesExpanded ? (
                <>
                  Einklappen <FiChevronUp />
                </>
              ) : (
                <>
                  Erweitern <FiChevronDown />
                </>
              )}
            </button>
          </div>

          {!isSubtitlesExpanded ? (
            <div className="timeline__subtitle-track">
              {parsedSubtitles.map((sub, index) => {
                const startPercent = (sub.startTime / duration) * 100;
                const widthPercent = ((sub.endTime - sub.startTime) / duration) * 100;
                return (
                  <div
                    key={index}
                    className="timeline__subtitle-marker"
                    style={{ left: `${startPercent}%`, width: `${widthPercent}%` }}
                    title={sub.text}
                    onClick={(e: React.MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSubtitleEdit(index, sub);
                      onSubtitleClick?.(index, sub);
                    }}
                  >
                    <span className="timeline__subtitle-text">T</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <SubtitleSegmentList
              segments={parsedSubtitles}
              currentTime={currentTime}
              onSegmentClick={(id) => {
                const sub = parsedSubtitles.find(s => s.id === id);
                if (sub) {
                  onSubtitleClick?.(id, sub);
                }
              }}
              onTextChange={(id, newText) => {
                onSubtitleUpdate?.(id, newText);
              }}
              onSeek={(time) => {
                setCurrentTime(time);
              }}
              columns={3}
            />
          )}
        </>
      )}

      {textOverlays.length > 0 && (
        <div className="timeline__overlay-track">
          {textOverlays.map((overlay) => {
            const startPercent = (overlay.startTime / composedDuration) * 100;
            const widthPercent = ((overlay.endTime - overlay.startTime) / composedDuration) * 100;
            const isSelected = selectedOverlayId === overlay.id;
            const isDragging = draggingOverlay?.id === overlay.id;

            return (
              <div
                key={overlay.id}
                className={`timeline__overlay-marker ${isSelected ? 'timeline__overlay-marker--selected' : ''} ${isDragging ? 'timeline__overlay-marker--dragging' : ''} ${resizingOverlay?.id === overlay.id ? 'timeline__overlay-marker--resizing' : ''}`}
                style={{ left: `${startPercent}%`, width: `${Math.max(widthPercent, 2)}%` }}
                title={`Text: ${overlay.text}`}
                onClick={(e: React.MouseEvent) => handleOverlayClick(e, overlay)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onOverlayDoubleClick?.(overlay);
                }}
                onMouseDown={(e: React.MouseEvent) => {
                  if (!(e.target as HTMLElement).classList.contains('timeline__overlay-resize-handle')) {
                    handleOverlayDragStart(e, overlay);
                  }
                }}
              >
                <div
                  className="timeline__overlay-resize-handle timeline__overlay-resize-handle--left"
                  onMouseDown={(e: React.MouseEvent) => handleOverlayResizeStart(e, overlay, 'left')}
                />
                <span className="timeline__overlay-label">T</span>
                <span className="timeline__overlay-text">{overlay.text}</span>
                <div
                  className="timeline__overlay-resize-handle timeline__overlay-resize-handle--right"
                  onMouseDown={(e: React.MouseEvent) => handleOverlayResizeStart(e, overlay, 'right')}
                />
              </div>
            );
          })}
        </div>
      )}

      <div
        className="timeline__track"
        ref={timelineRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDrop={handleTrackDrop}
        onDragOver={handleTrackDragOver}
      >
        <div className="timeline__segments">
          {segments.map((segment, index) => {
            const baseDuration = composedDuration || 1;

            const segmentDuration = segment.end - segment.start;
            const widthPercent = (segmentDuration / baseDuration) * 100;

            // Calculate left position based on cumulative duration of previous segments
            let leftPercent = 0;
            for (let i = 0; i < index; i++) {
              leftPercent += ((segments[i].end - segments[i].start) / baseDuration) * 100;
            }

            const isDropTarget = dropTargetIndex === index;
            const isDraggedItem = draggedSegmentIndex === index;

            // Get clip info for color-coding
            const clip = clips[segment.clipId];
            const clipColor = clip?.color || '#46962b';
            const clipName = clip?.name || 'Clip';
            const clipInitial = clipName.charAt(0).toUpperCase();
            const hasMultipleClips = Object.keys(clips).length > 1;

            const isTouchDragging = touchReorder?.index === index && touchReorder?.moved;

            return (
              <div
                key={segment.id}
                className={`timeline__segment ${selectedSegmentId === segment.id ? 'timeline__segment--selected' : ''} ${isDropTarget ? 'timeline__segment--drop-target' : ''} ${isDraggedItem ? 'timeline__segment--dragging' : ''} ${isTouchDragging ? 'timeline__segment--touch-dragging' : ''}`}
                style={{
                  left: `${leftPercent}%`,
                  width: `${widthPercent}%`,
                  ['--segment-color' as string]: clipColor,
                  backgroundColor: `${clipColor}22`,
                  borderColor: clipColor
                } as React.CSSProperties}
                onClick={(e: React.MouseEvent) => handleSegmentClick(e, segment.id)}
                onTouchStart={(e) => handleSegmentTouchStart(e, index, segment.id)}
                onTouchMove={handleSegmentTouchMove}
                onTouchEnd={handleSegmentTouchEnd}
                title={`${clipName}: ${formatDisplayTime(segment.start)} - ${formatDisplayTime(segment.end)}`}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
              >
                {/* DISABLED: Edge resize handles
                <div
                  className="timeline__segment-resize-handle timeline__segment-resize-handle--left"
                  onMouseDown={(e: React.MouseEvent) => handleResizeStart(e, segment, index, 'left')}
                />
                <div
                  className="timeline__segment-resize-handle timeline__segment-resize-handle--right"
                  onMouseDown={(e: React.MouseEvent) => handleResizeStart(e, segment, index, 'right')}
                />
                */}

                {segments.length > 1 && (
                  <div
                    className="timeline__segment-drag-handle"
                    title="Ziehen zum Verschieben"
                    draggable
                    onDragStart={(e: React.DragEvent) => handleDragStart(e, index)}
                    onDragEnd={handleDragEnd}
                  >
                    <FiMove />
                  </div>
                )}

                {/* Clip indicator badge - only show if multiple clips */}
                {hasMultipleClips && (
                  <div
                    className="timeline__segment-clip-indicator"
                    style={{ backgroundColor: clipColor }}
                    title={clipName}
                  >
                    {clipInitial}
                  </div>
                )}

                <div className="timeline__segment-content">
                  <span className="timeline__segment-number">{index + 1}</span>
                  <span className="timeline__segment-time">
                    {formatDisplayTime(segment.end - segment.start)}
                  </span>
                </div>

                {segments.length > 1 && selectedSegmentId === segment.id && (
                  <button
                    className="timeline__segment-delete"
                    onClick={(e: React.MouseEvent) => handleDeleteSegment(e, segment.id)}
                    aria-label="Segment löschen"
                    title="Segment löschen"
                  >
                    <FiTrash2 />
                  </button>
                )}

                <div className="timeline__segment-range">
                  <span>{formatDisplayTime(segment.start)}</span>
                  <span>-</span>
                  <span>{formatDisplayTime(segment.end)}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="timeline__playhead"
          style={{ left: `${playheadPosition}%` }}
        >
          <div className="timeline__playhead-head" />
          <div className="timeline__playhead-line" />
        </div>
      </div>

      <div className="timeline__time-markers">
        {[0, 0.25, 0.5, 0.75, 1].map((percent) => (
          <span key={percent} className="timeline__time-marker">
            {formatDisplayTime(percent * composedDuration)}
          </span>
        ))}
      </div>

      {contextMenu && (
        <>
          <div className="timeline__context-menu-backdrop" onClick={handleContextMenuClose} />
          <div
            className="timeline__context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button onClick={() => { deleteSegment(contextMenu.segmentId); handleContextMenuClose(); }}>
              Löschen
            </button>
            {contextMenu.index > 0 && (
              <button onClick={() => { reorderSegments(contextMenu.index, contextMenu.index - 1); handleContextMenuClose(); }}>
                Nach vorne
              </button>
            )}
            {contextMenu.index < segments.length - 1 && (
              <button onClick={() => { reorderSegments(contextMenu.index, contextMenu.index + 1); handleContextMenuClose(); }}>
                Nach hinten
              </button>
            )}
          </div>
        </>
      )}

      {editingSubtitle !== null && (
        <div
          className={`timeline__edit-overlay ${isMobile ? 'timeline__edit-overlay--mobile' : ''}`}
          onClick={handleEditCancel}
        >
          <div
            className={`timeline__edit-popup ${isMobile ? 'timeline__edit-popup--bottom-sheet' : ''}`}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div className="timeline__edit-popup-header">
              <span className="timeline__edit-popup-time">
                {formatDisplayTime(editingSubtitle.startTime)} - {formatDisplayTime(editingSubtitle.endTime)}
              </span>
              <button
                className="timeline__edit-popup-close"
                onClick={handleEditCancel}
                aria-label="Schließen"
              >
                ×
              </button>
            </div>
            <textarea
              ref={editInputRef}
              className="timeline__edit-popup-input"
              value={editText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditText(e.target.value)}
              onKeyDown={handleEditKeyDown}
              rows={2}
            />
            <div className="timeline__edit-popup-actions">
              <button
                className="timeline__edit-popup-cancel"
                onClick={handleEditCancel}
              >
                Abbrechen
              </button>
              <button
                className="timeline__edit-popup-save"
                onClick={handleEditSave}
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {showPreview && previewFrame !== null && (() => {
        const width = compositionWidth || 1920;
        const height = compositionHeight || 1080;
        const aspectRatio = width / height;
        const previewWidth = 140;
        const previewHeight = Math.round(previewWidth / aspectRatio);
        const fps = compositionFps || 30;
        const totalFrames = Math.max(1, Math.round(composedDuration * fps));
        const safeFrame = Math.min(Math.max(0, previewFrame), totalFrames - 1);

        return (
          <div
            className="timeline__preview-popup"
            style={{
              left: previewPosition.x,
              top: previewPosition.y - 10
            }}
          >
            <Thumbnail
              component={VideoComposition as unknown as React.ComponentType<Record<string, unknown>>}
              frameToDisplay={safeFrame}
              compositionWidth={width}
              compositionHeight={height}
              durationInFrames={totalFrames}
              fps={fps}
              inputProps={{
                clips,
                segments,
                subtitles: null,
                stylePreference: null,
                videoUrl: null
              }}
              style={{
                width: previewWidth,
                height: previewHeight,
                borderRadius: '4px',
                overflow: 'hidden'
              }}
              renderLoading={() => (
                <div
                  style={{
                    width: previewWidth,
                    height: previewHeight,
                    background: 'var(--background-color-secondary, #2a2a2a)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px'
                  }}
                >
                  <span style={{ color: 'var(--font-color-secondary, #666)', fontSize: '11px' }}>
                    Loading...
                  </span>
                </div>
              )}
            />
            <div className="timeline__preview-time">
              {formatDisplayTime(safeFrame / fps)}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default Timeline;

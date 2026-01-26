import { Player, type PlayerRef } from '@remotion/player';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';

import useVideoEditorStore from '../../../../stores/videoEditorStore';

import VideoComposition from './VideoComposition';

import './VideoEditorPlayer.css';

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

interface VideoEditorPlayerProps {
  className?: string;
  subtitles?: string;
  stylePreference?: string;
}

interface TimeUpdateEvent {
  detail: {
    frame: number;
  };
}

/**
 * Video Editor Player
 * Wraps Remotion Player with store integration for timeline editing
 * Supports multiple clips via clips registry
 */
const VideoEditorPlayer = ({ className, subtitles, stylePreference }: VideoEditorPlayerProps) => {
  const playerRef = useRef<PlayerRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inlineInputRef = useRef<HTMLTextAreaElement>(null);
  const [isDraggingOverlay, setIsDraggingOverlay] = useState(false);
  const [draggingOverlayId, setDraggingOverlayId] = useState<number | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragStartPosition, setDragStartPosition] = useState({ x: 50, y: 20 });
  const [editingOverlayId, setEditingOverlayId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [containerWidth, setContainerWidth] = useState(0);
  const [isResizingOverlay, setIsResizingOverlay] = useState(false);
  const [resizingOverlayId, setResizingOverlayId] = useState<number | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(60);
  const [isOnResizeEdge, setIsOnResizeEdge] = useState(false);

  const {
    clips,
    segments,
    compositionFps,
    compositionWidth,
    compositionHeight,
    isPlaying,
    setCurrentTime,
    setIsPlaying,
    getComposedDuration,
    getClipCount,
    textOverlays,
    selectedOverlayId,
    selectOverlay,
    updateOverlayPosition,
    updateOverlayWidth,
    commitOverlayPosition,
    updateTextOverlay,
    currentTime,
    // Legacy fallbacks
    videoUrl,
    fps,
    width,
    height,
  } = useVideoEditorStore();

  // Use composition values, fallback to legacy for backward compatibility
  const effectiveFps = compositionFps || fps || 30;
  const effectiveWidth = compositionWidth || width || 1920;
  const effectiveHeight = compositionHeight || height || 1080;

  const composedDuration = getComposedDuration();
  const durationInFrames = Math.max(1, Math.round(composedDuration * effectiveFps));

  const inputProps = useMemo(
    () => ({
      clips,
      segments,
      subtitles,
      stylePreference,
      videoUrl,
      textOverlays,
      selectedOverlayId,
      editingOverlayId,
    }),
    [
      clips,
      segments,
      subtitles,
      stylePreference,
      videoUrl,
      textOverlays,
      selectedOverlayId,
      editingOverlayId,
    ]
  );

  const handleTimeUpdate = useCallback(
    (e: TimeUpdateEvent) => {
      const currentFrame = e.detail.frame;
      const timeInSeconds = currentFrame / effectiveFps;
      setCurrentTime(timeInSeconds);
    },
    [effectiveFps, setCurrentTime]
  );

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
  }, [setIsPlaying]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, [setIsPlaying]);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
  }, [setIsPlaying]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    player.addEventListener('timeupdate', handleTimeUpdate);
    player.addEventListener('play', handlePlay);
    player.addEventListener('pause', handlePause);
    player.addEventListener('ended', handleEnded);

    return () => {
      player.removeEventListener('timeupdate', handleTimeUpdate);
      player.removeEventListener('play', handlePlay);
      player.removeEventListener('pause', handlePause);
      player.removeEventListener('ended', handleEnded);
    };
  }, [handleTimeUpdate, handlePlay, handlePause, handleEnded]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    if (isPlaying) {
      player.play();
    } else {
      player.pause();
    }
  }, [isPlaying]);

  const seekToTime = useCallback(
    (timeInSeconds: number) => {
      const player = playerRef.current;
      if (!player) return;

      const frame = Math.round(timeInSeconds * effectiveFps);
      player.seekTo(frame);
    },
    [effectiveFps]
  );

  useEffect(() => {
    useVideoEditorStore.setState({ seekToTime });
  }, [seekToTime]);

  useEffect(() => {
    const updateContainerWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    const timer = setTimeout(updateContainerWidth, 100);
    window.addEventListener('resize', updateContainerWidth);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateContainerWidth);
    };
  }, [segments]);

  const getVisibleOverlays = useCallback(() => {
    return textOverlays.filter(
      (overlay) => currentTime >= overlay.startTime && currentTime < overlay.endTime
    );
  }, [textOverlays, currentTime]);

  const findOverlayAtPosition = useCallback(
    (clientX: number, clientY: number): TextOverlay | null => {
      if (!containerRef.current) return null;

      const rect = containerRef.current.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const clickY = clientY - rect.top;
      const clickXPercent = (clickX / rect.width) * 100;
      const clickYPercent = (clickY / rect.height) * 100;

      const visibleOverlays = getVisibleOverlays();
      const tolerance = 8;

      for (const overlay of visibleOverlays) {
        const overlayX = overlay.xPosition || 50;
        const overlayY = overlay.yPosition;
        const distX = Math.abs(clickXPercent - overlayX);
        const distY = Math.abs(clickYPercent - overlayY);
        if (distX < 15 && distY < tolerance) {
          return overlay;
        }
      }
      return null;
    },
    [getVisibleOverlays]
  );

  const checkResizeEdge = useCallback(
    (clientX: number, clientY: number): { isOnEdge: boolean; overlay: TextOverlay | null } => {
      if (!containerRef.current) return { isOnEdge: false, overlay: null };

      const rect = containerRef.current.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const clickY = clientY - rect.top;
      const clickXPercent = (clickX / rect.width) * 100;
      const clickYPercent = (clickY / rect.height) * 100;

      const visibleOverlays = getVisibleOverlays();
      const edgeTolerance = 3;
      const yTolerance = 8;

      for (const overlay of visibleOverlays) {
        const overlayX = overlay.xPosition || 50;
        const overlayY = overlay.yPosition;
        const overlayWidth = overlay.width || 60;
        const rightEdgeX = overlayX + overlayWidth / 2;
        const distToRightEdge = Math.abs(clickXPercent - rightEdgeX);
        const distY = Math.abs(clickYPercent - overlayY);

        if (distToRightEdge < edgeTolerance && distY < yTolerance) {
          return { isOnEdge: true, overlay };
        }
      }
      return { isOnEdge: false, overlay: null };
    },
    [getVisibleOverlays]
  );

  const handleOverlayInteractionMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isDraggingOverlay || isResizingOverlay) return;

      const { isOnEdge } = checkResizeEdge(e.clientX, e.clientY);
      setIsOnResizeEdge(isOnEdge);
    },
    [isDraggingOverlay, isResizingOverlay, checkResizeEdge]
  );

  const handleOverlayMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const { isOnEdge, overlay: resizeOverlay } = checkResizeEdge(e.clientX, e.clientY);

      if (isOnEdge && resizeOverlay) {
        e.preventDefault();
        e.stopPropagation();
        setResizingOverlayId(resizeOverlay.id);
        setIsResizingOverlay(true);
        setResizeStartX(e.clientX);
        setResizeStartWidth(resizeOverlay.width || 60);
        return;
      }

      const clickedOverlay = findOverlayAtPosition(e.clientX, e.clientY);

      if (clickedOverlay) {
        e.preventDefault();
        e.stopPropagation();
        setDraggingOverlayId(clickedOverlay.id);
        setIsDraggingOverlay(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        setDragStartPosition({ x: clickedOverlay.xPosition || 50, y: clickedOverlay.yPosition });
      }
    },
    [checkResizeEdge, findOverlayAtPosition]
  );

  const handleOverlayDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const clickedOverlay = findOverlayAtPosition(e.clientX, e.clientY);

      if (clickedOverlay) {
        e.preventDefault();
        e.stopPropagation();
        if (containerRef.current) {
          setContainerWidth(containerRef.current.offsetWidth);
        }
        setEditingOverlayId(clickedOverlay.id);
        setEditingText(clickedOverlay.text);
      }
    },
    [findOverlayAtPosition]
  );

  const handleInlineInputChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setEditingText(e.target.value);
  }, []);

  const handleInlineInputBlur = useCallback(() => {
    if (editingOverlayId && editingText.trim()) {
      updateTextOverlay(editingOverlayId, { text: editingText });
    }
    setEditingOverlayId(null);
    setEditingText('');
  }, [editingOverlayId, editingText, updateTextOverlay]);

  const handleInlineInputKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      setEditingOverlayId(null);
      setEditingText('');
    }
  }, []);

  useEffect(() => {
    if (editingOverlayId && inlineInputRef.current) {
      inlineInputRef.current.focus();
      inlineInputRef.current.select();
    }
  }, [editingOverlayId]);

  const editingOverlay = editingOverlayId
    ? textOverlays.find((o) => o.id === editingOverlayId)
    : null;

  const handleOverlayMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDraggingOverlay || !containerRef.current || !draggingOverlayId) return;

      const rect = containerRef.current.getBoundingClientRect();
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      const deltaXPercent = (deltaX / rect.width) * 100;
      const deltaYPercent = (deltaY / rect.height) * 100;
      const newX = dragStartPosition.x + deltaXPercent;
      const newY = dragStartPosition.y + deltaYPercent;

      updateOverlayPosition(draggingOverlayId, newX, newY);
    },
    [isDraggingOverlay, draggingOverlayId, dragStart, dragStartPosition, updateOverlayPosition]
  );

  const handleOverlayMouseUp = useCallback(() => {
    if (isDraggingOverlay) {
      commitOverlayPosition();
      setIsDraggingOverlay(false);
      setDraggingOverlayId(null);
    }
  }, [isDraggingOverlay, commitOverlayPosition]);

  const handleResizeMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizingOverlay || !containerRef.current || !resizingOverlayId) return;

      const rect = containerRef.current.getBoundingClientRect();
      const deltaX = e.clientX - resizeStartX;
      const deltaWidthPercent = (deltaX / rect.width) * 100 * 2;
      const newWidth = resizeStartWidth + deltaWidthPercent;

      updateOverlayWidth(resizingOverlayId, newWidth);
    },
    [isResizingOverlay, resizingOverlayId, resizeStartX, resizeStartWidth, updateOverlayWidth]
  );

  const handleResizeMouseUp = useCallback(() => {
    if (isResizingOverlay) {
      commitOverlayPosition();
      setIsResizingOverlay(false);
      setResizingOverlayId(null);
    }
  }, [isResizingOverlay, commitOverlayPosition]);

  useEffect(() => {
    if (isDraggingOverlay) {
      window.addEventListener('mousemove', handleOverlayMouseMove);
      window.addEventListener('mouseup', handleOverlayMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleOverlayMouseMove);
      window.removeEventListener('mouseup', handleOverlayMouseUp);
    };
  }, [isDraggingOverlay, handleOverlayMouseMove, handleOverlayMouseUp]);

  useEffect(() => {
    if (isResizingOverlay) {
      window.addEventListener('mousemove', handleResizeMouseMove);
      window.addEventListener('mouseup', handleResizeMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleResizeMouseMove);
      window.removeEventListener('mouseup', handleResizeMouseUp);
    };
  }, [isResizingOverlay, handleResizeMouseMove, handleResizeMouseUp]);

  // Check for valid clips or fallback videoUrl
  const hasClips = clips && Object.keys(clips).length > 0;
  const hasValidSource = hasClips || videoUrl;

  if (!hasValidSource || segments.length === 0) {
    return (
      <div className={`video-editor-player video-editor-player--empty ${className || ''}`}>
        <div className="video-editor-player__placeholder">Video wird geladen...</div>
      </div>
    );
  }

  const aspectRatio = effectiveWidth && effectiveHeight ? effectiveWidth / effectiveHeight : 16 / 9;
  const isVertical = aspectRatio < 1;

  const hasVisibleOverlays = getVisibleOverlays().length > 0;

  return (
    <div
      className={`video-editor-player ${isVertical ? 'video-editor-player--vertical' : 'video-editor-player--horizontal'} ${className || ''}`}
    >
      <div
        ref={containerRef}
        className="video-editor-player__container"
        style={{ aspectRatio: `${effectiveWidth} / ${effectiveHeight}` }}
      >
        <Player
          ref={playerRef}
          component={VideoComposition as unknown as React.ComponentType<Record<string, unknown>>}
          inputProps={inputProps}
          durationInFrames={durationInFrames}
          fps={effectiveFps}
          compositionWidth={effectiveWidth}
          compositionHeight={effectiveHeight}
          style={{
            width: '100%',
            height: '100%',
          }}
          controls={false}
          loop={false}
          autoPlay={false}
          clickToPlay={!hasVisibleOverlays}
        />
        {hasVisibleOverlays && !editingOverlayId && (
          <div
            className={`video-editor-player__overlay-interaction ${isDraggingOverlay ? 'video-editor-player__overlay-interaction--dragging' : ''} ${isResizingOverlay ? 'video-editor-player__overlay-interaction--resizing' : ''} ${isOnResizeEdge ? 'video-editor-player__overlay-interaction--resize-edge' : ''}`}
            onMouseDown={handleOverlayMouseDown}
            onMouseMove={handleOverlayInteractionMove}
            onDoubleClick={handleOverlayDoubleClick}
          />
        )}
        {editingOverlay &&
          containerWidth > 0 &&
          (() => {
            const scale = containerWidth / effectiveWidth;
            const fontSize = Math.round(48 * scale);
            const shadowBlur1 = Math.max(1, Math.round(4 * scale));
            const shadowBlur2 = Math.max(1, Math.round(8 * scale));
            return (
              <textarea
                ref={inlineInputRef}
                className="video-editor-player__inline-input"
                value={editingText}
                onChange={handleInlineInputChange}
                onBlur={handleInlineInputBlur}
                onKeyDown={handleInlineInputKeyDown}
                rows={3}
                style={{
                  top: `${editingOverlay.yPosition}%`,
                  left: `${editingOverlay.xPosition || 50}%`,
                  width: `${editingOverlay.width || 60}%`,
                  fontSize: `${fontSize}px`,
                  textShadow: `2px 2px ${shadowBlur1}px rgba(0,0,0,0.8), 0 0 ${shadowBlur2}px rgba(0,0,0,0.5)`,
                }}
              />
            );
          })()}
      </div>
    </div>
  );
};

export default VideoEditorPlayer;

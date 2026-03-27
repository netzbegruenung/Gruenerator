// Erweiterter Video-Player - Unterstützt Segmentwiedergabe und Vorschau

import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
  Eye,
  EyeOff,
  Download,
  Loader2,
} from 'lucide-react';
import {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
  useImperativeHandle,
  forwardRef,
} from 'react';

import { useElementSize } from '../hooks/useElementSize';
import { useChunks } from '../stores/historyStore';
import { formatTime } from '../utils/timeUtils';

import { SubtitleOverlay } from './SubtitleOverlay';

import type { SubtitleStyle } from './SubtitleSettings';

import { cn } from '@/utils/cn';

interface BetaVideoPlayerProps {
  className?: string;
  videoUrl?: string;
  onTimeUpdate?: (time: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  subtitleStyle?: SubtitleStyle;
  onSubtitleStyleChange?: (style: SubtitleStyle) => void;
  onExport?: () => void;
  isExporting?: boolean;
}

export interface BetaVideoPlayerRef {
  seekTo: (time: number) => void;
}

export const BetaVideoPlayer = forwardRef<BetaVideoPlayerRef, BetaVideoPlayerProps>(
  (
    {
      className,
      videoUrl,
      onTimeUpdate,
      onPlay,
      onPause,
      subtitleStyle,
      onSubtitleStyleChange,
      onExport,
      isExporting,
    },
    ref
  ) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const progressBarRef = useRef<HTMLDivElement>(null);
    const videoContainerRef = useRef<HTMLDivElement>(null);
    const chunks = useChunks();

    // Videocontainer-Größe ermitteln
    const containerSize = useElementSize(videoContainerRef);

    const [isPlaying, setIsPlaying] = useState(false);
    const [localCurrentTime, setLocalCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [previewMode, setPreviewMode] = useState(false);

    // Drag-bezogener Zustand
    const [isDragging, setIsDragging] = useState(false);
    const [dragTime, setDragTime] = useState(0);
    const [dragPercentage, setDragPercentage] = useState(0); // Positionsprozentsatz beim Ziehen
    const [wasPlayingBeforeDrag, setWasPlayingBeforeDrag] = useState(false);

    // Videogrößen-Status
    const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });

    // Tatsächliche Anzeigegröße des Videos im Container berechnen (unter Berücksichtigung von object-contain)
    const actualVideoDisplaySize = useMemo(() => {
      if (
        !containerSize?.width ||
        !containerSize?.height ||
        !videoDimensions.width ||
        !videoDimensions.height
      ) {
        return { width: 0, height: 0 };
      }

      const containerAspectRatio = containerSize.width / containerSize.height;
      const videoAspectRatio = videoDimensions.width / videoDimensions.height;

      if (videoAspectRatio > containerAspectRatio) {
        // Video ist breiter, Containerbreite ist maßgebend
        const displayWidth = containerSize.width;
        const displayHeight = displayWidth / videoAspectRatio;
        return { width: displayWidth, height: displayHeight };
      } else {
        // Video ist höher oder gleiches Seitenverhältnis, Containerhöhe ist maßgebend
        const displayHeight = containerSize.height;
        const displayWidth = displayHeight * videoAspectRatio;
        return { width: displayWidth, height: displayHeight };
      }
    }, [containerSize, videoDimensions]);

    // Untertitel-bezogener Zustand - Lokaler Zustand entfernt, extern übergeben
    // const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(defaultSubtitleStyle);
    // const [showSubtitleSettings, setShowSubtitleSettings] = useState(false);

    // Beibehaltene Segmente basierend auf Chunks-Daten berechnen
    const keptSegments = useMemo(() => {
      return chunks
        .filter((chunk) => !chunk.deleted)
        .map((chunk) => ({
          id: chunk.id,
          start: chunk.timestamp[0],
          end: chunk.timestamp[1],
          duration: chunk.timestamp[1] - chunk.timestamp[0],
          text: chunk.text,
        }))
        .sort((a, b) => a.start - b.start);
    }, [chunks]);

    // Gelöschte Segmente - Derzeit nicht verwendet, aber für zukünftige Funktionserweiterungen beibehalten
    // const deletedSegments = useMemo(() => {
    //   return chunks
    //     .filter(chunk => chunk.deleted)
    //     .map(chunk => ({
    //       id: chunk.id,
    //       start: chunk.timestamp[0],
    //       end: chunk.timestamp[1],
    //       duration: chunk.timestamp[1] - chunk.timestamp[0],
    //       text: chunk.text
    //     }))
    //     .sort((a, b) => a.start - b.start);
    // }, [chunks]);

    // Neue Zeitleisten-Zeit berechnen (komprimierte Zeit im Vorschaumodus)
    const newTimelineTime = useMemo(() => {
      if (!previewMode || keptSegments.length === 0) return localCurrentTime;

      let newTime = 0;
      for (const segment of keptSegments) {
        if (localCurrentTime >= segment.start && localCurrentTime <= segment.end) {
          // Aktuelle Zeit liegt in diesem beibehaltenen Segment
          newTime += localCurrentTime - segment.start;
          break;
        } else if (localCurrentTime > segment.end) {
          // Aktuelle Zeit liegt nach diesem Segment
          newTime += segment.duration;
        } else {
          // Aktuelle Zeit liegt vor diesem Segment
          break;
        }
      }
      return newTime;
    }, [localCurrentTime, previewMode, keptSegments]);

    // Gesamtdauer der neuen Zeitleiste
    const newTimelineDuration = useMemo(() => {
      if (!previewMode) return duration;
      return keptSegments.reduce((total, segment) => total + segment.duration, 0);
    }, [previewMode, duration, keptSegments]);

    // Prüfen, ob die aktuelle Zeit in einem beibehaltenen Segment liegt
    const isTimeInKeptSegments = useCallback(
      (time: number) => {
        return keptSegments.some((segment) => time >= segment.start && time <= segment.end);
      },
      [keptSegments]
    );

    // Nächstes beibehaltenes Segment finden
    const findNextKeptSegment = useCallback(
      (currentTime: number) => {
        return keptSegments.find((segment) => segment.start > currentTime);
      },
      [keptSegments]
    );

    // Video-Zeitaktualisierung verarbeiten
    const handleTimeUpdate = useCallback(() => {
      if (!videoRef.current || isDragging) return; // timeupdate-Events beim Ziehen ignorieren

      const time = videoRef.current.currentTime;
      setLocalCurrentTime(time);

      // Im Vorschaumodus prüfen, ob gelöschte Segmente übersprungen werden müssen
      if (previewMode && keptSegments.length > 0 && isPlaying) {
        if (!isTimeInKeptSegments(time)) {
          // Aktuelle Zeit in gelöschtem Segment, zum nächsten beibehaltenen Segment springen
          const nextSegment = findNextKeptSegment(time);

          if (nextSegment) {
            videoRef.current.currentTime = nextSegment.start;
            return;
          } else {
            // Keine weiteren Segmente, Wiedergabe pausieren
            videoRef.current.pause();
            setIsPlaying(false);
            onPause?.();
            return;
          }
        }
      }

      // Externe Komponenten über Zeitaktualisierung benachrichtigen (neue oder originale Zeitleiste)
      const notifyTime =
        previewMode && keptSegments.length > 0 ? newTimelineTime : localCurrentTime;
      onTimeUpdate?.(notifyTime);
    }, [
      previewMode,
      keptSegments,
      isPlaying,
      isTimeInKeptSegments,
      findNextKeptSegment,
      newTimelineTime,
      onTimeUpdate,
      onPause,
      localCurrentTime,
      isDragging,
    ]);

    // Abspielen/Pausieren
    const togglePlayPause = useCallback(() => {
      if (!videoRef.current) return;

      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
        onPause?.();
      } else {
        videoRef.current.play();
        setIsPlaying(true);
        onPlay?.();
      }
    }, [isPlaying, onPlay, onPause]);

    // Zu bestimmter Zeit springen
    const seekTo = useCallback(
      (time: number) => {
        if (!videoRef.current) return;

        let targetTime = time;

        // Im Vorschaumodus muss die neue Zeitleisten-Zeit in die Originalzeit umgerechnet werden
        if (previewMode && keptSegments.length > 0) {
          // Neue Zeitleisten-Zeit auf Originalzeit zurückmappen
          let remainingTime = Math.max(0, time);
          targetTime = keptSegments[0]?.start || 0; // Standard: Anfang des ersten Segments

          for (const segment of keptSegments) {
            if (remainingTime <= segment.duration) {
              targetTime = segment.start + remainingTime;
              break;
            } else {
              remainingTime -= segment.duration;
            }
          }

          // Sicherstellen, dass targetTime die Gesamtlänge des Videos nicht überschreitet
          if (targetTime > duration) {
            targetTime = duration;
          }
        }

        videoRef.current.currentTime = targetTime;
        setLocalCurrentTime(targetTime);
      },
      [previewMode, keptSegments]
    );

    // Vor-/Zurückspulen
    const skip = useCallback(
      (seconds: number) => {
        if (!videoRef.current) return;

        const newTime = Math.max(0, Math.min(duration, localCurrentTime + seconds));
        seekTo(newTime);
      },
      [localCurrentTime, duration, seekTo]
    );

    // Lautstärkeregelung
    const toggleMute = useCallback(() => {
      if (!videoRef.current) return;

      const newMuted = !isMuted;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
    }, [isMuted]);

    const changeVolume = useCallback(
      (newVolume: number) => {
        if (!videoRef.current) return;

        const clampedVolume = Math.max(0, Math.min(1, newVolume));
        videoRef.current.volume = clampedVolume;
        setVolume(clampedVolume);

        if (clampedVolume === 0) {
          setIsMuted(true);
          videoRef.current.muted = true;
        } else if (isMuted) {
          setIsMuted(false);
          videoRef.current.muted = false;
        }
      },
      [isMuted]
    );

    // Vorschaumodus umschalten
    const togglePreviewMode = useCallback(() => {
      setPreviewMode((prev) => !prev);
    }, []);

    // seekTo-Methode für externe Komponenten bereitstellen
    useImperativeHandle(
      ref,
      () => ({
        seekTo,
      }),
      [seekTo]
    );

    // Drag-Event-Verarbeitung
    const handleProgressMouseDown = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!progressBarRef.current || !videoRef.current) return;

        const rect = progressBarRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, clickX / rect.width));
        const targetDuration = previewMode ? newTimelineDuration : duration;
        const newTime = percentage * targetDuration;

        // Wiedergabestatus vor dem Ziehen merken
        setWasPlayingBeforeDrag(isPlaying);
        setIsDragging(true);
        setDragTime(newTime);
        setDragPercentage(percentage);

        // Video pausieren für Echtzeit-Vorschau
        if (isPlaying) {
          videoRef.current.pause();
          setIsPlaying(false);
        }

        // Videozeit sofort setzen
        let videoTime = newTime;
        if (previewMode && keptSegments.length > 0) {
          // Neue Zeitleisten-Zeit auf Originalzeit zurückmappen
          let remainingTime = Math.max(0, newTime);
          videoTime = keptSegments[0]?.start || 0; // Standard: Anfang des ersten Segments

          for (const segment of keptSegments) {
            if (remainingTime <= segment.duration) {
              videoTime = segment.start + remainingTime;
              break;
            } else {
              remainingTime -= segment.duration;
            }
          }

          // Sicherstellen, dass videoTime die Gesamtlänge des Videos nicht überschreitet
          if (videoTime > duration) {
            videoTime = duration;
          }
        }

        videoRef.current.currentTime = videoTime;
        setLocalCurrentTime(videoTime);
      },
      [previewMode, newTimelineDuration, duration, isPlaying, keptSegments]
    );

    const handleProgressMouseMove = useCallback(
      (e: MouseEvent) => {
        if (!isDragging || !progressBarRef.current || !videoRef.current) return;

        const rect = progressBarRef.current.getBoundingClientRect();
        const moveX = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, moveX / rect.width));
        const targetDuration = previewMode ? newTimelineDuration : duration;
        const newTime = percentage * targetDuration;

        setDragTime(newTime);
        setDragPercentage(percentage);

        // Beim Ziehen Videozeit direkt setzen, Zeitkonvertierung von seekTo überspringen
        let videoTime = newTime;
        if (previewMode && keptSegments.length > 0) {
          // Neue Zeitleisten-Zeit auf Originalzeit zurückmappen
          let remainingTime = Math.max(0, newTime);
          videoTime = keptSegments[0]?.start || 0; // Standard: Anfang des ersten Segments

          for (const segment of keptSegments) {
            if (remainingTime <= segment.duration) {
              videoTime = segment.start + remainingTime;
              break;
            } else {
              remainingTime -= segment.duration;
            }
          }

          // Sicherstellen, dass videoTime die Gesamtlänge des Videos nicht überschreitet
          if (videoTime > duration) {
            videoTime = duration;
          }
        }

        videoRef.current.currentTime = videoTime;
        setLocalCurrentTime(videoTime);
      },
      [isDragging, previewMode, newTimelineDuration, duration, keptSegments]
    );

    const handleProgressMouseUp = useCallback(() => {
      if (!isDragging) return;

      setIsDragging(false);

      // Sicherstellen, dass der endgültige Zeitstatus korrekt ist
      if (videoRef.current) {
        const finalTime = videoRef.current.currentTime;
        setLocalCurrentTime(finalTime);

        // Externe Komponenten über Zeitaktualisierung benachrichtigen
        const notifyTime = previewMode && keptSegments.length > 0 ? dragTime || 0 : finalTime;
        onTimeUpdate?.(notifyTime);
      }

      // Wenn vor dem Ziehen abgespielt wurde, Wiedergabe fortsetzen
      if (wasPlayingBeforeDrag && videoRef.current) {
        videoRef.current.play();
        setIsPlaying(true);
        onPlay?.();
      }
    }, [
      isDragging,
      wasPlayingBeforeDrag,
      onPlay,
      previewMode,
      keptSegments,
      dragTime,
      onTimeUpdate,
    ]);

    // Globale Drag-Events binden
    useEffect(() => {
      if (isDragging) {
        document.addEventListener('mousemove', handleProgressMouseMove);
        document.addEventListener('mouseup', handleProgressMouseUp);

        return () => {
          document.removeEventListener('mousemove', handleProgressMouseMove);
          document.removeEventListener('mouseup', handleProgressMouseUp);
        };
      }
    }, [isDragging, handleProgressMouseMove, handleProgressMouseUp]);

    // Vollbild
    const toggleFullscreen = useCallback(() => {
      if (!videoRef.current) return;

      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen();
      }
    }, []);

    // Video-Events binden
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const handleLoadedMetadata = () => {
        setDuration(video.duration);
        setVideoDimensions({
          width: video.videoWidth,
          height: video.videoHeight,
        });
      };

      const handlePlay = () => {
        setIsPlaying(true);
        onPlay?.();
      };

      const handlePause = () => {
        setIsPlaying(false);
        onPause?.();
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('timeupdate', handleTimeUpdate);
      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);

      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
      };
    }, [handleTimeUpdate, onPlay, onPause]);

    // Tastenkürzel
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.target !== document.body) return;

        switch (e.code) {
          case 'Space':
            e.preventDefault();
            togglePlayPause();
            break;
          case 'ArrowLeft':
            e.preventDefault();
            skip(e.shiftKey ? -10 : -5);
            break;
          case 'ArrowRight':
            e.preventDefault();
            skip(e.shiftKey ? 10 : 5);
            break;
          case 'ArrowUp':
            e.preventDefault();
            changeVolume(volume + 0.1);
            break;
          case 'ArrowDown':
            e.preventDefault();
            changeVolume(volume - 0.1);
            break;
          case 'KeyM':
            e.preventDefault();
            toggleMute();
            break;
          case 'KeyF':
            e.preventDefault();
            toggleFullscreen();
            break;
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [togglePlayPause, skip, changeVolume, volume, toggleMute, toggleFullscreen]);

    if (!videoUrl) {
      return (
        <div className={cn('bg-muted rounded-lg flex items-center justify-center p-12', className)}>
          <div className="text-center">
            <div className="w-16 h-16 bg-muted-foreground/20 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Play className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">Bitte zuerst eine Videodatei hochladen</p>
          </div>
        </div>
      );
    }

    return (
      <div className={cn('overflow-hidden h-full flex flex-col', className)}>
        {/* Videobereich */}
        <div
          ref={videoContainerRef}
          className="relative flex-1 flex items-center justify-center overflow-hidden w-full min-h-0"
        >
          <video
            ref={videoRef}
            src={videoUrl}
            className="max-h-full max-w-full object-contain"
            onClick={togglePlayPause}
          />

          {/* Untertitel-Overlay */}
          {subtitleStyle &&
            actualVideoDisplaySize.width > 0 &&
            actualVideoDisplaySize.height > 0 && (
              <SubtitleOverlay
                currentTime={previewMode ? newTimelineTime : localCurrentTime}
                style={subtitleStyle}
                onStyleChange={onSubtitleStyleChange || (() => {})}
                containerDimensions={{
                  width: actualVideoDisplaySize.width,
                  height: actualVideoDisplaySize.height,
                }}
                videoDimensions={videoDimensions}
              />
            )}

          {/* Vorschaumodus-Anzeige */}
          {previewMode && keptSegments.length > 0 && (
            <div className="absolute top-4 right-4 bg-orange-500 text-white text-xs px-2 py-1 rounded-full">
              Vorschaumodus
            </div>
          )}
        </div>

        {/* Steuerungsleiste */}
        <div className="flex-shrink-0 px-3 py-2 space-y-2">
          {/* Fortschrittsbalken */}
          <div className="space-y-1">
            <div className="relative">
              <div
                ref={progressBarRef}
                className={cn(
                  'group w-full h-3 bg-muted rounded-full overflow-hidden cursor-pointer select-none',
                  isDragging && 'cursor-grabbing'
                )}
                onMouseDown={handleProgressMouseDown}
              >
                {/* Hintergrund-Fortschrittsbalken */}
                <div
                  className={cn(
                    'h-full bg-primary/30 transition-all',
                    isDragging && 'transition-none'
                  )}
                  style={{
                    width: `${((isDragging ? dragTime : previewMode ? newTimelineTime : localCurrentTime) / (previewMode ? newTimelineDuration : duration)) * 100}%`,
                  }}
                />

                {/* Beibehaltene Segmente anzeigen (im Vorschaumodus) */}
                {previewMode && keptSegments.length > 0 && (
                  <>
                    {keptSegments.map((segment, index) => {
                      // Position auf der neuen Zeitleiste berechnen
                      let segmentStartInNewTimeline = 0;
                      for (let i = 0; i < index; i++) {
                        segmentStartInNewTimeline += keptSegments[i].duration;
                      }

                      return (
                        <div
                          key={segment.id}
                          className="absolute top-0 h-full bg-green-500/60 pointer-events-none"
                          style={{
                            left: `${(segmentStartInNewTimeline / newTimelineDuration) * 100}%`,
                            width: `${(segment.duration / newTimelineDuration) * 100}%`,
                          }}
                        />
                      );
                    })}
                  </>
                )}

                {/* Aktueller Fortschritt */}
                <div
                  className={cn(
                    'h-full bg-primary transition-all',
                    isDragging && 'transition-none'
                  )}
                  style={{
                    width: isDragging
                      ? `${dragPercentage * 100}%` // Beim Ziehen direkt Prozentsatz verwenden
                      : `${((previewMode ? newTimelineTime : localCurrentTime) / (previewMode ? newTimelineDuration : duration)) * 100}%`,
                  }}
                />

                {/* Zieh-Griff */}
                <div
                  className={cn(
                    'absolute top-1/2 w-4 h-4 bg-primary rounded-full -translate-y-1/2 -translate-x-1/2 border-2 border-background shadow-lg transition-all transform pointer-events-none',
                    isDragging
                      ? 'scale-125 transition-none'
                      : 'hover:scale-110 opacity-0 group-hover:opacity-100'
                  )}
                  style={{
                    left: isDragging
                      ? `${dragPercentage * 100}%` // Beim Ziehen direkt Mauspositions-Prozentsatz verwenden
                      : `${((previewMode ? newTimelineTime : localCurrentTime) / (previewMode ? newTimelineDuration : duration)) * 100}%`,
                    opacity: isDragging ? 1 : undefined,
                  }}
                />
              </div>

              {/* Zeitanzeige beim Überfahren */}
              {isDragging && (
                <div
                  className="absolute -top-10 bg-background border rounded px-2 py-1 text-xs font-mono shadow-lg pointer-events-none"
                  style={{
                    left: `${dragPercentage * 100}%`, // Prozentuale Position verwenden
                    transform: 'translateX(-50%)',
                  }}
                >
                  {formatTime(dragTime)}
                </div>
              )}
            </div>

            {/* Zeitanzeige */}
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>
                {formatTime(
                  isDragging ? dragTime : previewMode ? newTimelineTime : localCurrentTime
                )}
                {isDragging && <span className="ml-1 text-primary">●</span>}
              </span>
              <span>{formatTime(previewMode ? newTimelineDuration : duration)}</span>
            </div>
          </div>

          {/* Steuerungsschaltflächen */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => skip(-10)}
                className="p-2 hover:bg-muted rounded-md transition-colors"
                title="10 Sekunden zurück"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                onClick={togglePlayPause}
                className="p-2 hover:bg-muted rounded-md transition-colors"
                title={isPlaying ? 'Pausieren' : 'Abspielen'}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>

              <button
                onClick={() => skip(10)}
                className="p-2 hover:bg-muted rounded-md transition-colors"
                title="10 Sekunden vor"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center space-x-2">
              {/* Vorschaumodus umschalten */}
              <button
                onClick={togglePreviewMode}
                className={cn(
                  'p-2 rounded-md transition-colors',
                  previewMode ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                )}
                title={previewMode ? 'Vorschaumodus beenden' : 'Vorschaumodus aktivieren'}
              >
                {previewMode ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>

              {/* Lautstärkeregelung */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={toggleMute}
                  className="p-2 hover:bg-muted rounded-md transition-colors"
                  title={isMuted ? 'Stummschaltung aufheben' : 'Stummschalten'}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>

                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => changeVolume(Number(e.target.value))}
                  className="w-20"
                />
              </div>

              {/* Vollbild */}
              <button
                onClick={toggleFullscreen}
                className="p-2 hover:bg-muted rounded-md transition-colors"
                title="Vollbild"
              >
                <Maximize className="w-4 h-4" />
              </button>

              {/* Export */}
              {onExport && (
                <button
                  onClick={onExport}
                  disabled={isExporting}
                  className="p-2 hover:bg-muted rounded-md transition-colors disabled:opacity-50"
                  title="Video exportieren"
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Vorschaumodus-Information */}
          {previewMode && keptSegments.length > 0 && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
              <div className="flex justify-between">
                <span>Vorschaumodus: Gelöschte Segmente werden übersprungen</span>
                <span>
                  Eingesparte Zeit: {formatTime(duration - newTimelineDuration)}(
                  {((newTimelineDuration / duration) * 100).toFixed(1)}% Beibehalten)
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

BetaVideoPlayer.displayName = 'BetaVideoPlayer';

import { useProjectsStore, validateSubtitleSegments } from '@gruenerator/shared';
import { Button } from '@gruenerator/ui';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FaSave, FaCheck, FaDownload, FaPlay, FaPause } from 'react-icons/fa';
import { HiCog } from 'react-icons/hi';

import Spinner from '../../../components/common/Spinner';
import FloatingActionButton from '../../../components/common/UI/FloatingActionButton';
import { useAuthStore } from '../../../stores/authStore';
import { useSubtitlerExportStore } from '../../../stores/subtitlerExportStore';
import { formatSubtitleBlocks } from '../utils/subtitleSegmentUtils';

import LiveSubtitlePreview from './LiveSubtitlePreview';
import Timeline from './Timeline';

import type {
  SubtitleSegment,
  VideoMetadata,
  StylePreference,
  HeightPreference,
  SubtitlePreference,
} from '../types';

/**
 * Minimal project reference the editor needs to attribute saves /
 * exports. The page-level `LoadedProject` shape is wider; we only read
 * `id` here, so the prop type is correspondingly narrow.
 */
interface EditorProjectRef {
  id: string;
}

import { cn } from '@/utils/cn';

interface FallbackButtonData {
  url?: string;
  filename?: string;
}

interface StyleOptionPreview extends React.CSSProperties {
  backgroundColor: string;
  color: string;
  textShadow: string;
  padding: string;
  borderRadius: string;
}

interface StyleOption {
  id: string;
  name: string;
  isRecommended?: boolean;
  preview: StyleOptionPreview;
}

interface HeightOption {
  id: string;
  name: string;
  subtitle: string;
}

interface QualityOption {
  id: string;
  name: string;
  subtitle: string;
}

/**
 * Subset of the wire video-metadata shape that the editor actually reads.
 * Wire shape is `videoMetadataSchema` in `@gruenerator/contracts`; we keep
 * a narrow subtype here so the editor doesn't have to handle every loose
 * field the JSONB column may contain.
 */
interface UploadVideoMetadata {
  duration?: number;
  width?: number;
  height?: number;
}

interface SubtitleEditorProps {
  videoFile?: File | Blob | null;
  videoUrl?: string | null;
  segments: SubtitleSegment[];
  onSegmentsChange: (segments: SubtitleSegment[]) => void;
  uploadId: string;
  subtitlePreference: SubtitlePreference;
  stylePreference?: StylePreference;
  heightPreference?: HeightPreference;
  onStyleChange?: (styleId: string) => void;
  onHeightChange?: (heightId: string) => void;
  onExportSuccess?: (token: string) => void;
  isExporting?: boolean;
  onExportComplete?: () => void;
  loadedProject?: EditorProjectRef | null;
  videoMetadataFromUpload?: UploadVideoMetadata | null;
  videoFilename?: string | null;
  videoSize?: number | null;
}

const SubtitleEditor: React.FC<SubtitleEditorProps> = ({
  videoFile,
  videoUrl: videoUrlProp,
  segments,
  onSegmentsChange,
  uploadId,
  subtitlePreference,
  stylePreference = 'shadow' as StylePreference,
  heightPreference = 'tief' as HeightPreference,
  onStyleChange,
  onHeightChange,
  onExportSuccess,
  isExporting,
  onExportComplete,
  loadedProject = null,
  videoMetadataFromUpload = null,
  videoFilename = null,
  videoSize = null,
}) => {
  const styleOptions: StyleOption[] = [
    {
      id: 'shadow',
      name: 'Empfohlen',
      isRecommended: true,
      preview: {
        backgroundColor: 'transparent',
        color: 'var(--font-color)',
        textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
        padding: '0',
        borderRadius: '0',
      },
    },
    {
      id: 'standard',
      name: 'Klassisch',
      preview: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        color: '#ffffff',
        textShadow: 'none',
        padding: '0.25em 0.5em',
        borderRadius: '0.2em',
      },
    },
    {
      id: 'clean',
      name: 'Minimal',
      preview: {
        backgroundColor: 'transparent',
        color: 'var(--font-color)',
        textShadow: 'none',
        padding: '0',
        borderRadius: '0',
      },
    },
    {
      id: 'tanne',
      name: 'Grün',
      preview: {
        backgroundColor: 'var(--secondary-600)',
        color: '#ffffff',
        textShadow: 'none',
        padding: '0.3em 0.6em',
        borderRadius: '0.2em',
      },
    },
  ];

  const heightOptions: HeightOption[] = [
    { id: 'tief', name: 'Tiefer', subtitle: 'Standard' },
    { id: 'standard', name: 'Mittig', subtitle: 'Etwa auf 40% Höhe' },
  ];

  const qualityOptions: QualityOption[] = [
    { id: 'normal', name: 'Standard', subtitle: 'Perfekt für Reels' },
    { id: 'hd', name: 'Volle Qualität', subtitle: 'Dauert länger' },
  ];

  const [localStyle, setLocalStyle] = useState(stylePreference);
  const [localHeight, setLocalHeight] = useState(heightPreference);
  const [localQuality, setLocalQuality] = useState('normal');

  // Sync local state when parent prop changes (avoids extra render vs useEffect)
  const [prevStylePref, setPrevStylePref] = useState(stylePreference);
  if (stylePreference !== prevStylePref) {
    setPrevStylePref(stylePreference);
    setLocalStyle(stylePreference);
  }
  const [prevHeightPref, setPrevHeightPref] = useState(heightPreference);
  if (heightPreference !== prevHeightPref) {
    setPrevHeightPref(heightPreference);
    setLocalHeight(heightPreference);
  }

  const handleLocalStyleChange = (styleId: string): void => {
    setLocalStyle(styleId as StylePreference);
    onStyleChange?.(styleId);
  };

  const handleLocalHeightChange = (heightId: string): void => {
    setLocalHeight(heightId as HeightPreference);
    onHeightChange?.(heightId);
  };

  const handleLocalQualityChange = (qualityId: string): void => {
    setLocalQuality(qualityId);
  };

  const exportStore = useSubtitlerExportStore();
  const {
    status: exportStatus,
    progress: exportProgress,
    error: exportError,
    exportToken,
    startExport,
    retryExport,
    resetExport,
    subscribe,
  } = exportStore;

  const { saveProject, updateProject, isSaving, saveSuccess } = useProjectsStore();

  const locale = useAuthStore((state) => state.locale);
  const user = useAuthStore((state) => state.user);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const segmentRefs = useRef<Record<number, HTMLElement>>({});
  // `videoUrl` either mirrors the prop (remote streaming URL for loaded
  // projects) or points at a freshly minted `URL.createObjectURL(...)`
  // over the local File/Blob when the user just uploaded. The blob path
  // requires an effect (lifecycle + revoke); the prop path is pure
  // derivation. Keeping the blob URL in a dedicated state lets us
  // combine them via a render-time ternary below.
  const [blobVideoUrl, setBlobVideoUrl] = useState<string | null>(null);
  const videoUrl = videoUrlProp ?? blobVideoUrl;
  const [error, setError] = useState<string | null>(null);
  const [currentTimeInSeconds, setCurrentTimeInSeconds] = useState<number>(0);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [showFallbackButton, setShowFallbackButton] = useState<FallbackButtonData | string | null>(
    null
  );
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [showStyling, setShowStyling] = useState<boolean>(false);
  const [isVideoVisible, setIsVideoVisible] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = subscribe();
    return unsubscribe;
  }, [subscribe]);

  useEffect(() => {
    if (exportStatus === 'exporting' && exportToken) {
      console.log('[SubtitleEditor] Export started with new token:', exportToken);
      onExportSuccess?.(exportToken);
    } else if (exportStatus === 'complete') {
      console.log('[SubtitleEditor] Export completed');
      onExportComplete?.();
    } else if (exportStatus === 'error' && exportError) {
      console.error('[SubtitleEditor] Export failed:', exportError);
      setError(exportError);
      onExportComplete?.();
    }
  }, [exportStatus, exportToken, exportError, onExportSuccess, onExportComplete]);

  const detectEmojis = (text: string): boolean => {
    const emojiRegex =
      /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]|[\u{FE0F}]/gu;
    return emojiRegex.test(text);
  };

  const formatTextWithEmojis = (text: string): string => {
    const emojiRegex =
      /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]|[\u{FE0F}]/gu;

    return text.replace(
      emojiRegex,
      (emoji: string) => `<span class="emoji-transparent">${emoji}</span>`
    );
  };

  // Blob URL lifecycle: create an object URL when we have a File/Blob
  // (no remote URL), revoke it on cleanup. If `videoUrlProp` is set, the
  // render-time ternary above picks it over any blob URL, but we still
  // avoid creating a blob URL we wouldn't use.
  useEffect(() => {
    if (videoUrlProp || !videoFile) return;
    if (!(videoFile instanceof File || videoFile instanceof Blob)) {
      setError('Ungültiges Video-Format');
      return;
    }
    const url = URL.createObjectURL(videoFile);
    setBlobVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [videoFile, videoUrlProp]);

  useEffect(() => {
    if (!videoRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVideoVisible(entry.isIntersecting);
      },
      { threshold: 0.5 }
    );

    observer.observe(videoRef.current);
    return () => observer.disconnect();
  }, [videoUrl]);

  const togglePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      void videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  }, []);

  const handleVideoLoadedMetadata = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const metadata = {
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
      };
      setVideoMetadata(metadata);
      setVideoDuration(video.duration);
    }
  };

  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      const currentTime = videoRef.current.currentTime;
      setCurrentTimeInSeconds(currentTime);
    }
  };

  const scrubTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTimelineSeek = useCallback((timeInSeconds: number): void => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    // Segments can end past the actual video duration (transcription
    // drift); the browser clamps silently, so clamp ourselves to keep
    // currentTimeInSeconds in sync with the real playback position.
    const maxTime = Number.isFinite(video.duration) ? video.duration : timeInSeconds;
    const clampedTime = Math.min(Math.max(0, timeInSeconds), maxTime);
    video.currentTime = clampedTime;
    setCurrentTimeInSeconds(clampedTime);

    if (scrubTimeoutRef.current) {
      clearTimeout(scrubTimeoutRef.current);
    }
    scrubTimeoutRef.current = setTimeout(() => {
      if (video.paused) {
        video
          .play()
          .then(() => video.pause())
          .catch(() => {});
      }
    }, 50);
  }, []);

  const scrollToSegment = useCallback((segmentId: number): void => {
    const element = segmentRefs.current[segmentId];
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const handleSegmentClick = useCallback(
    (segmentId: number): void => {
      setSelectedSegmentId(segmentId);
      const segment = segments.find((s) => s.id === segmentId);
      if (segment && videoRef.current) {
        videoRef.current.currentTime = segment.startTime;
      }
    },
    [segments]
  );

  const handleTextChange = useCallback(
    (segmentId: number, newText: string): void => {
      onSegmentsChange(
        segments.map((segment) =>
          segment.id === segmentId ? { ...segment, text: newText } : segment
        )
      );
    },
    [segments, onSegmentsChange]
  );

  if ((!videoFile && !videoUrlProp) || segments.length === 0) {
    console.log('[SubtitleEditor] Missing required props');
    return (
      <div className="w-full">
        <div className="py-xl text-center text-foreground">Lade Video und Untertitel...</div>
      </div>
    );
  }

  const handleExport = async (maxResolution: number | null = null): Promise<void> => {
    if (!uploadId || !segments.length) {
      setError('Fehlende Upload-ID oder keine Untertitel zum Exportieren.');
      return;
    }

    const validation = validateSubtitleSegments(segments, videoDuration || null);
    if (validation.allEmpty) {
      setError('Alle Untertitel sind leer — bitte füge Text hinzu, bevor du exportierst.');
      return;
    }
    if (validation.issues.length > 0) {
      const summary = validation.issues
        .slice(0, 5)
        .map((issue) => issue.message)
        .join('\n');
      const proceed = window.confirm(
        `Es gibt Probleme mit den Untertiteln:\n\n${summary}\n\nTrotzdem exportieren?`
      );
      if (!proceed) return;
    }

    try {
      setError(null);
      console.log('[SubtitleEditor] Starting export via store:', {
        uploadId,
        segmentCount: segments.length,
        firstSegmentText: segments[0]?.text,
        stylePreference: localStyle,
        heightPreference: localHeight,
        locale,
        maxResolution,
        projectId: loadedProject?.id,
        userId: user?.id,
      });

      const subtitlesForExport = segments.map((segment) => ({
        start: segment.startTime,
        end: segment.endTime,
        text: segment.text,
      }));
      await startExport(subtitlesForExport, {
        uploadId,
        subtitlePreference,
        stylePreference: localStyle,
        heightPreference: localHeight,
        locale,
        maxResolution,
        projectId: loadedProject?.id || null,
        userId: user?.id || null,
      });
    } catch (err) {
      console.error('[SubtitleEditor] Export initiation error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Fehler beim Starten des Exports';
      setError(errorMessage);
    }
  };

  // `segments` is stripped of the client-only `id` field at the save
  // boundary — server persistence shouldn't carry a React-key concept.
  const toWireSegments = (): { text: string; startTime: number; endTime: number }[] =>
    segments.map((s) => ({ text: s.text, startTime: s.startTime, endTime: s.endTime }));

  const handleSaveProject = async (): Promise<void> => {
    if (!uploadId || !segments.length) {
      setError('Keine Daten zum Speichern vorhanden.');
      return;
    }

    try {
      setError(null);

      if (loadedProject) {
        // Update contract currently types `subtitles` as string. Serialize
        // to SRT so the existing server side stays untouched. Follow-up
        // to align the update contract to `SubtitleSegment[]` tracked
        // separately.
        await updateProject(loadedProject.id, {
          subtitles: formatSubtitleBlocks(segments),
          stylePreference: localStyle,
          heightPreference: localHeight,
        });
      } else {
        console.log('[SubtitleEditor] Creating new project with uploadId:', uploadId);
        const formattedVideoMetadata = videoMetadataFromUpload
          ? {
              duration: videoMetadataFromUpload.duration ?? 0,
              width: videoMetadataFromUpload.width ?? 0,
              height: videoMetadataFromUpload.height ?? 0,
            }
          : undefined;
        await saveProject({
          uploadId,
          subtitles: toWireSegments(),
          title: videoFilename
            ? videoFilename.replace(/\.[^.]+$/, '')
            : `Projekt ${new Date().toLocaleDateString('de-DE')}`,
          stylePreference: localStyle,
          heightPreference: localHeight,
          modePreference: subtitlePreference,
          videoMetadata: formattedVideoMetadata,
          videoFilename: videoFilename || 'video.mp4',
          videoSize: videoSize || 0,
        });
      }
    } catch (err) {
      console.error('[SubtitleEditor] Save project error:', err);
      const errorMessage =
        err instanceof Error ? err.message : 'Fehler beim Speichern des Projekts';
      setError(errorMessage);
    }
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  return (
    <div className="w-full">
      {isMobile && (
        <FloatingActionButton
          icon={isPlaying ? <FaPause /> : <FaPlay />}
          onClick={togglePlayPause}
          visible={!isVideoVisible}
          position="bottom-left"
        />
      )}

      {error && (
        <div className="mb-md flex items-center justify-between gap-md rounded-lg border border-red-600 bg-red-50 p-md text-red-600 dark:bg-grey-800">
          <span>{error}</span>
          <div className="flex shrink-0 gap-xs">
            {exportStatus === 'error' && (
              <Button
                size="sm"
                onClick={() => {
                  setError(null);
                  void retryExport();
                }}
              >
                Erneut versuchen
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setError(null)}>
              Schließen
            </Button>
          </div>
        </div>
      )}

      {showFallbackButton && (
        <div className="mb-md rounded-lg border border-grey-200 bg-background-alt p-md dark:border-grey-700">
          <p className="mb-sm text-sm text-foreground">Automatischer Download fehlgeschlagen?</p>
          <div className="flex gap-sm">
            <Button asChild>
              <a
                href={
                  typeof showFallbackButton === 'string'
                    ? showFallbackButton
                    : showFallbackButton.url || ''
                }
                download={
                  typeof showFallbackButton === 'string' ? undefined : showFallbackButton.filename
                }
                onClick={() => setShowFallbackButton(null)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Video manuell herunterladen
              </a>
            </Button>
            <Button variant="outline" onClick={() => setShowFallbackButton(null)}>
              Schließen
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-md">
        <div
          className={cn(
            'flex flex-col gap-md rounded-xl border border-grey-200 bg-background p-md dark:border-grey-700 dark:bg-background-alt',
            'lg:flex-row lg:items-start lg:gap-lg lg:p-lg'
          )}
        >
          <div className="flex flex-col items-center gap-xs lg:shrink-0">
            <div className="flex items-center justify-center overflow-hidden rounded-lg">
              {videoUrl ? (
                <div className="relative aspect-[9/16] max-h-[50vh] lg:max-h-[60vh]">
                  <video
                    ref={videoRef}
                    className="block h-full w-full rounded-lg object-contain shadow-md"
                    controls
                    crossOrigin="use-credentials"
                    src={videoUrl}
                    onLoadedMetadata={handleVideoLoadedMetadata}
                    onTimeUpdate={handleVideoTimeUpdate}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                  >
                    Dein Browser unterstützt keine Video-Wiedergabe.
                  </video>

                  <LiveSubtitlePreview
                    editableSubtitles={segments}
                    currentTimeInSeconds={currentTimeInSeconds}
                    videoMetadata={videoMetadata}
                    stylePreference={localStyle}
                    heightPreference={localHeight}
                    subtitlePreference={subtitlePreference}
                  />
                </div>
              ) : (
                <div className="flex aspect-[9/16] w-[200px] items-center justify-center text-sm text-grey-400">
                  {error ? 'Fehler beim Laden des Videos' : 'Video wird geladen...'}
                </div>
              )}
            </div>
            <p className="py-xxs text-center text-xs opacity-70">
              Nur eine Vorschau. Das finale Styling sieht besser aus!
            </p>
            <div className="flex justify-center gap-xs">
              <Button
                size="icon"
                onClick={() => handleExport(localQuality === 'normal' ? 1080 : null)}
                disabled={
                  isExporting || exportStatus === 'starting' || exportStatus === 'exporting'
                }
                title={localQuality === 'normal' ? 'Download (1080p)' : 'Download (HD)'}
              >
                {isExporting || exportStatus === 'starting' || exportStatus === 'exporting' ? (
                  <Spinner size="small" white />
                ) : (
                  <FaDownload />
                )}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className={cn(saveSuccess && 'border-primary-500 text-primary-500')}
                onClick={handleSaveProject}
                disabled={!segments.length}
                title="Projekt speichern"
              >
                {saveSuccess ? <FaCheck /> : <FaSave />}
              </Button>
              <Button
                variant={showStyling ? 'default' : 'outline'}
                size="icon"
                onClick={() => setShowStyling(!showStyling)}
                title="Einstellungen"
              >
                <HiCog />
              </Button>
            </div>
          </div>

          {showStyling ? (
            <div className="min-w-[240px] flex-1">
              <div className="mb-md">
                <h4 className="mb-xs text-sm font-semibold text-foreground-heading">Stil</h4>
                <div className="grid grid-cols-2 gap-xs lg:grid-cols-4">
                  {styleOptions.map((option) => (
                    <label
                      key={option.id}
                      className={cn(
                        'relative cursor-pointer rounded-lg border-[1.5px] border-transparent bg-background-alt p-sm transition-all hover:shadow-md dark:bg-background',
                        localStyle === option.id && 'border-primary-500 shadow-md'
                      )}
                    >
                      <input
                        type="radio"
                        name="styleOption"
                        value={option.id}
                        checked={localStyle === option.id}
                        onChange={() => handleLocalStyleChange(option.id)}
                        className="sr-only"
                      />
                      <div className="flex flex-col gap-xs">
                        <h4 className="text-xs font-medium text-foreground">
                          {option.isRecommended && (
                            <span className="mr-xxs text-yellow-500">★</span>
                          )}
                          {option.name}
                        </h4>
                        <div className="flex items-center justify-center rounded bg-grey-100 p-xs dark:bg-grey-800">
                          <span className="text-xs font-semibold" style={option.preview}>
                            Beispiel
                          </span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-md max-md:flex-col">
                <div className="flex-1">
                  <h4 className="mb-xs text-sm font-semibold text-foreground-heading">Position</h4>
                  <div className="flex flex-col gap-xs">
                    {heightOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={cn(
                          'flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-lg border-[1.5px] border-transparent bg-background-alt px-3.5 py-2.5 text-left transition-all',
                          'hover:bg-grey-100 dark:hover:bg-grey-800',
                          localHeight === option.id && 'border-primary-500 bg-background'
                        )}
                        onClick={() => handleLocalHeightChange(option.id)}
                      >
                        <span className="text-sm font-medium text-foreground">{option.name}</span>
                        {option.subtitle && (
                          <span className="text-xs text-grey-500">{option.subtitle}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="mb-xs text-sm font-semibold text-foreground-heading">Qualität</h4>
                  <div className="flex flex-col gap-xs">
                    {qualityOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={cn(
                          'flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-lg border-[1.5px] border-transparent bg-background-alt px-3.5 py-2.5 text-left transition-all',
                          'hover:bg-grey-100 dark:hover:bg-grey-800',
                          localQuality === option.id && 'border-primary-500 bg-background'
                        )}
                        onClick={() => handleLocalQualityChange(option.id)}
                      >
                        <span className="text-sm font-medium text-foreground">{option.name}</span>
                        {option.subtitle && (
                          <span className="text-xs text-grey-500">{option.subtitle}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1">
              <Timeline
                duration={videoDuration}
                currentTime={currentTimeInSeconds}
                segments={segments}
                selectedSegmentId={selectedSegmentId}
                onSeek={handleTimelineSeek}
                onSegmentClick={handleSegmentClick}
                onTextChange={handleTextChange}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SubtitleEditor;

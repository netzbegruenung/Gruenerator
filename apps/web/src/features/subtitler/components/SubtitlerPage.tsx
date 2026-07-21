import { getContractsClient } from '@gruenerator/shared/api';
import { Button, UploadZone } from '@gruenerator/ui';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { PiVideoCamera } from 'react-icons/pi';
import { useSearchParams } from 'react-router-dom';
import * as tus from 'tus-js-client';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import MaintenanceNotice from '../../../components/common/MaintenanceNotice';
import PageContainer from '../../../components/common/PageContainer';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { getToolGradient } from '../../../config/toolTheme';
import { useAuthStore } from '../../../stores/authStore';
import { useSubtitlerExportStore } from '../../../stores/subtitlerExportStore';
import { getPublicAppOrigin } from '../../../utils/platform';
import useSocialTextGenerator from '../hooks/useSocialTextGenerator';
import { parseSubtitleBlocks, formatSubtitleBlocks } from '../utils/subtitleSegmentUtils';
import { getVideoMetadata, TUS_UPLOAD_ENDPOINT, type VideoMetadata } from '../utils/videoUtils';

import AutoProcessingScreen from './AutoProcessingScreen';
import SubtitleEditor from './SubtitleEditor';
import VideoSuccessScreen from './VideoSuccessScreen';

import type { AutoProcessingResult } from './AutoProcessingScreen';
import type {
  SubtitlePreference,
  StylePreference,
  HeightPreference,
  SubtitleSegment,
} from '../types';
import type { AxiosError } from 'axios';
import type { Accept } from 'react-dropzone';

import { cn } from '@/utils/cn';

const VIDEO_ACCEPT: Accept = {
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'video/x-matroska': ['.mkv'],
  'video/webm': ['.webm'],
};

// --- Maintenance Flag ---
// Set to true to enable maintenance mode for this page
const IS_SUBTITLER_UNDER_MAINTENANCE = false;
// ------------------------

// UploadData matches ProjectSelector's interface with VideoMetadata as the local type
interface UploadData {
  originalFile: File;
  uploadId: string;
  metadata: VideoMetadata;
  name: string;
  size: number;
  type: string;
}

interface UploadInfo {
  uploadId: string;
  metadata?: VideoMetadata;
  name?: string;
  size?: number;
  type?: string;
  isFromProject?: boolean;
  videoUrl?: string;
}

/**
 * Wire shape for a loaded project. Field names match the contract's
 * `subtitlerProjectSchema` (single source of truth in
 * `@gruenerator/contracts/schemas/subtitler.ts`), kept here as a tight
 * subtype so the callers don't have to widen for contract nullability.
 */
interface LoadedProject {
  id: string;
  user_id: string;
  title: string;
  upload_id: string;
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

const SubtitlerPage = (): React.ReactElement => {
  // Lazy initializer writes the first history entry exactly once per
  // mount — replaces a dedicated `useEffect` that did the same. The
  // hash reflects the current step so the back button restores it via
  // the popstate listener below.
  const [step, setStep] = useState<string>(() => {
    const initial = 'upload';
    if (typeof window !== 'undefined') {
      window.history.replaceState({ step: initial }, '', `#${initial}`);
    }
    return initial;
  });
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const currentUploadRef = useRef<tus.Upload | null>(null);
  const [originalVideoFile, setOriginalVideoFile] = useState<File | null>(null);
  const [uploadInfo, setUploadInfo] = useState<UploadInfo | null>(null);
  // Single source of truth for the subtitle segments. Populated from
  // auto-processing or deep-link load, mutated in place by the editor
  // through `setSegments`, consumed directly by the export and save
  // paths. The previous split (`subtitles: string` + `subtitleSegments`
  // + SubtitleEditor's local `editableSubtitles`) drifted on every
  // edit — losing user changes through prop→state resync inside
  // SubtitleEditor on remount.
  const [segments, setSegments] = useState<SubtitleSegment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const {
    socialText,
    isGenerating,
    generateSocialText,
    reset: resetSocialText,
  } = useSocialTextGenerator();
  const [subtitlePreference] = useState<SubtitlePreference>('manual');
  const [stylePreference, setStylePreference] = useState<StylePreference>('shadow');
  const modePreference = 'manual';
  const [heightPreference, setHeightPreference] = useState<HeightPreference>('tief');
  const [loadedProject, setLoadedProject] = useState<LoadedProject | null>(null);
  const [autoSavedProjectId, setAutoSavedProjectId] = useState<string | null>(null);

  const { status: exportStatus, exportToken, resetExport } = useSubtitlerExportStore();

  const { user, locale } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

  // User-initiated step transitions push a new history entry. The
  // popstate listener below bypasses this helper and calls `setStep`
  // directly — otherwise back/forward would push new entries instead
  // of traversing existing ones.
  const goToStep = useCallback((next: string): void => {
    setStep(next);
    window.history.pushState({ step: next }, '', `#${next}`);
  }, []);

  // Deep-link: load project from ?project=<id> query param
  const deepLinkLoadedRef = useRef(false);
  useEffect(() => {
    const projectId = searchParams.get('project');
    if (!projectId || !user?.id || deepLinkLoadedRef.current) return;
    deepLinkLoadedRef.current = true;

    getContractsClient()
      .subtitler.getProject({ params: { projectId } })
      .then((res) => {
        if (res.status !== 200) throw new Error('Projekt konnte nicht geladen werden.');
        // Contract SubtitlerProject is nullability-wide and lacks `upload_id`;
        // LoadedProject is the tight local shape the editor reads off.
        const project = res.body.project as unknown as LoadedProject;
        if (!project) return;

        setLoadedProject(project);
        if (project.subtitles) setSegments(parseSubtitleBlocks(project.subtitles));
        setUploadInfo({
          uploadId: project.id,
          metadata: project.video_metadata ?? undefined,
          name: project.video_filename ?? undefined,
          size: project.video_size ?? undefined,
          isFromProject: true,
          videoUrl: `/api/subtitler/projects/${project.id}/video`,
        });
        if (project.style_preference)
          setStylePreference(project.style_preference as StylePreference);
        if (project.height_preference)
          setHeightPreference(project.height_preference as HeightPreference);
        goToStep('edit');
        setSearchParams({}, { replace: true });
      })
      .catch((err) => {
        console.error('[SubtitlerPage] Failed to load project from deep link:', err);
        setError('Projekt konnte nicht geladen werden.');
        setSearchParams({}, { replace: true });
      });
  }, [searchParams, user?.id, setSearchParams, goToStep]);

  // Browser history navigation - handle back button
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as { step?: string } | null;
      if (state?.step) {
        const validSteps = ['upload', 'auto-processing', 'edit', 'success'];
        if (validSteps.includes(state.step)) {
          setStep(state.step);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Dynamically set baseURL based on environment
  const isDevelopment = import.meta.env.VITE_APP_ENV === 'development';
  const baseURL = isDevelopment ? 'http://localhost:3001/api' : `${getPublicAppOrigin()}/api`;

  // Cleanup effect for tab close detection
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Only cleanup if export hasn't started - otherwise keep the file for export
      if (uploadInfo?.uploadId && exportStatus === 'idle' && !exportToken) {
        console.log(`[SubtitlerPage] Sending cleanup beacon for uploadId: ${uploadInfo.uploadId}`);
        navigator.sendBeacon(`${baseURL}/subtitler/cleanup/${uploadInfo.uploadId}`);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [uploadInfo?.uploadId, baseURL, exportStatus, exportToken]);

  const handleUploadComplete = (uploadData: UploadData): void => {
    // Überprüfe, ob ein gültiges File-Objekt übergeben wurde
    if (uploadData.originalFile instanceof File) {
      // Speichere das originale File-Objekt direkt
      setOriginalVideoFile(uploadData.originalFile);
      console.log('[SubtitlerPage] Original video file stored:', uploadData.originalFile);
    } else {
      console.error(
        '[SubtitlerPage] Did not receive a valid File object in uploadData',
        uploadData
      );
      setError('Fehler beim Empfangen der Videodatei vom Uploader.');
      return;
    }

    // Speichere andere Upload-Infos separat
    const newUploadInfo = {
      uploadId: uploadData.uploadId,
      metadata: uploadData.metadata,
      name: uploadData.name,
      size: uploadData.size,
      type: uploadData.type,
    };
    setUploadInfo(newUploadInfo);
    setError(null);

    // Step transition + auto-processing kickoff are one logical action,
    // triggered by the same user event. Pass the fresh uploadId explicitly
    // to dodge the stale-closure risk on `uploadInfo`.
    goToStep('auto-processing');
    void handleStartAutoProcessing(uploadData.uploadId);
  };

  // Start tus upload when user selects a file
  const handleFileSelected = useCallback(
    async (file: File) => {
      try {
        setIsUploading(true);
        setUploadProgress(0);
        setError(null);

        const metadata = await getVideoMetadata(file);

        const upload = new tus.Upload(file, {
          endpoint: TUS_UPLOAD_ENDPOINT,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          chunkSize: 5 * 1024 * 1024,
          metadata: { filename: file.name, filetype: file.type },
          onError: (err) => {
            setError('Upload fehlgeschlagen. Bitte versuche es erneut.');
            setIsUploading(false);
            currentUploadRef.current = null;
          },
          onProgress: (bytesUploaded, bytesTotal) => {
            setUploadProgress(Math.round((bytesUploaded / bytesTotal) * 100));
          },
          onSuccess: () => {
            const uploadUrl = upload.url;
            const secureUrl = uploadUrl?.startsWith('http://localhost')
              ? uploadUrl
              : (uploadUrl?.replace('http://', 'https://') ?? '');
            const uploadId = secureUrl.split('/').pop() ?? '';

            setIsUploading(false);
            currentUploadRef.current = null;

            handleUploadComplete({
              originalFile: upload.file as File,
              uploadId,
              metadata,
              name: file.name,
              size: file.size,
              type: file.type,
            });
          },
        });

        currentUploadRef.current = upload;
        upload.start();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload konnte nicht gestartet werden.');
        setIsUploading(false);
        currentUploadRef.current = null;
      }
    },
    [handleUploadComplete]
  );

  const handleExport = useCallback(
    async (receivedExportToken: string) => {
      console.log('[SubtitlerPage] Export initiated with token:', receivedExportToken);

      // Auto-create project if one doesn't exist (for share functionality).
      // Uses the hoisted `segments` state which reflects the user's edits
      // — the earlier version sent the original auto-processing output
      // and silently persisted the pre-edit version to the DB.
      if (!loadedProject?.id && !autoSavedProjectId && uploadInfo?.uploadId) {
        try {
          const projectData = {
            uploadId: uploadInfo.uploadId,
            subtitles: segments.map((s) => ({
              text: s.text,
              startTime: s.startTime,
              endTime: s.endTime,
            })),
            title:
              uploadInfo.name?.replace(/\.[^/.]+$/, '') ||
              `Projekt ${new Date().toLocaleDateString('de-DE')}`,
            stylePreference,
            heightPreference,
            modePreference,
            videoMetadata: uploadInfo.metadata
              ? {
                  duration: uploadInfo.metadata.duration ?? 0,
                  width: uploadInfo.metadata.width ?? 0,
                  height: uploadInfo.metadata.height ?? 0,
                }
              : undefined,
            videoFilename: uploadInfo.name || 'video.mp4',
            videoSize: uploadInfo.size || 0,
          };

          const res = await getContractsClient().subtitler.createProject({ body: projectData });
          if (res.status === 200 || res.status === 201) {
            const project = res.body.project;
            if (project?.id) setAutoSavedProjectId(project.id);
          }
        } catch (err) {
          console.warn('[SubtitlerPage] Failed to auto-create project:', err);
        }
      }

      goToStep('success');
    },
    [
      loadedProject?.id,
      autoSavedProjectId,
      uploadInfo,
      segments,
      stylePreference,
      heightPreference,
      modePreference,
      goToStep,
    ]
  );

  const handleExportComplete = useCallback(() => {
    // Export completion is now handled by the store
    console.log('[SubtitlerPage] Export completed');
  }, []);

  const handleReset = useCallback(() => {
    // Send cleanup signal before reset
    if (uploadInfo?.uploadId) {
      console.log(`[SubtitlerPage] Manual cleanup on reset for uploadId: ${uploadInfo.uploadId}`);
      void getContractsClient()
        .subtitler.deleteCleanup({ params: { uploadId: uploadInfo.uploadId } })
        .catch((error) => console.warn('[SubtitlerPage] Cleanup request failed:', error));
    }

    // Reset export store
    resetExport();

    setTimeout(() => {
      goToStep('upload');
      setOriginalVideoFile(null);
      setUploadInfo(null);
      setSegments([]);
      setError(null);
      setAutoSavedProjectId(null);
      resetSocialText();
    }, 300);
  }, [resetSocialText, uploadInfo?.uploadId, resetExport, goToStep]);

  // Function to go back to the editor without resetting everything
  const handleEditAgain = useCallback(() => {
    // Reset export state so user must re-export after making changes
    // This prevents downloading old video after editing
    resetExport();
    goToStep('edit');
  }, [resetExport, goToStep]);

  // New handlers for styling step
  const handleStyleSelect = useCallback((style: string) => {
    setStylePreference(style as StylePreference);
  }, []);

  const handleHeightSelect = useCallback((height: string) => {
    setHeightPreference(height as HeightPreference);
  }, []);

  // Takes `uploadId` as an explicit argument so callers don't race the
  // `setUploadInfo` commit. Previously a `useEffect([step, uploadId])`
  // + ref-based one-shot guard translated the step transition into a
  // call to this function; doing it directly in the step-transition
  // handler is both simpler and correct.
  const handleStartAutoProcessing = useCallback(
    async (uploadId: string): Promise<void> => {
      try {
        const res = await getContractsClient().subtitler.postProcessAuto({
          body: { uploadId, locale, userId: user?.id || null },
        });
        if (res.status === 202) {
          console.log('[SubtitlerPage] Auto processing started for:', uploadId);
        } else {
          const msg =
            (res.body as { error?: string })?.error ||
            'Fehler beim Starten der automatischen Verarbeitung.';
          setError(msg);
          goToStep('upload');
        }
      } catch (error) {
        console.error('[SubtitlerPage] Error starting auto processing:', error);
        const axiosError = error as AxiosError<{ error?: string }>;
        setError(
          axiosError.response?.data?.error || 'Fehler beim Starten der automatischen Verarbeitung.'
        );
        goToStep('upload');
      }
    },
    [user?.id, locale, goToStep]
  );

  // Handler for automatic processing completion
  const handleAutoProcessingComplete = useCallback(
    (result: AutoProcessingResult) => {
      console.log('[SubtitlerPage] Auto processing complete:', result);
      if (result.projectId) {
        setAutoSavedProjectId(result.projectId);
      }
      // Ingest segments into the hoisted state. The contract segment type
      // has no `id`; the local type uses `id` for React keys in Timeline.
      // We add ids here once at ingest so the parent is the source of
      // truth from this point forward.
      if (result.segments && result.segments.length > 0) {
        setSegments(
          result.segments.map((s, i) => ({
            id: i,
            text: s.text,
            startTime: s.startTime,
            endTime: s.endTime,
          }))
        );
      } else if (result.subtitles) {
        // Fallback: parse SRT blob if the backend didn't include a segment
        // array (older auto-processing responses).
        setSegments(parseSubtitleBlocks(result.subtitles));
      }
      goToStep('success');
    },
    [goToStep]
  );

  // Handler for automatic processing error
  const handleAutoProcessingError = useCallback(
    (errorMsg: string) => {
      console.error('[SubtitlerPage] Auto processing error:', errorMsg);
      setError(errorMsg);
      goToStep('upload');
    },
    [goToStep]
  );

  return (
    <ErrorBoundary>
      <PageContainer
        gradient={step !== 'edit'}
        bgClassName={step !== 'edit' ? getToolGradient('reels-untertitel') : undefined}
        className={cn(step === 'edit' && 'max-w-[1600px] 2xl:max-w-[90vw]')}
      >
        {IS_SUBTITLER_UNDER_MAINTENANCE ? (
          <MaintenanceNotice featureName="Reel" />
        ) : (
          <>
            {error && (
              <div className="mb-md flex items-center justify-between gap-md rounded-lg border border-red-600 bg-red-50 p-md text-red-600 dark:bg-grey-800">
                <span>{error}</span>
                <Button variant="outline" size="sm" onClick={() => setError(null)}>
                  Schließen
                </Button>
              </div>
            )}

            <div className="flex flex-col gap-xl">
              {step === 'upload' && (
                <div className="flex flex-col items-center gap-lg pt-xl">
                  <div className="text-center">
                    <h1 className="text-4xl max-md:text-2xl font-semibold text-foreground-heading mb-xs">
                      Neues Reel
                    </h1>
                    <p className="text-lg text-grey-500 dark:text-grey-400">
                      Lade ein Video hoch — Untertitel werden automatisch hinzugefügt.
                    </p>
                  </div>
                  {isUploading ? (
                    <div className="flex flex-col items-center gap-md w-full max-w-[500px]">
                      <div className="w-full h-2 overflow-hidden rounded-full bg-grey-200 dark:bg-grey-700">
                        <div
                          className="h-full rounded-full bg-primary-500 transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <p className="text-sm text-grey-500 tabular-nums">
                        Video wird hochgeladen... {uploadProgress}%
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          void currentUploadRef.current?.abort();
                          currentUploadRef.current = null;
                          setIsUploading(false);
                          setUploadProgress(0);
                        }}
                      >
                        Abbrechen
                      </Button>
                    </div>
                  ) : (
                    <div className="w-full max-w-[600px]">
                      <UploadZone
                        onFileSelected={handleFileSelected}
                        accept={VIDEO_ACCEPT}
                        maxSizeMB={500}
                        icon={<PiVideoCamera className="size-8" />}
                        title="Video auswählen oder hierher ziehen"
                        subtitle="MP4, MOV, AVI, MKV, WebM — bis 500 MB"
                      />
                    </div>
                  )}
                </div>
              )}

              {step === 'auto-processing' && uploadInfo?.uploadId && (
                <AutoProcessingScreen
                  uploadId={uploadInfo.uploadId}
                  onComplete={handleAutoProcessingComplete}
                  onError={handleAutoProcessingError}
                />
              )}

              {step === 'edit' && segments.length > 0 && uploadInfo?.uploadId && (
                <SubtitleEditor
                  videoFile={originalVideoFile}
                  videoUrl={uploadInfo.videoUrl ?? undefined}
                  segments={segments}
                  onSegmentsChange={setSegments}
                  uploadId={uploadInfo.uploadId}
                  subtitlePreference={subtitlePreference}
                  stylePreference={stylePreference}
                  heightPreference={heightPreference}
                  onStyleChange={handleStyleSelect}
                  onHeightChange={handleHeightSelect}
                  onExportSuccess={handleExport}
                  onExportComplete={handleExportComplete}
                  isExporting={
                    exportStatus === 'starting' || exportStatus === 'exporting' || isGenerating
                  }
                  loadedProject={loadedProject}
                  videoMetadataFromUpload={uploadInfo.metadata ?? undefined}
                  videoFilename={uploadInfo.name ?? undefined}
                  videoSize={uploadInfo.size ?? undefined}
                />
              )}

              {step === 'success' && (
                <VideoSuccessScreen
                  onReset={handleReset}
                  onEditAgain={handleEditAgain}
                  isLoading={exportStatus === 'starting' || exportStatus === 'exporting'}
                  socialText={socialText}
                  uploadId={exportToken || uploadInfo?.uploadId || undefined}
                  isGeneratingSocialText={isGenerating}
                  onGenerateSocialText={() => generateSocialText(formatSubtitleBlocks(segments))}
                  projectId={loadedProject?.id || autoSavedProjectId || undefined}
                  projectTitle={
                    loadedProject?.title || (autoSavedProjectId ? 'Auto-Video' : undefined)
                  }
                  videoUrl={
                    // exportToken wins over auto-download — once the user
                    // has edited subtitles and run an export, that export
                    // contains their edits. The auto-download path serves
                    // the pre-edit transcription and is only correct for
                    // users who skipped the editor entirely.
                    exportToken
                      ? `${baseURL}/subtitler/export-download/${exportToken}`
                      : uploadInfo?.uploadId
                        ? `${baseURL}/subtitler/auto-download/${uploadInfo.uploadId}`
                        : undefined
                  }
                />
              )}
            </div>
          </>
        )}
      </PageContainer>
    </ErrorBoundary>
  );
};

export default withAuthRequired(SubtitlerPage, {
  title: 'Reel',
  message: 'Anmeldung für Reel erforderlich',
});

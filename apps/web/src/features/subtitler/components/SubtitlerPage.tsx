import { Button, UploadZone } from '@gruenerator/ui';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { PiVideoCamera } from 'react-icons/pi';
import { useSearchParams } from 'react-router-dom';
import * as tus from 'tus-js-client';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import MaintenanceNotice from '../../../components/common/MaintenanceNotice';
import PageContainer from '../../../components/common/PageContainer';
import ErrorBoundary from '../../../components/ErrorBoundary';
import apiClient from '../../../components/utils/apiClient';
import { useAuthStore } from '../../../stores/authStore';
import { useSubtitlerExportStore } from '../../../stores/subtitlerExportStore';
import useSocialTextGenerator from '../hooks/useSocialTextGenerator';
import { getVideoMetadata, TUS_UPLOAD_ENDPOINT, type VideoMetadata } from '../utils/videoUtils';

import AutoProcessingScreen from './AutoProcessingScreen';
import SubtitleEditor from './SubtitleEditor';
import VideoSuccessScreen from './VideoSuccessScreen';

import type { AutoProcessingResult } from './AutoProcessingScreen';
import type { SubtitlePreference, StylePreference, HeightPreference } from '../types';
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

// LoadedProject type from the shared useProjectsStore
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
  const [step, setStep] = useState<string>('upload');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const currentUploadRef = useRef<tus.Upload | null>(null);
  const [originalVideoFile, setOriginalVideoFile] = useState<File | null>(null);
  const [uploadInfo, setUploadInfo] = useState<UploadInfo | null>(null);
  const [subtitles, setSubtitles] = useState<string | null>(null);
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

  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link: load project from ?project=<id> query param
  const deepLinkLoadedRef = useRef(false);
  useEffect(() => {
    const projectId = searchParams.get('project');
    if (!projectId || !user?.id || deepLinkLoadedRef.current) return;
    deepLinkLoadedRef.current = true;

    apiClient
      .get(`/subtitler/projects/${projectId}`)
      .then((res) => {
        const project = res.data?.project;
        if (!project) return;

        setLoadedProject(project);
        if (project.subtitles) setSubtitles(project.subtitles);
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
        setStep('edit');
        setSearchParams({}, { replace: true });
      })
      .catch((err) => {
        console.error('[SubtitlerPage] Failed to load project from deep link:', err);
        setError('Projekt konnte nicht geladen werden.');
        setSearchParams({}, { replace: true });
      });
  }, [searchParams, user?.id, setSearchParams]);

  // Browser history navigation - push state when step changes
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      // On initial mount, replace state instead of pushing
      window.history.replaceState({ step }, '', `#${step}`);
      isInitialMount.current = false;
    } else {
      window.history.pushState({ step }, '', `#${step}`);
    }
  }, [step]);

  // Browser history navigation - handle back button
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state?.step) {
        const validSteps = ['upload', 'auto-processing', 'edit', 'success'];
        if (validSteps.includes(event.state.step)) {
          setStep(event.state.step);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Dynamically set baseURL based on environment
  const isDevelopment = import.meta.env.VITE_APP_ENV === 'development';
  const baseURL = isDevelopment ? 'http://localhost:3001/api' : `${window.location.origin}/api`;

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

    // Auto-start processing immediately after upload
    setStep('auto-processing');
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
        setError('Upload konnte nicht gestartet werden.');
        setIsUploading(false);
        currentUploadRef.current = null;
      }
    },
    [handleUploadComplete]
  );

  const handleExport = useCallback(
    async (receivedExportToken: string) => {
      console.log('[SubtitlerPage] Export initiated with token:', receivedExportToken);

      // Auto-create project if one doesn't exist (for share functionality)
      if (!loadedProject?.id && !autoSavedProjectId && uploadInfo?.uploadId) {
        try {
          const projectData = {
            uploadId: uploadInfo.uploadId,
            subtitles: subtitles || '',
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

          const res = await apiClient.post('/subtitler/projects', projectData);
          if (res.data?.project?.id) {
            setAutoSavedProjectId(res.data.project.id);
          }
        } catch (err) {
          console.warn('[SubtitlerPage] Failed to auto-create project:', err);
        }
      }

      setStep('success');
    },
    [
      loadedProject?.id,
      autoSavedProjectId,
      uploadInfo,
      subtitles,
      stylePreference,
      heightPreference,
      modePreference,
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
      fetch(`${baseURL}/subtitler/cleanup/${uploadInfo.uploadId}`, { method: 'DELETE' }).catch(
        (error) => console.warn('[SubtitlerPage] Cleanup request failed:', error)
      );
    }

    // Reset export store
    resetExport();

    setTimeout(() => {
      setStep('upload');
      setOriginalVideoFile(null);
      setUploadInfo(null);
      setSubtitles(null);
      setError(null);
      setAutoSavedProjectId(null);
      resetSocialText();
    }, 300);
  }, [resetSocialText, uploadInfo?.uploadId, baseURL, resetExport]);

  // Function to go back to the editor without resetting everything
  const handleEditAgain = useCallback(() => {
    // Reset export state so user must re-export after making changes
    // This prevents downloading old video after editing
    resetExport();
    setStep('edit');
  }, [resetExport]);

  // New handlers for styling step
  const handleStyleSelect = useCallback((style: string) => {
    setStylePreference(style as StylePreference);
  }, []);

  const handleHeightSelect = useCallback((height: string) => {
    setHeightPreference(height as HeightPreference);
  }, []);

  // Handler for starting automatic processing
  const handleStartAutoProcessing = useCallback(async () => {
    if (!uploadInfo?.uploadId) {
      setError('Keine Upload-ID vorhanden.');
      return;
    }

    try {
      const response = await apiClient.post('/subtitler/process-auto', {
        uploadId: uploadInfo.uploadId,
        locale: 'de-DE',
        userId: user?.id || null,
      });

      if (response.status === 202) {
        console.log('[SubtitlerPage] Auto processing started for:', uploadInfo.uploadId);
      }
    } catch (error) {
      console.error('[SubtitlerPage] Error starting auto processing:', error);
      const axiosError = error as AxiosError<{ error?: string }>;
      setError(
        axiosError.response?.data?.error || 'Fehler beim Starten der automatischen Verarbeitung.'
      );
      setStep('upload');
    }
  }, [uploadInfo?.uploadId, user?.id]);

  // Auto-start processing when transitioning to auto-processing step
  const autoProcessingStartedRef = useRef(false);
  useEffect(() => {
    if (step === 'auto-processing' && uploadInfo?.uploadId) {
      if (!autoProcessingStartedRef.current) {
        autoProcessingStartedRef.current = true;
        handleStartAutoProcessing();
      }
    } else {
      autoProcessingStartedRef.current = false;
    }
  }, [step, uploadInfo?.uploadId, handleStartAutoProcessing]);

  // Handler for automatic processing completion
  const handleAutoProcessingComplete = useCallback((result: AutoProcessingResult) => {
    console.log('[SubtitlerPage] Auto processing complete:', result);
    // Store the auto-saved project ID if available
    if (result.projectId) {
      setAutoSavedProjectId(result.projectId);
    }
    // Store subtitles from auto processing for editing
    if (result.subtitles) {
      setSubtitles(result.subtitles);
    }
    // Move to success screen - the video is ready for download
    setStep('success');
  }, []);

  // Handler for automatic processing error
  const handleAutoProcessingError = useCallback((errorMsg: string) => {
    console.error('[SubtitlerPage] Auto processing error:', errorMsg);
    setError(errorMsg);
    setStep('upload');
  }, []);

  return (
    <ErrorBoundary>
      <PageContainer
        gradient={step !== 'edit'}
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
                          currentUploadRef.current?.abort();
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

              {step === 'edit' && subtitles && uploadInfo?.uploadId && (
                <SubtitleEditor
                  videoFile={originalVideoFile}
                  videoUrl={uploadInfo.videoUrl ?? undefined}
                  subtitles={subtitles}
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
                  loadedProject={
                    loadedProject as { id: string; [key: string]: unknown } | null | undefined
                  }
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
                  onGenerateSocialText={() => generateSocialText(subtitles ?? '')}
                  projectId={loadedProject?.id || autoSavedProjectId || undefined}
                  projectTitle={
                    loadedProject?.title || (autoSavedProjectId ? 'Auto-Video' : undefined)
                  }
                  videoUrl={
                    uploadInfo?.uploadId
                      ? `${baseURL}/subtitler/auto-download/${uploadInfo.uploadId}`
                      : exportToken
                        ? `${baseURL}/subtitler/export-download/${exportToken}`
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

import React, { useState, useCallback, useEffect, useRef } from 'react';
import axios, { AxiosError } from 'axios';
import apiClient from '../../../components/utils/apiClient';
import ProcessingIndicator from './ProcessingIndicator';
import { VideoEditor } from './videoEditor';
import SubtitleEditor from './SubtitleEditor';
import VideoSuccessScreen from './VideoSuccessScreen';
import ProjectSelector from './ProjectSelector';
import ModeSelector from './ModeSelector';
import AutoProcessingScreen from './AutoProcessingScreen';
import useSocialTextGenerator from '../hooks/useSocialTextGenerator';
import { useSubtitlerProjects } from '../hooks/useSubtitlerProjects';
import { useSubtitlerExportStore } from '../../../stores/subtitlerExportStore';
import { FaUserCog } from 'react-icons/fa';
import ErrorBoundary from '../../../components/ErrorBoundary';
import MaintenanceNotice from '../../../components/common/MaintenanceNotice';
import FeatureToggle from '../../../components/common/FeatureToggle';
import { useAuthStore } from '../../../stores/authStore';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';

import '../styles/subtitler.css';
import '../styles/SubtitleEditor.css';
import '../styles/VideoSuccessScreen.css';
import '../styles/ProcessingIndicator.css';
import '../styles/live-subtitle-preview.css';
import '../styles/ProjectSelector.css';
import '../styles/ModeSelector.css';
import '../styles/AutoProcessingScreen.css';

// --- Maintenance Flag ---
// Set to true to enable maintenance mode for this page
const IS_SUBTITLER_UNDER_MAINTENANCE = false;
// ------------------------

// Types for SubtitlerPage
interface VideoMetadataFromUpload {
  duration?: number;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

// UploadData matches ProjectSelector's interface with VideoMetadata as the local type
interface UploadData {
  originalFile: File;
  uploadId: string;
  metadata: VideoMetadataFromUpload;
  name: string;
  size: number;
  type: string;
}

interface UploadInfo {
  uploadId: string;
  metadata?: VideoMetadataFromUpload;
  name?: string;
  size?: number;
  type?: string;
  isFromProject?: boolean;
  videoUrl?: string;
}

interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
}

interface AutoProcessingResult {
  projectId?: string;
  subtitles?: string;
}

// LoadedProject type from the shared useProjectsStore
interface LoadedProject {
  id: string;
  user_id: string;
  title: string;
  upload_id: string;
  thumbnail_path: string | null;
  video_path: string | null;
  video_metadata: VideoMetadataFromUpload | null;
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

type EditMode = 'subtitle' | 'full-edit' | 'auto' | null;

const SubtitlerPage = (): React.ReactElement => {
  const [step, setStep] = useState<string>('select');
  const [originalVideoFile, setOriginalVideoFile] = useState<File | null>(null);
  const [uploadInfo, setUploadInfo] = useState<UploadInfo | null>(null);
  const [cutSegments, setCutSegments] = useState<SubtitleSegment[] | null>(null);
  const [subtitles, setSubtitles] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isExiting, setIsExiting] = useState<boolean>(false);
  const { socialText, isGenerating, error: socialError, generateSocialText, reset: resetSocialText } = useSocialTextGenerator();
  const [subtitlePreference, setSubtitlePreference] = useState<string>('manual');
  const [stylePreference, setStylePreference] = useState<string>('shadow');
  const [modePreference, setModePreference] = useState<string>('manual');
  const [heightPreference, setHeightPreference] = useState<string>('tief');
  const [isProModeActive, setIsProModeActive] = useState<boolean>(false);
  const [loadedProject, setLoadedProject] = useState<LoadedProject | null>(null);
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(false);
  const [selectedEditMode, setSelectedEditMode] = useState<EditMode>(null);
  const [autoSavedProjectId, setAutoSavedProjectId] = useState<string | null>(null);

  // Use centralized export store
  const exportStore = useSubtitlerExportStore();
  const { status: exportStatus, exportToken, resetExport } = exportStore;

  // Use project hook with built-in auth guards
  const {
    projects,
    currentProject,
    isLoading: isProjectsLoading,
    loadProject,
    saveProject,
    updateProject,
    deleteProject,
    isReady: isAuthReady,
    initialFetchComplete
  } = useSubtitlerProjects();

  // Get user and Igel mode status from auth store
  const { user, igelModus } = useAuthStore();

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
        const validSteps = ['select', 'mode-select', 'cut', 'edit', 'auto-processing', 'success'];
        if (validSteps.includes(event.state.step)) {
          setStep(event.state.step);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
      console.error("[SubtitlerPage] Did not receive a valid File object in uploadData", uploadData);
      setError("Fehler beim Empfangen der Videodatei vom Uploader.");
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

    // Go to mode selection step after upload
    setStep('mode-select');
  };

  // Start video processing (called after cut step)
  const handleProcessVideo = useCallback(async (segments: SubtitleSegment[] | null = null) => {
    if (!uploadInfo?.uploadId) {
      setError('Keine Upload-ID vorhanden.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const response = await axios.post(`${baseURL}/subtitler/process`, {
        uploadId: uploadInfo.uploadId,
        subtitlePreference: modePreference,
        stylePreference: stylePreference,
        heightPreference: heightPreference,
        segments: segments // Include cut segments if any
      }, {
        timeout: 900000
      });

      if (response.status === 202 && response.data?.status === 'processing') {
        console.log('[SubtitlerPage] Processing started for:', uploadInfo.uploadId);
      } else {
        throw new Error(response.data?.message || 'Unerwartete Antwort vom Server beim Start der Verarbeitung.');
      }
    } catch (error) {
      console.error('[SubtitlerPage] Error initiating video processing:', error);
      const axiosError = error as AxiosError<{ error?: string }>;
      setError(axiosError.response?.data?.error || axiosError.message || 'Fehler beim Starten der Videoverarbeitung.');
      setIsProcessing(false);
    }
  }, [uploadInfo?.uploadId, modePreference, stylePreference, heightPreference, baseURL]);

  // Handler for generating subtitles preview (stay in cut step)
  const handleGenerateSubtitlesPreview = useCallback(() => {
    console.log('[SubtitlerPage] Generating subtitles preview');
    setIsPreviewMode(true); // Set preview mode so polling won't navigate away
    handleProcessVideo(cutSegments);
  }, [handleProcessVideo, cutSegments]);

  // Handler for updating a single subtitle in the cut step
  const handleSubtitleUpdate = useCallback((index: number, newText: string) => {
    if (!subtitles) return;

    const blocks = subtitles.split('\n\n');
    if (index >= 0 && index < blocks.length) {
      const lines = blocks[index].split('\n');
      if (lines.length >= 2) {
        // Keep the time line, replace the text
        blocks[index] = lines[0] + '\n' + newText;
        setSubtitles(blocks.join('\n\n'));
      }
    }
  }, [subtitles]);

  // Cancel handler for upload and processing
  const handleCancel = useCallback(() => {
    console.log('[SubtitlerPage] Cancel requested');

    // Clear polling interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    // Send cleanup request if we have an uploadId
    if (uploadInfo?.uploadId) {
      console.log(`[SubtitlerPage] Sending cleanup for uploadId: ${uploadInfo.uploadId}`);
      navigator.sendBeacon(`${baseURL}/subtitler/cleanup/${uploadInfo.uploadId}`);
    }

    // Reset state
    setIsProcessing(false);
    setError(null);
    setOriginalVideoFile(null);
    setUploadInfo(null);
  }, [uploadInfo?.uploadId, baseURL]);

  // Effect for Polling the result endpoint
  useEffect(() => {
    // Only poll if we are processing and have an uploadId
    if (isProcessing && uploadInfo?.uploadId && !uploadInfo?.isFromProject) {
      const currentUploadId = uploadInfo.uploadId;

      pollingIntervalRef.current = setInterval(async () => {
        try {
          // Verwende axios direkt mit baseURL und füge modePreference, stylePreference, und heightPreference als Query-Parameter hinzu
          const resultResponse = await axios.get(`${baseURL}/subtitler/result/${currentUploadId}`, {
              params: {
                subtitlePreference: modePreference, // Use modePreference in polling
                stylePreference, // Include style preference in polling
                heightPreference // Include height preference in polling
              },
              // Header oder andere Axios-Konfigurationen könnten hier nötig sein
              // Beachte: Interceptors von apiClient (z.B. Auth Token) werden hier NICHT angewendet
          });
          const { status, subtitles: fetchedSubtitles, error: jobError } = resultResponse.data;

          if (status === 'complete') {
            if (pollingIntervalRef.current !== null) {
              clearInterval(pollingIntervalRef.current);
            }
            setSubtitles(fetchedSubtitles);
            setIsProcessing(false);
            // Only navigate to edit step if not in preview mode
            if (!isPreviewMode) {
              setStep('edit');
            }
            setIsPreviewMode(false); // Reset preview mode flag
          } else if (status === 'error') {
            console.error(`[SubtitlerPage] Processing error for ${currentUploadId}:`, jobError);
            if (pollingIntervalRef.current !== null) {
              clearInterval(pollingIntervalRef.current);
            }
            setError(jobError || 'Ein Fehler ist während der Verarbeitung aufgetreten.');
            setIsProcessing(false);
          } else if (status === 'processing') {
            // Still processing, continue polling
          } else if (status === 'not_found') {
             console.error(`[SubtitlerPage] Job not found for ${currentUploadId}. Stopping polling.`);
             if (pollingIntervalRef.current !== null) {
               clearInterval(pollingIntervalRef.current);
             }
             setError('Verarbeitungsjob nicht gefunden. Bitte erneut versuchen.');
             setIsProcessing(false);
             setStep('upload'); // Reset to upload
          }
        } catch (pollError) {
          console.error(`[SubtitlerPage] Error during polling for ${currentUploadId}:`, pollError);
          if (pollingIntervalRef.current !== null) {
            clearInterval(pollingIntervalRef.current);
          }
          setError('Fehler bei der Statusabfrage der Verarbeitung.');
          setIsProcessing(false);
        }
      }, 5000); // Poll every 5 seconds

      // Cleanup function to clear interval when component unmounts or dependencies change
      return () => {
        if (pollingIntervalRef.current !== null) {
          clearInterval(pollingIntervalRef.current);
        }
      };
    }

    // Cleanup if isProcessing becomes false before interval is set (e.g. error in handleVideoConfirm)
    if (!isProcessing && pollingIntervalRef.current !== null) {
       clearInterval(pollingIntervalRef.current);
    }

  }, [isProcessing, uploadInfo?.uploadId, modePreference, stylePreference, isPreviewMode]); // Dependencies: run effect when isProcessing or uploadId changes

  const handleExport = useCallback(async (receivedExportToken: string) => {
    console.log('[SubtitlerPage] Export initiated with token:', receivedExportToken);

    // Auto-create project if one doesn't exist (for share functionality)
    if (!loadedProject?.id && !autoSavedProjectId && uploadInfo?.uploadId) {
      try {
        const projectData = {
          uploadId: uploadInfo.uploadId,
          subtitles: subtitles || '',
          title: uploadInfo.name?.replace(/\.[^/.]+$/, '') || `Projekt ${new Date().toLocaleDateString('de-DE')}`,
          stylePreference,
          heightPreference,
          modePreference,
          videoMetadata: uploadInfo.metadata || {},
          videoFilename: uploadInfo.name || 'video.mp4',
          videoSize: uploadInfo.size || 0
        };

        const savedProject = await saveProject(projectData);
        if (savedProject?.id) {
          setAutoSavedProjectId(savedProject.id);
          console.log('[SubtitlerPage] Auto-created project for sharing:', savedProject.id);
        }
      } catch (err) {
        console.warn('[SubtitlerPage] Failed to auto-create project:', err);
      }
    }

    setStep('success');
  }, [loadedProject?.id, autoSavedProjectId, uploadInfo, subtitles, stylePreference, heightPreference, modePreference, saveProject]);

  const handleExportComplete = useCallback(() => {
    // Export completion is now handled by the store
    console.log('[SubtitlerPage] Export completed');
  }, []);

  const handleReset = useCallback(() => {
    setIsExiting(true);

    // Send cleanup signal before reset (das neue System übernimmt automatisch)
    if (uploadInfo?.uploadId) {
      console.log(`[SubtitlerPage] Manual cleanup on reset for uploadId: ${uploadInfo.uploadId}`);
      // Sende Cleanup-Request, aber das neue System entscheidet über das Timing
      fetch(`${baseURL}/subtitler/cleanup/${uploadInfo.uploadId}`, { method: 'DELETE' })
        .catch(error => console.warn('[SubtitlerPage] Cleanup request failed:', error));
    }

    // Clear any active polling interval on reset
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    // Reset export store
    resetExport();

    setTimeout(() => {
      setStep('select');
      setOriginalVideoFile(null);
      setUploadInfo(null);
      setCutSegments(null);
      setSubtitles(null);
      setError(null);
      setIsExiting(false);
      setIsProcessing(false);
      setLoadedProject(null);
      setSelectedEditMode(null);
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
    setStylePreference(style);
  }, []);

  const handleModeSelect = useCallback((mode: string) => {
    setModePreference(mode);
  }, []);

  const handleHeightSelect = useCallback((height: string) => {
    setHeightPreference(height);
  }, []);

  const handleStyleConfirm = useCallback(() => {
    setStep('edit');
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
        userId: user?.id || null
      });

      if (response.status === 202) {
        console.log('[SubtitlerPage] Auto processing started for:', uploadInfo.uploadId);
      }
    } catch (error) {
      console.error('[SubtitlerPage] Error starting auto processing:', error);
      const axiosError = error as AxiosError<{ error?: string }>;
      setError(axiosError.response?.data?.error || 'Fehler beim Starten der automatischen Verarbeitung.');
      setStep('mode-select');
    }
  }, [uploadInfo?.uploadId, user?.id]);

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
    setStep('mode-select');
  }, []);

  // Handler for selecting editing mode (subtitle-only vs full video editing vs auto)
  const handleEditModeSelect = useCallback((mode: EditMode) => {
    setSelectedEditMode(mode);

    if (mode === 'subtitle') {
      // Skip VideoEditor - directly trigger processing and go to SubtitleEditor
      handleProcessVideo(null); // null segments = use full video
      setStep('edit');
    } else if (mode === 'full-edit') {
      // Go to VideoEditor for full editing
      setStep('cut');
    } else if (mode === 'auto') {
      // Go to automatic processing screen
      handleStartAutoProcessing();
      setStep('auto-processing');
    }
  }, [handleProcessVideo, handleStartAutoProcessing]);

  // Handler for selecting a saved project from ProjectSelector
  const handleSelectProject = useCallback(async (projectId: string) => {
    try {
      setError(null);
      setIsProcessing(true);
      setLoadingProjectId(projectId);

      const project = await loadProject(projectId);

      if (project) {
        setLoadedProject(project as LoadedProject);
        setSubtitles(project.subtitles ?? '');
        setStylePreference(project.style_preference || 'standard');
        setHeightPreference(project.height_preference || 'standard');
        setModePreference(project.mode_preference ?? 'manual');

        // Set upload info from project data with streaming video URL
        setUploadInfo({
          uploadId: project.id,
          metadata: project.video_metadata ? {
            duration: project.video_metadata.duration,
            width: project.video_metadata.width,
            height: project.video_metadata.height
          } : undefined,
          name: project.video_filename ?? undefined,
          size: project.video_size ?? undefined,
          isFromProject: true,
          videoUrl: `${baseURL}/subtitler/projects/${project.id}/video`
        });

        // Navigate immediately - video streams from URL
        setStep('edit');
      }
    } catch (err) {
      console.error('[SubtitlerPage] Failed to load project:', err);
      setError('Projekt konnte nicht geladen werden');
    } finally {
      setIsProcessing(false);
      setLoadingProjectId(null);
    }
  }, [loadProject, baseURL]);

  // Funktion zum Umschalten des Profi-Modus (erwartet jetzt den neuen Wert)
  const toggleProMode = useCallback((newIsActive: boolean) => {
    setIsProModeActive(newIsActive);
  }, []);

  return (
    <ErrorBoundary>
      <div className="subtitler-container">
        {/* Check for maintenance mode first */}
        {IS_SUBTITLER_UNDER_MAINTENANCE ? (
          <MaintenanceNotice featureName="Grünerator Reel-Studio" />
        ) : (
          <>
            {step === 'mode-select' && !isProcessing && (
              <h1 className="subtitler-title">Grünerator Reel-Studio</h1>
            )}

            {error && (
              <div className="error-message">
                {error}
                <button className="btn-secondary" onClick={() => setError(null)}>
                  Schließen
                </button>
              </div>
            )}

            <div className={`subtitler-content ${step === 'edit' ? 'full-width' : ''}`}>
              {step === 'select' && (
                <ProjectSelector
                  onSelectProject={handleSelectProject}
                  onUpload={handleUploadComplete as (uploadData: { originalFile: File; uploadId: string; metadata: { duration?: number; width?: number; height?: number }; name: string; size: number; type: string }) => void}
                  loadingProjectId={loadingProjectId}
                  projects={projects as unknown as Array<{ id: string; title: string; thumbnail_path?: string; video_metadata?: { duration?: number; width?: number; height?: number }; last_edited_at?: string; video_size?: number }>}
                  isLoading={isProjectsLoading}
                  onDeleteProject={deleteProject}
                />
              )}

              {step === 'mode-select' && (
                <ModeSelector
                  onSelect={handleEditModeSelect}
                  videoFile={originalVideoFile}
                />
              )}

              {step === 'auto-processing' && (
                <AutoProcessingScreen
                  uploadId={uploadInfo?.uploadId}
                  onComplete={handleAutoProcessingComplete}
                  onError={handleAutoProcessingError}
                />
              )}

              {step === 'cut' && (!isProcessing || isPreviewMode) && (
                <VideoEditor
                  videoUrl={originalVideoFile ? URL.createObjectURL(originalVideoFile) : null}
                  videoFile={originalVideoFile}
                  videoMetadata={uploadInfo?.metadata}
                  uploadId={uploadInfo?.uploadId}
                  onGenerateSubtitles={handleGenerateSubtitlesPreview}
                  subtitles={subtitles ?? undefined}
                  isGeneratingSubtitles={isProcessing && isPreviewMode}
                  stylePreference={stylePreference}
                  heightPreference={heightPreference}
                  onSubtitleUpdate={handleSubtitleUpdate}
                />
              )}

              {step === 'cut' && isProcessing && !isPreviewMode && (
                <ProcessingIndicator
                  onCancel={handleCancel}
                  error={error}
                />
              )}

              {step === 'edit' && isProcessing && selectedEditMode === 'subtitle' && (
                <ProcessingIndicator
                  onCancel={handleCancel}
                  error={error}
                />
              )}

              {step === 'edit' && (!isProcessing || selectedEditMode !== 'subtitle') && subtitles && uploadInfo?.uploadId && (
                <>
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
                    isExporting={exportStatus === 'starting' || exportStatus === 'exporting' || isGenerating}
                    loadedProject={loadedProject as { id: string; [key: string]: unknown } | null | undefined}
                    videoMetadataFromUpload={uploadInfo.metadata ?? undefined}
                    videoFilename={uploadInfo.name ?? undefined}
                    videoSize={uploadInfo.size ?? undefined}
                  />
                </>
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
                  projectTitle={loadedProject?.title || (autoSavedProjectId ? 'Auto-Video' : undefined)}
                  videoUrl={
                    selectedEditMode === 'auto' && uploadInfo?.uploadId
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
      </div>
    </ErrorBoundary>
  );
};

export default withAuthRequired(SubtitlerPage, {
  title: 'Reel-Studio',
  message: 'Anmeldung für Reel-Studio erforderlich'
});

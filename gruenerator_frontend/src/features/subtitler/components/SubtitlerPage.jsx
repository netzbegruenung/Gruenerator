import React, { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import apiClient from '../../../components/utils/apiClient';
import VideoUploader from './VideoUploader';
import SubtitleEditor from './SubtitleEditor';
import SuccessScreen from './SuccessScreen';
import ProjectSelector from './ProjectSelector';
import useSocialTextGenerator from '../hooks/useSocialTextGenerator';
import { useSubtitlerExportStore } from '../../../stores/subtitlerExportStore';
import { useSubtitlerProjectStore } from '../../../stores/subtitlerProjectStore';
import { FaVideo, FaFileVideo, FaRuler, FaClock, FaUserCog } from 'react-icons/fa';
import ErrorBoundary from '../../../components/ErrorBoundary';
import MaintenanceNotice from '../../../components/common/MaintenanceNotice';
import FeatureToggle from '../../../components/common/FeatureToggle';
import { useAuthStore } from '../../../stores/authStore';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';

import '../styles/subtitler.css';
import '../styles/ConfirmSection.css';
import '../styles/SubtitleEditor.css';
import '../styles/SuccessScreen.css';
import '../styles/VideoUploader.css';
import '../styles/live-subtitle-preview.css';
import '../styles/ProjectSelector.css';

// --- Maintenance Flag ---
// Set to true to enable maintenance mode for this page
const IS_SUBTITLER_UNDER_MAINTENANCE = false;
// ------------------------

const SubtitlerPage = () => {
  const [step, setStep] = useState('select');
  const [originalVideoFile, setOriginalVideoFile] = useState(null); // Original File-Objekt
  const [uploadInfo, setUploadInfo] = useState(null); // Upload-ID, Metadaten und Präferenz
  const [subtitles, setSubtitles] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [isExiting, setIsExiting] = useState(false);
  const { socialText, isGenerating, error: socialError, generateSocialText, reset: resetSocialText } = useSocialTextGenerator();
  const [subtitlePreference, setSubtitlePreference] = useState('manual'); // Legacy parameter kept for backward compatibility
  const [stylePreference, setStylePreference] = useState('shadow'); // Style preference for subtitle appearance (default: Empfohlen)
  const [modePreference, setModePreference] = useState('manual'); // New mode preference for subtitle generation type
  const [heightPreference, setHeightPreference] = useState('standard'); // Height preference for subtitle positioning
  const [isProModeActive, setIsProModeActive] = useState(false);
  const [loadedProject, setLoadedProject] = useState(null); // Track loaded project for editing
  const [loadingProjectId, setLoadingProjectId] = useState(null); // Track which project is loading

  // Use centralized export store
  const exportStore = useSubtitlerExportStore();
  const { status: exportStatus, exportToken, resetExport } = exportStore;

  // Use project store for loading saved projects
  const { loadProject, saveProject, updateProject, currentProject, projects, fetchProjects } = useSubtitlerProjectStore();

  // Get Igel mode status from auth store
  const { igelModus } = useAuthStore();

  // Skip to upload if no projects exist
  useEffect(() => {
    if (step === 'select') {
      fetchProjects().then(() => {
        const { projects: currentProjects } = useSubtitlerProjectStore.getState();
        if (currentProjects.length === 0) {
          setStep('upload');
        }
      });
    }
  }, [step, fetchProjects]);

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
    const handlePopState = (event) => {
      if (event.state?.step) {
        const validSteps = ['select', 'upload', 'confirm', 'edit', 'success'];
        if (validSteps.includes(event.state.step)) {
          setStep(event.state.step);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const pollingIntervalRef = useRef(null); // Ref für Polling Interval

  // Dynamically set baseURL based on environment
  const isDevelopment = import.meta.env.VITE_APP_ENV === 'development';
  const baseURL = isDevelopment ? 'http://localhost:3001/api' : `${window.location.origin}/api`;

  // Cleanup effect for tab close detection
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (uploadInfo?.uploadId) {
        console.log(`[SubtitlerPage] Sending cleanup beacon for uploadId: ${uploadInfo.uploadId}`);
        // Use beacon API for reliable cleanup signal even when tab is closing
        // Das neue Cleanup-System plant automatisch Cleanup, daher ist das als Backup gedacht
        navigator.sendBeacon(`${baseURL}/subtitler/cleanup/${uploadInfo.uploadId}`);
      }
    };
    
    const handleVisibilityChange = () => {
      // Zusätzlicher Cleanup-Trigger bei Tab-Wechsel (falls Upload läuft)
      if (document.visibilityState === 'hidden' && isProcessing && uploadInfo?.uploadId) {
        console.log(`[SubtitlerPage] Tab hidden during processing, sending cleanup signal for: ${uploadInfo.uploadId}`);
        navigator.sendBeacon(`${baseURL}/subtitler/cleanup/${uploadInfo.uploadId}`);
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup function
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [uploadInfo?.uploadId, baseURL, isProcessing]);

  const handleUploadComplete = (uploadData) => { 
    // Überprüfe, ob ein gültiges File-Objekt übergeben wurde
    if (uploadData.originalFile instanceof File) {
      // Speichere das originale File-Objekt direkt
      setOriginalVideoFile(uploadData.originalFile);
      console.log('[SubtitlerPage] Original video file stored:', uploadData.originalFile);
    } else {
      console.error("[SubtitlerPage] Did not receive a valid File object in uploadData", uploadData);
      setError("Fehler beim Empfangen der Videodatei vom Uploader.");
      setStep('upload'); // Gehe zurück zum Upload-Schritt
      return; 
    }
  
    // Speichere andere Upload-Infos separat
    setUploadInfo({
      uploadId: uploadData.uploadId,
      metadata: uploadData.metadata,
      name: uploadData.name,
      size: uploadData.size,
      type: uploadData.type,
    });
  
    setStep('confirm');
  };

  const handleVideoConfirm = async () => {
    setError(null); // Reset error on new attempt
    setIsProcessing(true); // Set processing true to show spinner and trigger polling
    
    try {

      if (!uploadInfo?.uploadId) {
        throw new Error('Keine Upload-ID gefunden');
      }

      // Start processing request with mode, style, and height preferences
      const response = await axios.post(`${baseURL}/subtitler/process`, { 
        uploadId: uploadInfo.uploadId, 
        subtitlePreference: modePreference, // Use modePreference as the main parameter
        stylePreference: stylePreference, // Include style preference
        heightPreference: heightPreference // Include height preference
      }, {
        // Header oder andere Axios-Konfigurationen könnten hier nötig sein
        // Beachte: Interceptors von apiClient (z.B. Auth Token) werden hier NICHT angewendet
        timeout: 900000 // Beispiel: Timeout manuell setzen, falls benötigt
      });

      // Check if backend accepted the request (Status 202 with status 'processing')
      if (response.status === 202 && response.data?.status === 'processing') {
        // Processing started successfully, polling will be handled by useEffect
      } else {
        // Unexpected response from /process endpoint
        throw new Error(response.data?.message || 'Unerwartete Antwort vom Server beim Start der Verarbeitung.');
      }

    } catch (error) {
      console.error('[SubtitlerPage] Error initiating video processing:', error);
      setError(error.response?.data?.error || error.message || 'Fehler beim Starten der Videoverarbeitung.');
      setIsProcessing(false); // Stop processing state if initiation failed
    }
    // No finally block setting isProcessing to false here, polling handles it
  };

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
            clearInterval(pollingIntervalRef.current);
            setSubtitles(fetchedSubtitles);
            setIsProcessing(false);
            setStep('edit'); // Go directly to editor with inline styling
          } else if (status === 'error') {
            console.error(`[SubtitlerPage] Processing error for ${currentUploadId}:`, jobError);
            clearInterval(pollingIntervalRef.current);
            setError(jobError || 'Ein Fehler ist während der Verarbeitung aufgetreten.');
            setIsProcessing(false);
          } else if (status === 'processing') {
            // Still processing, continue polling
          } else if (status === 'not_found') {
             console.error(`[SubtitlerPage] Job not found for ${currentUploadId}. Stopping polling.`);
             clearInterval(pollingIntervalRef.current);
             setError('Verarbeitungsjob nicht gefunden. Bitte erneut versuchen.');
             setIsProcessing(false);
             setStep('upload'); // Reset to upload
          }
        } catch (pollError) {
          console.error(`[SubtitlerPage] Error during polling for ${currentUploadId}:`, pollError);
          clearInterval(pollingIntervalRef.current);
          setError('Fehler bei der Statusabfrage der Verarbeitung.');
          setIsProcessing(false);
        }
      }, 5000); // Poll every 5 seconds

      // Cleanup function to clear interval when component unmounts or dependencies change
      return () => {
        clearInterval(pollingIntervalRef.current);
      };
    }

    // Cleanup if isProcessing becomes false before interval is set (e.g. error in handleVideoConfirm)
    if (!isProcessing && pollingIntervalRef.current) {
       clearInterval(pollingIntervalRef.current);
    }

  }, [isProcessing, uploadInfo?.uploadId, modePreference, stylePreference]); // Dependencies: run effect when isProcessing or uploadId changes

  const handleExport = useCallback(async (receivedExportToken) => {
    // The export token is now managed by the store
    console.log('[SubtitlerPage] Export initiated with token:', receivedExportToken);

    // Move to success screen immediately when export starts
    setStep('success');
  }, []);

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
      setSubtitles(null);
      setError(null);
      setIsExiting(false);
      setIsProcessing(false);
      setLoadedProject(null);
      resetSocialText();
    }, 300);
  }, [resetSocialText, uploadInfo?.uploadId, baseURL, resetExport]);

  // Function to go back to the editor without resetting everything
  const handleEditAgain = useCallback(() => {
    setStep('edit');
    // No reset of other states like videoFile, subtitles, etc.
  }, []);

  // New handlers for styling step
  const handleStyleSelect = useCallback((style) => {
    setStylePreference(style);
  }, []);

  const handleModeSelect = useCallback((mode) => {
    setModePreference(mode);
  }, []);

  const handleHeightSelect = useCallback((height) => {
    setHeightPreference(height);
  }, []);

  const handleStyleConfirm = useCallback(() => {
    setStep('edit');
  }, []);

  const handleBackToConfirm = useCallback(() => {
    setStep('confirm');
  }, []);

  // Handler for selecting a saved project from ProjectSelector
  const handleSelectProject = useCallback(async (projectId) => {
    try {
      setError(null);
      setIsProcessing(true);
      setLoadingProjectId(projectId);

      const project = await loadProject(projectId);

      if (project) {
        setLoadedProject(project);
        setSubtitles(project.subtitles || '');
        setStylePreference(project.style_preference || 'standard');
        setHeightPreference(project.height_preference || 'standard');
        setModePreference(project.mode_preference || 'manual');

        // Set upload info from project data with streaming video URL
        setUploadInfo({
          uploadId: project.id,
          metadata: project.video_metadata,
          name: project.video_filename,
          size: project.video_size,
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
  }, [loadProject]);

  // Handler for starting a new project
  const handleNewProject = useCallback(() => {
    setLoadedProject(null);
    setOriginalVideoFile(null);
    setUploadInfo(null);
    setSubtitles(null);
    setStylePreference('shadow'); // Default to Empfohlen
    setHeightPreference('standard');
    setModePreference('manual');
    setStep('upload');
  }, []);

  // Handler to go back to project selection
  const handleBackToSelect = useCallback(() => {
    setStep('select');
  }, []);

  // Funktion zum Umschalten des Profi-Modus (erwartet jetzt den neuen Wert)
  const toggleProMode = useCallback((newIsActive) => {
    setIsProModeActive(newIsActive);
  }, []);

  return (
    <ErrorBoundary>
      <div className="subtitler-container container with-header">
        {/* Check for maintenance mode first */}
        {IS_SUBTITLER_UNDER_MAINTENANCE ? (
          <MaintenanceNotice featureName="Grünerator Reel-Studio" />
        ) : (
          <>
            {(step === 'upload' || step === 'confirm') && (
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
                  onNewProject={handleNewProject}
                  loadingProjectId={loadingProjectId}
                />
              )}

              {step === 'upload' && (
                <VideoUploader
                  onUpload={handleUploadComplete}
                  onBack={projects.length > 0 ? handleBackToSelect : null}
                  isProcessing={isProcessing}
                />
              )}

              {step === 'confirm' && uploadInfo && (
                <div className={`confirm-section ${isExiting ? 'exit' : ''}`}>
                  <h3>
                    <FaVideo />
                    Dein ausgewähltes Video
                  </h3>
                  <div className="VideoInfo">
                    <div className="VideoInfo__Item">
                      <span className="VideoInfo__Label">Name</span>
                      <span className="VideoInfo__Icon"><FaFileVideo /></span>
                      <span className="VideoInfo__Content">{uploadInfo.name}</span>
                    </div>
                    <div className="VideoInfo__Item">
                      <span className="VideoInfo__Label">Größe</span>
                      <span className="VideoInfo__Icon"><FaRuler /></span>
                      <span className="VideoInfo__Content">{(uploadInfo.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                    {uploadInfo.metadata && (
                      <>
                        <div className="VideoInfo__Item">
                          <span className="VideoInfo__Label">Länge</span>
                          <span className="VideoInfo__Icon"><FaClock /></span>
                          <span className="VideoInfo__Content">{Math.round(uploadInfo.metadata.duration)} Sekunden</span>
                        </div>
                        <div className="VideoInfo__Item">
                          <span className="VideoInfo__Label">Auflösung</span>
                          <span className="VideoInfo__Icon"><FaRuler /></span>
                          <span className="VideoInfo__Content">{uploadInfo.metadata.width}x{uploadInfo.metadata.height}</span>
                        </div>
                      </>
                    )}
                  </div>
                  <p className="ai-notice">
                    Die Verarbeitung erfolgt mit AssemblyAI auf EU-Servern mit automatischer Datenlöschung nach der Transkription (Zero Data Retention). Bitte beachte unsere <a href="/datenschutz">Datenschutzerklärung</a> bezüglich der Verarbeitung deiner Daten.
                  </p>


                  <div className="confirm-buttons">
                    <button 
                      className="btn-primary"
                      onClick={handleVideoConfirm}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <div className="button-loading-content">
                          <div className="button-spinner" />
                          <span>Verarbeite...</span>
                        </div>
                      ) : (
                        'Video verarbeiten'
                      )}
                    </button>
                    <button 
                      className="btn-secondary"
                      onClick={handleReset}
                      disabled={isProcessing}
                    >
                      Anderes Video auswählen
                    </button>
                  </div>
                </div>
              )}

              {step === 'edit' && (
                <>
                  {/* Profi-Modus Schalter */}
                  {/* <FeatureToggle
                    isActive={isProModeActive}
                    onToggle={toggleProMode} // Übergibt direkt den neuen booleschen Wert
                    label="Profi-Modus"
                    icon={FaUserCog} // Passendes Icon für Einstellungen/Profi
                    description="Zeiten bearbeiten und Segmente löschen (auf eigene Gefahr)."
                    className="subtitler-pro-toggle" // Eigene Klasse für spezifisches Styling falls nötig
                  /> */}
                   {/* {isProModeActive && <p className="pro-mode-warning">Achtung: Änderungen an Zeiten oder das Löschen von Segmenten kann die Synchronisation beeinträchtigen.</p>} */}

                  <SubtitleEditor
                    videoFile={originalVideoFile}
                    videoUrl={uploadInfo?.videoUrl}
                    subtitles={subtitles}
                    uploadId={uploadInfo?.uploadId}
                    subtitlePreference={subtitlePreference}
                    stylePreference={stylePreference}
                    heightPreference={heightPreference}
                    onStyleChange={handleStyleSelect}
                    onHeightChange={handleHeightSelect}
                    onExportSuccess={handleExport}
                    onExportComplete={handleExportComplete}
                    isExporting={exportStatus === 'starting' || exportStatus === 'exporting' || isGenerating}
                    loadedProject={loadedProject}
                    videoMetadataFromUpload={uploadInfo?.metadata}
                    videoFilename={uploadInfo?.name}
                    videoSize={uploadInfo?.size}
                  />
                </>
              )}

              {step === 'success' && (
                <SuccessScreen
                  onReset={handleReset}
                  onEditAgain={handleEditAgain}
                  isLoading={exportStatus === 'starting' || exportStatus === 'exporting'}
                  socialText={socialText}
                  uploadId={exportToken || uploadInfo?.uploadId}
                  isGeneratingSocialText={isGenerating}
                  onGenerateSocialText={() => generateSocialText(subtitles)}
                  projectId={loadedProject?.id}
                  projectTitle={loadedProject?.title}
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
  title: 'Grünerator Reel-Studio',
  message: 'Anmeldung erforderlich für das Grünerator Reel-Studio'
});
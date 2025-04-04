import React, { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios'; // Import axios
import VideoUploader from './VideoUploader';
import SubtitleEditor from './SubtitleEditor';
import SuccessScreen from './SuccessScreen';
import useSocialTextGenerator from '../hooks/useSocialTextGenerator';
import { FaVideo, FaFileVideo, FaRuler, FaClock } from 'react-icons/fa';
import ErrorBoundary from '../../../components/ErrorBoundary';

const SubtitlerPage = () => {
  const [step, setStep] = useState('upload');
  const [originalVideoFile, setOriginalVideoFile] = useState(null); // Original File-Objekt
  const [uploadInfo, setUploadInfo] = useState(null); // Upload-ID und Metadaten
  const [subtitles, setSubtitles] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [isExiting, setIsExiting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { socialText, isGenerating, error: socialError, generateSocialText, reset: resetSocialText } = useSocialTextGenerator();

  const pollingIntervalRef = useRef(null); // Ref für Polling Interval

  // Dynamically set baseURL based on environment
  const isDevelopment = import.meta.env.VITE_APP_ENV === 'development';
  const baseURL = isDevelopment ? 'http://localhost:3001/api' : `${window.location.origin}/api`;

  const handleVideoSelect = (fileWithMetadata) => {
    // Speichere das originale File-Objekt
    const originalFile = new File([fileWithMetadata], fileWithMetadata.name, {
      type: fileWithMetadata.type
    });
    setOriginalVideoFile(originalFile);

    // Speichere Upload-Info separat
    setUploadInfo({
      uploadId: fileWithMetadata.uploadId,
      metadata: fileWithMetadata.metadata,
      name: fileWithMetadata.name,
      size: fileWithMetadata.size,
      type: fileWithMetadata.type
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

      // Start processing request - Verwende axios direkt mit baseURL
      const response = await axios.post(`${baseURL}/subtitler/process`, { 
        uploadId: uploadInfo.uploadId 
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
    if (isProcessing && uploadInfo?.uploadId) {
      const currentUploadId = uploadInfo.uploadId;

      pollingIntervalRef.current = setInterval(async () => {
        try {
          // Verwende axios direkt mit baseURL
          const resultResponse = await axios.get(`${baseURL}/subtitler/result/${currentUploadId}`, {
              // Header oder andere Axios-Konfigurationen könnten hier nötig sein
              // Beachte: Interceptors von apiClient (z.B. Auth Token) werden hier NICHT angewendet
          });
          const { status, subtitles: fetchedSubtitles, error: jobError } = resultResponse.data;

          if (status === 'complete') {
            clearInterval(pollingIntervalRef.current);
            setSubtitles(fetchedSubtitles);
            setIsProcessing(false);
            setStep('edit');
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

  }, [isProcessing, uploadInfo?.uploadId]); // Dependencies: run effect when isProcessing or uploadId changes

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      await generateSocialText(subtitles);
      setStep('success');
    } catch (err) {
      console.error('[SubtitlerPage] Export error:', err);
      setError('Fehler beim Generieren des Beitragstextes');
    }
  }, [generateSocialText, subtitles]);

  const handleExportComplete = useCallback(() => {
    setIsExporting(false);
  }, []);

  const handleReset = useCallback(() => {
    setIsExiting(true);
    // Clear any active polling interval on reset
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setTimeout(() => {
      setStep('upload');
      setOriginalVideoFile(null);
      setUploadInfo(null); // Clear uploadInfo too
      setSubtitles(null);
      setError(null);
      setIsExiting(false);
      setIsExporting(false);
      setIsProcessing(false); // Ensure processing is false
      resetSocialText();
    }, 300);
  }, [resetSocialText]);

  return (
    <ErrorBoundary>
      <div className="subtitler-container container with-header">
        {(step === 'upload' || step === 'confirm') && (
          <h1 className="subtitler-title">Reel-Grünerator</h1>
        )}
        
        {error && (
          <div className="error-message">
            {error}
            <button className="btn-secondary" onClick={() => setError(null)}>
              Schließen
            </button>
          </div>
        )}

        <div className="subtitler-content">
          {step === 'upload' && (
            <VideoUploader 
              onUpload={handleVideoSelect} 
              isProcessing={isProcessing} 
            />
          )}

          {step === 'confirm' && uploadInfo && (
            <div className={`confirm-section ${isExiting ? 'exit' : ''}`}>
              <h3>
                <FaVideo />
                Dein ausgewähltes Video
              </h3>
              <div className="video-info">
                <p data-label="Name">
                  <FaFileVideo />
                  <span className="info-content">{uploadInfo.name}</span>
                </p>
                <p data-label="Größe">
                  <FaRuler />
                  <span className="info-content">{(uploadInfo.size / 1024 / 1024).toFixed(2)} MB</span>
                </p>
                {uploadInfo.metadata && (
                  <>
                    <p data-label="Länge">
                      <FaClock />
                      <span className="info-content">{Math.round(uploadInfo.metadata.duration)} Sekunden</span>
                    </p>
                    <p data-label="Auflösung">
                      <FaRuler />
                      <span className="info-content">{uploadInfo.metadata.width}x{uploadInfo.metadata.height}</span>
                    </p>
                  </>
                )}
              </div>
              <p className="ai-notice">
                Die Verarbeitung erfolgt mit OpenAI in den USA. Bitte beachte unsere <a href="/datenschutz">Datenschutzerklärung</a> bezüglich der Verarbeitung deiner Daten.
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
            <SubtitleEditor
              videoFile={originalVideoFile}
              subtitles={subtitles}
              uploadId={uploadInfo?.uploadId}
              onExportSuccess={handleExport}
              onExportComplete={handleExportComplete}
              isExporting={isExporting || isGenerating}
            />
          )}

          {step === 'success' && (
            <SuccessScreen 
              onReset={handleReset}
              isLoading={isExporting}
              socialText={socialText}
              isGeneratingSocial={isGenerating}
              socialError={socialError}
            />
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default SubtitlerPage;
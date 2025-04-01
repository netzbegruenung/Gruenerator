import React, { useState, useCallback, useEffect, useRef } from 'react';
import VideoUploader from './VideoUploader';
import SubtitleEditor from './SubtitleEditor';
import SuccessScreen from './SuccessScreen';
import apiClient from '../../../components/utils/apiClient';
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

  const handleVideoSelect = (fileWithMetadata) => {
    console.log('[SubtitlerPage] Received file from VideoUploader:', {
      name: fileWithMetadata.name,
      size: fileWithMetadata.size,
      type: fileWithMetadata.type,
      metadata: fileWithMetadata.metadata,
      uploadId: fileWithMetadata.uploadId
    });

    // Ensure uploadId URL uses HTTPS
    const uploadId = fileWithMetadata.uploadId.replace('http://', 'https://');
    
    // Speichere das originale File-Objekt
    const originalFile = new File([fileWithMetadata], fileWithMetadata.name, {
      type: fileWithMetadata.type
    });
    setOriginalVideoFile(originalFile);

    // Speichere Upload-Info separat
    setUploadInfo({
      uploadId: uploadId,
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
      console.log('[SubtitlerPage] Starting video processing request with uploadId:', uploadInfo.uploadId);

      if (!uploadInfo?.uploadId) {
        throw new Error('Keine Upload-ID gefunden');
      }

      // Start processing request
      const response = await apiClient.post('/subtitler/process', { 
        uploadId: uploadInfo.uploadId 
      });

      console.log('[SubtitlerPage] Process initiation response:', response.data);

      // Check if backend accepted the request (Status 202 with status 'processing')
      if (response.status === 202 && response.data?.status === 'processing') {
        // Processing started successfully, polling will be handled by useEffect
        console.log('[SubtitlerPage] Backend confirmed processing started. Polling will begin.');
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
      console.log(`[SubtitlerPage] Starting polling for uploadId: ${currentUploadId}`);

      pollingIntervalRef.current = setInterval(async () => {
        try {
          console.log(`[SubtitlerPage] Polling status for ${currentUploadId}...`);
          const resultResponse = await apiClient.get(`/subtitler/result/${currentUploadId}`);
          const { status, subtitles: fetchedSubtitles, error: jobError } = resultResponse.data;

          console.log(`[SubtitlerPage] Polling response for ${currentUploadId}:`, resultResponse.data);

          if (status === 'complete') {
            console.log(`[SubtitlerPage] Processing complete for ${currentUploadId}. Subtitles received.`);
            clearInterval(pollingIntervalRef.current);
            setSubtitles(fetchedSubtitles);
            setIsProcessing(false);
            setStep('edit');
          } else if (status === 'error') {
            console.error(`[SubtitlerPage] Processing error for ${currentUploadId}:`, jobError);
            clearInterval(pollingIntervalRef.current);
            setError(jobError || 'Ein Fehler ist während der Verarbeitung aufgetreten.');
            setIsProcessing(false);
             // Optional: Reset step? Oder Fehlermeldung im Confirm-Screen anzeigen lassen?
             // setStep('confirm'); // oder 'upload'
          } else if (status === 'processing') {
            // Still processing, continue polling
            console.log(`[SubtitlerPage] Still processing ${currentUploadId}...`);
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
        console.log(`[SubtitlerPage] Cleaning up polling interval for ${currentUploadId}`);
        clearInterval(pollingIntervalRef.current);
      };
    }

    // Cleanup if isProcessing becomes false before interval is set (e.g. error in handleVideoConfirm)
    if (!isProcessing && pollingIntervalRef.current) {
       console.log('[SubtitlerPage] Cleaning up polling interval due to isProcessing becoming false.');
       clearInterval(pollingIntervalRef.current);
    }

  }, [isProcessing, uploadInfo?.uploadId]); // Dependencies: run effect when isProcessing or uploadId changes

  const handleExport = useCallback(async () => {
    console.log('[SubtitlerPage] Starting export with subtitles:', subtitles);
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